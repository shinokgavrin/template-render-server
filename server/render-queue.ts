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



        try {

            let originalUrl = job.inputProps.originalVideoUrl;

            if (originalUrl && originalUrl.startsWith("http")) {

                console.log(`[Localizer] Downloading huge remote video to local SSD...`);

                await downloadFileToDisk(originalUrl, localInputVideoPath);

               

                const stats = fs.statSync(localInputVideoPath);

                if (stats.size < 1024 * 1024) {

                    throw new Error("Downloaded video is suspiciously small (< 1MB). The download failed or link is broken.");

                }

               

                job.inputProps.originalVideoUrl = `http://localhost:${port}/renders/input_${jobId}.mp4`;

                console.log(`[Localizer] Download complete! Valid file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB.`);

            }



            // Здесь selectComposition загружает метаданные из Root.tsx и выставляет правильный composition.fps (например, 25)

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

                       

                        // Динамический FPS (остается без изменений)

                        fps: composition.fps,

                       

                        // 🔥 ФИКС СКОРОСТИ 1: Возвращаем многопоточность

                        // Теперь, когда нет проблем с памятью, мы можем рендерить несколько кадров за раз

                        concurrency: 2,

                       

                        imageFormat: "jpeg",

                        // 🔥 ФИКС СКОРОСТИ 2: Снижаем I/O нагрузку на SSD (визуально неотличимо от 90)

                        jpegQuality: 80,

                       

                        // 🔥 ФИКС СКОРОСТИ 3: Оптимальное качество (23 вместо тяжелых 18)

                        crf: 23,

                        pixelFormat: "yuv420p",

                       

                        chromiumOptions: {

                            args: [

                                "--disable-dev-shm-usage",

                                "--no-sandbox",

                                "--disable-setuid-sandbox",

                                "--disable-gpu",

                                "--disable-software-rasterizer",

                                "--disable-accelerated-video-decode",

                                "--disable-web-security",

                               

                                // 🔥 СЕКРЕТНОЕ ОРУЖИЕ ИЗ ФИДБЕКА: БУФЕРИЗАЦИЯ И МНОГОПОТОЧНОЕ ДЕКОДИРОВАНИЕ 🔥

                                "--video-buffer-size-mb=512", // Даем браузеру 512МБ оперативки чисто под кэширование кадров!

                                "--enable-features=OffthreadVideoDecode", // Заставляем Chromium читать эти кадры в отдельном изолированном потоке

                                "--disable-blink-features=AutomationControlled"

                            ],

                        },

                       

                        onBrowserLog: (log) => {

                            if (log.type === 'error' && (log.text.includes('ERR_FAILED') || log.text.includes('CORS') || log.text.includes('net::'))) {

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

            if (fs.existsSync(localInputVideoPath)) {

                fs.unlinkSync(localInputVideoPath);

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
