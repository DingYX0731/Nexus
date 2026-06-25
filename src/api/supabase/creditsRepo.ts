import { supabase } from '@/api/client';

export async function getBalanceRemote(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from('credits').select('balance').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.balance as number | undefined) ?? 0;
}
