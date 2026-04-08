import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

function createConnection(): IORedis {
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
  });
}

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue("reconstruction", {
      connection: createConnection(),
    });
  }
  return _queue;
}

export const reconstructionQueue = getQueue();

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
