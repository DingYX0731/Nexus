import { supabase } from '@/api/client';
import type { Comment } from '@/store/comments';
import { rowToComment } from './mappers';
import type { CommentRow } from './rows';

const SELECT = '*, author:profiles!comments_author_id_fkey(*)';

export async function listCommentsRemote(videoId: string): Promise<Comment[]> {
  const { data, error } = await supabase()
    .from('comments').select(SELECT)
    .eq('video_id', videoId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data as CommentRow[]).map(rowToComment);
}

export async function addCommentRemote(videoId: string, body: string, authorId: string, parentId: string | null): Promise<Comment> {
  const { data, error } = await supabase()
    .from('comments').insert({ video_id: videoId, body, author_id: authorId, parent_id: parentId })
    .select(SELECT).single();
  if (error) throw error;
  return rowToComment(data as CommentRow);
}
