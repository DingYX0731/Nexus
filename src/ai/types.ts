export type AiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AiJob {
  jobId: string;
  status: AiJobStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  tailFrameUrl?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  error?: string;
}

export interface TextToVideoInput {
  prompt: string;
  durationSec?: number;
  aspect?: '9:16' | '16:9' | '1:1';
}

export interface ImageToVideoInput {
  imageUrl: string;
  prompt: string;
  durationSec?: number;
}

export interface VideoGenProvider {
  readonly name: string;
  textToVideo(input: TextToVideoInput): Promise<{ jobId: string }>;
  imageToVideo(input: ImageToVideoInput): Promise<{ jobId: string }>;
  getJob(jobId: string): Promise<AiJob>;
}
