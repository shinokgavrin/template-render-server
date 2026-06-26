import { renderMedia, selectComposition } from "@remotion/renderer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import https from "node:https";
import http from "node:http";

// 🔥 Функция для безопасного скачивания файла сразу на жесткий диск (0% RAM)
function downloadFileToDisk(url: string, dest: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(dest);
		const client = url.startsWith("https") ? https : http;
		
		client.get(url, (response) => {
			if (response.statusCode === 301 || response.statusCode === 302) {
				return downloadFileToDisk(response.headers.location!, dest).then(resolve).catch(reject);
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
			// 🔥 ШАГ 1: ЛОКАЛИЗАЦИЯ ТЯЖЕЛОГО ВИДЕО 🔥
			let originalUrl = job.inputProps.originalVideoUrl;
			if (originalUrl && originalUrl.startsWith("http")) {
				console.log(`[Localizer] Downloading huge remote video to local SSD...`);
				await downloadFileToDisk(originalUrl, localInputVideoPath);
				
				// Подменяем ссылку на локальный сервер (Remotion будет читать с диска)
				job.inputProps.originalVideoUrl = `http://localhost:${port}/renders/input_${jobId}.mp4`;
				console.log(`[Localizer] Download complete! Using local URL for perfect smooth rendering.`);
			}

			const composition = await selectComposition({
				serveUrl,
				id: job.composition,
				inputProps: job.inputProps,
			});

			let isCancelled = false;
			job.cancel = () => {
				isCancelled = true;
				job.status = "failed";
				job.error = "Render cancelled by user";
			};

			// 🔥 ШАГ 2: БЕЗОПАСНЫЙ РЕНДЕР 🔥
			await renderMedia({
				composition,
				serveUrl,
				codec: "h264",
				outputLocation: outPath,
				inputProps: job.inputProps,
				
				concurrency: 1, 
				imageFormat: "jpeg", 
				jpegQuality: 80,
				timeoutInMilliseconds: 3600000, 
				
				chromiumOptions: {
					args: [
						"--disable-dev-shm-usage", 
						"--no-sandbox",
					],
				},
				
				onProgress: (progress) => {
					if (isCancelled) return;
					job.progress = progress;
				},
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
			// 🔥 ШАГ 3: УБОРКА МУСОРА 🔥
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
