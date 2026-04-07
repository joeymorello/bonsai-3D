import "dotenv/config";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { processReconstruction } from "./processors/reconstruction.js";
import { processExport } from "./processors/export.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const reconstructionWorker = new Worker(
  "reconstruction",
  async (job: Job) => {
    console.log(`[reconstruction] Processing job ${job.id} — ${job.name}`);
    await processReconstruction(job);
  },
  {
    connection,
    concurrency: 2,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
);

const exportWorker = new Worker(
  "export",
  async (job: Job) => {
    console.log(`[export] Processing job ${job.id} — ${job.name}`);
    await processExport(job);
  },
  {
    connection,
    concurrency: 4,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
);

reconstructionWorker.on("completed", (job) => {
  console.log(`[reconstruction] Job ${job.id} completed`);
});

reconstructionWorker.on("failed", (job, err) => {
  console.error(`[reconstruction] Job ${job?.id} failed:`, err.message);
});

exportWorker.on("completed", (job) => {
  console.log(`[export] Job ${job.id} completed`);
});

exportWorker.on("failed", (job, err) => {
  console.error(`[export] Job ${job?.id} failed:`, err.message);
});

async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.all([
    reconstructionWorker.close(),
    exportWorker.close(),
  ]);
  await connection.quit();
  console.log("Workers shut down gracefully.");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Workers started. Waiting for jobs...");
