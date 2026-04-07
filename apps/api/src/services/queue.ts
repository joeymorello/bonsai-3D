import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const reconstructionQueue = new Queue("reconstruction", { connection });

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
  const job = await reconstructionQueue.add("reconstruct", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    ...opts,
  });
  return job.id ?? data.jobId;
}

export async function getJobStatus(jobId: string) {
  const job = await reconstructionQueue.getJob(jobId);
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
