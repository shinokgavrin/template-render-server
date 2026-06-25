import { renderMedia, selectComposition } from "@remotion/renderer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

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

	// Создаем директорию для хранения готовых видеофайлов, если она отсутствует
	if (!fs.existsSync(rendersDir)) {
		fs.mkdirSync(rendersDir, { recursive: true });
	}

	const processQueue = async () => {
		if (activeJobId) return;

		// Находим первую задачу со статусом "queued" в очереди
		const nextJobEntry = Array.from(jobs.entries()).find(
			([_, job]) => job.status === "queued"
		);

		if (!nextJobEntry) return;

		const [jobId, job] = nextJobEntry;
		activeJobId = jobId;
		job.status = "in-progress";

		try {
			const outPath = path.join(rendersDir, `${jobId}.mp4`);
			
			// Динамически выбираем композицию и передаем в нее входные параметры из запроса
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

			// Запускаем рендеринг видеофайла
			await renderMedia({
				composition,
				serveUrl,
				codec: "h264",
				outputLocation: outPath,
				inputProps: job.inputProps,
				onProgress: (progress) => {
					if (isCancelled) return;
					job.progress = progress;
				},
			});

			if (!isCancelled) {
				job.status = "done";
				job.progress = 1;
				job.outPath = `/renders/${jobId}.mp4`;
			}
		} catch (err: any) {
			job.status = "failed";
			job.error = err.message || String(err);
			console.error(`Error rendering job ${jobId}:`, err);
		} finally {
			activeJobId = null;
			// Переходим к следующей задаче в очереди
			processQueue();
		}
	};

	const createJob = (args: {
		composition?: string;
		inputProps?: any;
		titleText?: string;
	} = {}) => {
		const jobId = randomUUID();
		
		// Сверхнадежное автоопределение параметров для полной совместимости:
		// Если передан старый HelloWorld-запрос с titleText, либо если композиция HelloWorld —
		// мы автоматически перенаправляем её на нашу рабочую композицию SmirnoffDigest.
		let composition = args.composition || "SmirnoffDigest";
		let inputProps = args.inputProps || {};

		if (composition === "HelloWorld" || !composition) {
			composition = "SmirnoffDigest";
		}

		// Если передан старый аргумент titleText, сохраняем его в свойствах
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
		
		// Запускаем выполнение очереди асинхронно
		processQueue();

		return jobId;
	};

	return {
		jobs,
		createJob,
	};
}
