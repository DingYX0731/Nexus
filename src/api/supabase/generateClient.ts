import { supabase } from '@/api/client';
import type { Video } from '@/api/types';
import { rowToVideo } from './mappers';
import type { VideoWithStatsRow } from './rows';

export interface GenerateArgs {
  kind: 'text' | 'continuation' | 'remix';
  prompt: string;
  parentTailFrameUrl?: string;
  parentId?: string;
  aspect?: '9:16' | '16:9';
}

export async function callGenerate(args: GenerateArgs): Promise<Video> {
  const { data, error } = await supabase().functions.invoke('generate-video', { body: args });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return rowToVideo(data as VideoWithStatsRow);
}
