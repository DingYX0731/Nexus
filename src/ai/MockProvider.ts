import type { AiJob, ImageToVideoInput, TextToVideoInput, VideoGenProvider } from './types';
import { MOCK_LIBRARY } from './mockLibrary';

interface JobState extends AiJob {
  createdAt: number;
  promptHint?: string;
}

const jobs = new Map<string, JobState>();

function pickFromLibrary(prompt: string): (typeof MOCK_LIBRARY)[number] {
  const lower = prompt.toLowerCase();
  const matched = MOCK_LIBRARY.find((m) => m.tags.some((t) => lower.includes(t)));
  if (matched) return matched;
  const idx = Math.floor((prompt.length * 7919) % MOCK_LIBRARY.length);
  return MOCK_LIBRARY[idx]!;
}

function newJob(promptHint?: string): JobState {
  const id = `mock_${Date.now()}_${Math.floor((promptHint?.length ?? 1) * 9301)}`;
  const job: JobState = { jobId: id, status: 'queued', createdAt: nowMs(), promptHint };
  jobs.set(id, job);
  return job;
}

function nowMs(): number {
  return new Date().getTime();
}

function advance(job: JobState): JobState {
  if (job.status === 'succeeded' || job.status === 'failed') return job;
  const elapsed = nowMs() - job.createdAt;
  if (elapsed > 2500) {
    const sample = pickFromLibrary(job.promptHint ?? '');
    job.status = 'succeeded';
    job.videoUrl = sample.videoUrl;
    job.thumbnailUrl = sample.thumbnailUrl;
    job.tailFrameUrl = sample.thumbnailUrl;
    job.durationMs = sample.durationMs;
    job.width = sample.width;
    job.height = sample.height;
  } else if (elapsed > 800) {
    job.status = 'running';
  }
  return job;
}

export const MockProvider: VideoGenProvider = {
  name: 'mock',

  async textToVideo(input: TextToVideoInput) {
    const job = newJob(input.prompt);
    return { jobId: job.jobId };
  },

  async imageToVideo(input: ImageToVideoInput) {
    const job = newJob(input.prompt);
    return { jobId: job.jobId };
  },

  async getJob(jobId: string): Promise<AiJob> {
    const job = jobs.get(jobId);
    if (!job) return { jobId, status: 'failed', error: 'job not found' };
    return advance(job);
  },
};
