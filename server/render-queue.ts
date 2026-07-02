import { renderMedia, selectComposition } from "@remotion/renderer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import https from "node:https";
import http from "node:http";
import express from "express";
import { URL } from "node:url";

// Безопасное извлечение расширения файла из URL, очистка от query-параметров (?token=...)
function getFileExtension(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const ext = pathname.split('.').pop()?.toLowerCase() || '';
        return ext || 'mp4';
    } catch {
        return url.split('.').pop()?.split('?')[0] || 'mp4';
    }
}

function downloadFileToDisk(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const client = url.startsWith("https") ? https : http;
        
        const options = {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "*/*",
                "Connection": "keep-alive"
            }
        };
        
        client.get(url, options, (response) => {
            if ([301, 302, 307, 308].includes(response.statusCode || 0)) {
                return downloadFileToDisk(response.headers.location!, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`Download failed with status ${response.statusCode} for: ${url}`));
            }
            
            const file = fs.createWriteStream(dest);
            response.pipe(file);
            
            file.on("finish", () => {
                file.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            file.on("error", (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        }).on("error", (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

export type Job = {
    id: string;
    status: "queued" | "in-progress" | "done" | "failed";
    composition: string;
    inputProps: any;
    progress: number;
    outPath: string | null;
    error: string | null;
    cancel: () => void;
};

export function makeRenderQueue({
    port,
    serveUrl,
    rendersDir,
}: {
    port: number;
    serveUrl: string;
    rendersDir: string;
}) {
    const jobs = new Map<string, Job>();
    let activeJobId: string | null = null;

    if (!fs.existsSync(rendersDir)) {
        fs.mkdirSync(rendersDir, { recursive: true });
    }

    // 🔥 АВТОНОМНЫЙ МИКРО-СЕРВЕР ДЛЯ РАЗДАЧИ АССЕТОВ С ПОЛНЫМ CORS
    const assetApp = express();
    assetApp.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "*");
        res.header("Access-Control-Expose-Headers", "Content-Length, Content-Range");
        next();
    });
    assetApp.use(express.static(rendersDir));
    const assetServer = assetApp.listen(0);
    
    const getAssetPort = () => {
        const addr = assetServer.address();
        return addr && typeof addr === 'object' ? addr.port : 3000;
    };

    const processQueue = async () => {
        if (activeJobId) return;

        const nextJobEntry = Array.from(jobs.entries()).find(
            ([_, job]) => job.status === "queued"
        );

        if (!nextJobEntry) return;

        const [jobId, job] = nextJobEntry;
        activeJobId = jobId;
        job.status = "in-progress";

        const localInputVideoPath = path.join(rendersDir, `input_${jobId}.mp4`);
        const outPath = path.join(rendersDir, `${jobId}.mp4`);
        
        const downloadedLocalPaths: string[] = [];
        const currentAssetPort = getAssetPort();

        try {
            // 1. СКАЧИВАЕМ ОСНОВНОЕ ВИДЕО
            let originalUrl = job.inputProps.originalVideoUrl;
            if (originalUrl && originalUrl.startsWith("http")) {
                console.log(`[Localizer] Downloading main video...`);
                await downloadFileToDisk(originalUrl, localInputVideoPath);
                
                const stats = fs.statSync(localInputVideoPath);
                if (stats.size === 0) { 
                    throw new Error("Downloaded video is empty (0 bytes). Link is broken.");
                }
                
                job.inputProps.originalVideoUrl = `http://localhost:${currentAssetPort}/input_${jobId}.mp4`;
                downloadedLocalPaths.push(localInputVideoPath);
            }

            // 2. СКАЧИВАЕМ ВСЕ КАРТИНКИ, ВИДЕО И ЗВУКИ (И УДАЛЯЕМ БИТЫЕ ССЫЛКИ)
            if (job.inputProps.actions && Array.isArray(job.inputProps.actions)) {
                for (let i = 0; i < job.inputProps.actions.length; i++) {
                    const action = job.inputProps.actions[i];
                    
                    // Локализация визуальной графики (картинки, видео, GIF)
                    if (action.url && action.url.startsWith("http") && !action.url.includes(`localhost:${currentAssetPort}`)) {
                        const fileExt = getFileExtension(action.url);
                        const localFileName = `asset_${jobId}_${i}.${fileExt}`;
                        const localPath = path.join(rendersDir, localFileName);
                        
                        try {
                            await downloadFileToDisk(action.url, localPath);
                            if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
                                action.url = `http://localhost:${currentAssetPort}/${localFileName}`;
                                downloadedLocalPaths.push(localPath);
                            } else {
                                delete action.url; // Удаляем битую ссылку, чтобы не крашить Remotion
                            }
                        } catch (e) {
                            console.warn(`[Warning] Failed to download asset (404/Error), skipping: ${action.url}`);
                            delete action.url; // Удаляем битую ссылку, чтобы не крашить Remotion
                        }
                    }
                    
                    // Локализация звуков переходов (SFX)
                    if (action.transition_sound && action.transition_sound.startsWith("http") && !action.transition_sound.includes(`localhost:${currentAssetPort}`)) {
                        const fileExt = getFileExtension(action.transition_sound);
                        const localFileName = `sound_${jobId}_${i}.${fileExt}`;
                        const localPath = path.join(rendersDir, localFileName);
                        
                        try {
                            await downloadFileToDisk(action.transition_sound, localPath);
                            if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
                                action.transition_sound = `http://localhost:${currentAssetPort}/${localFileName}`;
                                downloadedLocalPaths.push(localPath);
                            } else {
                                delete action.transition_sound; // Удаляем битую ссылку
                            }
                        } catch (e) {
                            console.warn(`[Warning] Failed to download sound (404/Error), skipping: ${action.transition_sound}`);
                            delete action.transition_sound; // Удаляем битую ссылку, чтобы не крашить Remotion
                        }
                    }
                }
            }

            const composition = await selectComposition({
                serveUrl,
                id: job.composition,
                inputProps: job.inputProps,
            });

            let isCancelled = false;
            job.cancel = () => { isCancelled = true; };

            await new Promise(async (resolve, reject) => {
                let watchdogTimer = setTimeout(() => {
                    reject(new Error("Watchdog Timeout: Engine is completely frozen for 10 minutes."));
                }, 10 * 60 * 1000);

                try {
                    await renderMedia({
                        composition,
                        serveUrl,
                        codec: "h264",
                        outputLocation: outPath,
                        inputProps: job.inputProps,
                        fps: composition.fps, 
                        concurrency: 1, // Строго 1 поток
                        imageFormat: "jpeg", 
                        jpegQuality: 75, // Снижено качество для экономии оперативной памяти
                        crf: 23,
                        pixelFormat: "yuv420p",
                        chromiumOptions: {
                            args: [
                                "--disable-dev-shm-usage",
                                "--no-sandbox",
                                "--disable-setuid-sandbox",
                                "--disable-web-security", 
                                "--user-data-dir=/tmp/chrome-user-data", 
                                "--autoplay-policy=no-user-gesture-required",
                                // ❌ Опасные флаги работы с памятью удалены
                            ],
                        },
                        onBrowserLog: (log) => {
                            if (log.type === 'error' && 
                               (log.text.includes('ERR_FAILED') || log.text.includes('CORS') || log.text.includes('net::')) && 
                               !log.text.includes('Access-Control-Allow-Origin')) {
                                reject(new Error(`Chromium Fatal Error Detected: ${log.text}`));
                            }
                        },
                        onProgress: (progress) => {
                            if (isCancelled) return reject(new Error("Render cancelled"));
                            job.progress = progress;
                            clearTimeout(watchdogTimer);
                            watchdogTimer = setTimeout(() => {
                                reject(new Error(`Render stuck at ${(progress * 100).toFixed(1)}%`));
                            }, 10 * 60 * 1000);
                        },
                    });
                    
                    clearTimeout(watchdogTimer); 
                    resolve(true);
                } catch (err) {
                    clearTimeout(watchdogTimer);
                    reject(err);
                }
            });

            if (!isCancelled) {
                if (process.env.R2_ENDPOINT && process.env.R2_BUCKET_NAME) {
                    const s3Client = new S3Client({
                        region: "auto",
                        endpoint: process.env.R2_ENDPOINT,
                        credentials: {
                            accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
                            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
                        },
                    });

                    const fileStream = fs.createReadStream(outPath);
                    const fileName = `Smirnoff_Video_${jobId}.mp4`;

                    await s3Client.send(
                        new PutObjectCommand({
                            Bucket: process.env.R2_BUCKET_NAME,
                            Key: fileName,
                            Body: fileStream,
                            ContentType: "video/mp4",
                        })
                    );
                    
                    job.status = "done";
                    job.progress = 1;
                    job.outPath = `https://pub-9133209d2ae746859bab1bf8500330d4.r2.dev/${fileName}`;
                    fs.unlinkSync(outPath);
                } else {
                    job.status = "done";
                    job.progress = 1;
                    job.outPath = `/renders/${jobId}.mp4`;
                }
            }
        } catch (err: any) {
            job.status = "failed";
            job.error = err.message || String(err);
            console.error(`Error rendering job ${jobId}:`, err);
        } finally {
            activeJobId = null;
            
            // Уничтожаем все локальные файлы после рендера, чтобы не забивать диск
            for (const localPath of downloadedLocalPaths) {
                if (fs.existsSync(localPath)) {
                    try { fs.unlinkSync(localPath); } catch (e) {}
                }
            }
            processQueue();
        }
    };

    const createJob = (args: {
        composition?: string;
        inputProps?: any;
        titleText?: string;
    } = {}) => {
        const jobId = randomUUID();
        
        let composition = args.composition || "SmirnoffDigest";
        let inputProps = args.inputProps || {};

        if (composition === "HelloWorld" || !composition) {
            composition = "SmirnoffDigest";
        }

        if (args.titleText && Object.keys(inputProps).length === 0) {
            inputProps = { titleText: args.titleText };
        }
        
        const job: Job = {
            id: jobId,
            status: "queued",
            composition,
            inputProps,
            progress: 0,
            outPath: null,
            error: null,
            cancel: () => {
                job.status = "failed";
                job.error = "Cancelled before starting";
            },
        };

        jobs.set(jobId, job);
        processQueue();

        return jobId;
    };

    return {
        jobs,
        createJob,
    };
}
