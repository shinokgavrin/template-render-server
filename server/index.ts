import express from "express";
import { makeRenderQueue } from "./render-queue";
import { bundle } from "@remotion/bundler";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";

const { PORT = 3000, REMOTION_SERVE_URL } = process.env;

function setupApp({ remotionBundleUrl }: { remotionBundleUrl: string }) {
  const app = express();
  const rendersDir = path.resolve("renders");

  // Инициализируем очередь рендеринга
  const queue = makeRenderQueue({
    port: Number(PORT),
    serveUrl: remotionBundleUrl,
    rendersDir,
  });

  // Раздаем готовые видеофайлы из папки /renders
  app.use("/renders", express.static(rendersDir));
  app.use(express.json());

  // ✅ УНИВЕРСАЛЬНЫЙ ЭНДПОИНТ ДЛЯ ЗАПУСКА РЕНДЕРИНГА
  // Принимает как стандартный URL "/renders", так и ваш "/render" для полной совместимости с n8n!
  const renderHandler = async (req: express.Request, res: express.Response) => {
    // Извлекаем название композиции (по умолчанию SmirnoffDigest)
    const composition = req.body?.composition || "SmirnoffDigest";
    
    // Извлекаем входные параметры (оригинальное видео и массив действий)
    const inputProps = req.body?.inputProps || {};

    if (typeof composition !== "string") {
      res.status(400).json({ message: "composition must be a string" });
      return;
    }

    if (typeof inputProps !== "object") {
      res.status(400).json({ message: "inputProps must be an object" });
      return;
    }

    // Создаем задачу в очереди, передавая выбранную композицию и параметры
    const jobId = queue.createJob({
      composition,
      inputProps,
    });

    res.json({ jobId });
  };

  // Регистрируем обработчик на оба эндпоинта для исключения ошибок 404
  app.post("/render", renderHandler);
  app.post("/renders", renderHandler);

  // Получение статуса задачи рендеринга
  app.get("/renders/:jobId", (req, res) => {
    const jobId = req.params.jobId;
    const job = queue.jobs.get(jobId);

    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return;
    }

    res.json(job);
  });

  // Отмена активной задачи рендеринга
  app.delete("/renders/:jobId", (req, res) => {
    const jobId = req.params.jobId;
    const job = queue.jobs.get(jobId);

    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return;
    }

    if (job.status !== "queued" && job.status !== "in-progress") {
      res.status(400).json({ message: "Job is not cancellable" });
      return;
    }

    job.cancel();
    res.json({ message: "Job cancelled" });
  });

  return app;
}

async function main() {
  // Гарантируем наличие Chromium в среде выполнения Railway
  await ensureBrowser();

  // Собираем проект Remotion в бандл
  const remotionBundleUrl = REMOTION_SERVE_URL
    ? REMOTION_SERVE_URL
    : await bundle({
        entryPoint: path.resolve("remotion/index.ts"),
        onProgress(progress) {
          console.info(`Bundling Remotion project: ${progress}%`);
        },
      });

  const app = setupApp({ remotionBundleUrl });

  app.listen(PORT, () => {
    console.info(`Server is running on port ${PORT}`);
  });
}

main();
