import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

let _connection: IORedis | null = null;
let _queue: Queue | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    _connection.on("error", (err) => {
      // Suppress noisy connection errors in dev when Redis is not running
      if (process.env.NODE_ENV !== "production") return;
      console.error("Redis connection error:", err.message);
    });
  }
  return _connection;
}

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue("reconstruction", { connection: getConnection() });
  }
  return _queue;
}

export const reconstructionQueue = new Proxy({} as Queue, {
  get(_target, prop, receiver) {
    const queue = getQueue();
    const value = (queue as any)[prop];
    if (typeof value === "function") {
      return value.bind(queue);
    }
    return value;
  },
});

export interface ReconstructionJobData {
  workspaceId: string;
  jobId: string;
  provider: "meshy" | "hunyuan" | "trellis" | "photogrammetry";
  imageUrls: string[];
}

export async function enqueueReconstructionJob(
  data: ReconstructionJobData,
  opts?: JobsOptions,
): Promise<string> {
  const queue = getQueue();
  const job = await queue.add("reconstruct", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    ...opts,
  });
  return job.id ?? data.jobId;
}

export async function getJobStatus(jobId: string) {
  const queue = getQueue();
  const job = await queue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: job.id,
    state,
    progress: job.progress,
    data: job.data as ReconstructionJobData,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}
