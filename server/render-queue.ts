import { renderMedia, selectComposition } from "@remotion/renderer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import https from "node:https";
import http from "node:http";

function downloadFileToDisk(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const client = url.startsWith("https") ? https : http;
        
        client.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFileToDisk(response.headers.location!, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`Download failed with status ${response.statusCode}`));
            }
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve();
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
        
        // Массив для отслеживания всех локально скачанных файлов для их гарантированного удаления в конце
        const downloadedLocalPaths: string[] = [];

        try {
            // 1. СКАЧИВАНИЕ ОСНОВНОГО ВИДЕО ПРЕЗЕНТЕРА
            let originalUrl = job.inputProps.originalVideoUrl;
            if (originalUrl && originalUrl.startsWith("http")) {
                console.log(`[Localizer] Downloading huge remote video to local SSD...`);
                await downloadFileToDisk(originalUrl, localInputVideoPath);
                
                const stats = fs.statSync(localInputVideoPath);
                if (stats.size < 1024 * 1024) { 
                    throw new Error("Downloaded video is suspiciously small (< 1MB). The download failed or link is broken.");
                }
                
                job.inputProps.originalVideoUrl = `http://localhost:${port}/renders/input_${jobId}.mp4`;
                downloadedLocalPaths.push(localInputVideoPath);
                console.log(`[Localizer] Download complete! Valid file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB.`);
            }

            // 2. АВТОМАТИЧЕСКАЯ ЛОКАЛИЗАЦИЯ ВСЕХ ОВЕРЛЕЕВ (УБИВАЕТ CORS НАКОРНЮ)
            if (job.inputProps.actions && Array.isArray(job.inputProps.actions)) {
                console.log(`[Localizer] Pre-downloading ${job.inputProps.actions.length} action assets to local SSD to bypass CORS...`);
                for (let i = 0; i < job.inputProps.actions.length; i++) {
                    const action = job.inputProps.actions[i];
                    if (action.url && action.url.startsWith("http") && !action.url.includes(`localhost:${port}`)) {
                        const fileExt = action.url.split('.').pop()?.split('?')[0] || 'mp4';
                        const localFileName = `asset_${jobId}_${i}.${fileExt}`;
                        const localPath = path.join(rendersDir, localFileName);
                        
                        try {
                            console.log(`[Localizer] Downloading asset ${i}: ${action.url} -> ${localPath}`);
                            await downloadFileToDisk(action.url, localPath);
                            
                            const stats = fs.statSync(localPath);
                            if (stats.size > 0) {
                                // Подменяем удаленный адрес R2 на локальный Express-адрес
                                action.url = `http://localhost:${port}/renders/${localFileName}`;
                                downloadedLocalPaths.push(localPath);
                            }
                        } catch (downloadErr) {
                            console.error(`[Localizer] Failed to pre-download asset ${action.url}:`, downloadErr);
                        }
                    }
                    
                    // Также локализуем звуки переходов, если они есть
                    if (action.transition_sound && action.transition_sound.startsWith("http") && !action.transition_sound.includes(`localhost:${port}`)) {
                        const fileExt = action.transition_sound.split('.').pop()?.split('?')[0] || 'mp3';
                        const localFileName = `sound_${jobId}_${i}.${fileExt}`;
                        const localPath = path.join(rendersDir, localFileName);
                        
                        try {
                            console.log(`[Localizer] Downloading transition sound ${i}: ${action.transition_sound} -> ${localPath}`);
                            await downloadFileToDisk(action.transition_sound, localPath);
                            
                            const stats = fs.statSync(localPath);
                            if (stats.size > 0) {
                                action.transition_sound = `http://localhost:${port}/renders/${localFileName}`;
                                downloadedLocalPaths.push(localPath);
                            }
                        } catch (downloadErr) {
                            console.error(`[Localizer] Failed to pre-download sound ${action.transition_sound}:`, downloadErr);
                        }
                    }
                }
                console.log(`[Localizer] Pre-downloading complete!`);
            }

            const composition = await selectComposition({
                serveUrl,
                id: job.composition,
                inputProps: job.inputProps,
            });

            let isCancelled = false;
            job.cancel = () => {
                isCancelled = true;
            };

            await new Promise(async (resolve, reject) => {
                let watchdogTimer = setTimeout(() => {
                    reject(new Error("Watchdog Timeout: Engine is completely frozen for 3 minutes."));
                }, 3 * 60 * 1000);

                try {
                    await renderMedia({
                        composition,
                        serveUrl,
                        codec: "h264",
                        outputLocation: outPath,
                        inputProps: job.inputProps,
                        fps: composition.fps, 
                        concurrency: 4, 
                        imageFormat: "jpeg", 
                        jpegQuality: 80, 
                        crf: 23,
                        pixelFormat: "yuv420p",
                        chromiumOptions: {
                            args: [
                                "--disable-dev-shm-usage",
                                "--no-sandbox",
                                "--disable-setuid-sandbox",
                                "--disable-web-security", // Полный обход CORS
                                "--user-data-dir=/tmp/chrome-user-data", 
                                "--disable-blink-features=AutomationControlled",
                                "--autoplay-policy=no-user-gesture-required",
                                "--video-buffer-size-mb=512",
                                "--enable-features=OffthreadVideoDecode"
                            ],
                        },
                        onBrowserLog: (log) => {
                            if (log.type === 'error' && (log.text.includes('ERR_FAILED') || log.text.includes('CORS') || log.text.includes('net::')) && !log.text.includes('Access-Control-Allow-Origin')) {
                                reject(new Error(`Chromium Fatal Error Detected: ${log.text}`));
                            }
                        },
                        onProgress: (progress) => {
                            if (isCancelled) return reject(new Error("Render cancelled by user"));
                            
                            job.progress = progress;
                            
                            clearTimeout(watchdogTimer);
                            watchdogTimer = setTimeout(() => {
                                reject(new Error(`Watchdog Timeout: Render stuck at ${(progress * 100).toFixed(1)}% for 3 minutes.`));
                            }, 3 * 60 * 1000);
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
                    console.log(`[R2 Upload] Starting direct upload for job ${jobId}...`);
                    
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
                    
                    console.log(`[R2 Upload] Upload complete!`);
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
            
            // Гарантированная очистка абсолютно всех локальных временных файлов на диске
            console.log(`[Localizer] Cleaning up temporary files...`);
            for (const localPath of downloadedLocalPaths) {
                if (fs.existsSync(localPath)) {
                    try {
                        fs.unlinkSync(localPath);
                    } catch (unlinkErr) {
                        console.error(`Failed to delete local asset ${localPath}:`, unlinkErr);
                    }
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
