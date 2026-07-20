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

export async function addCommentRemote(videoId: string, body: string, authorId: string, parentId: string | null, replyToName: string | null): Promise<Comment> {
  const { data, error } = await supabase()
    .from('comments').insert({ video_id: videoId, body, author_id: authorId, parent_id: parentId, reply_to_name: replyToName })
    .select(SELECT).single();
  if (error) throw error;
  return rowToComment(data as CommentRow);
}

// 删除评论：RLS 策略 comments_delete_own 只允许作者删自己的。
// parent_id 设了 on delete cascade，删根评论会连带删掉楼内回复。
export async function deleteCommentRemote(commentId: string): Promise<void> {
  const { error } = await supabase().from('comments').delete().eq('id', commentId);
  if (error) throw error;
}
