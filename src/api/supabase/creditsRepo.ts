import { supabase } from '@/api/client';

export async function getBalanceRemote(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from('credits').select('balance').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.balance as number | undefined) ?? 0;
}

/**
 * 调用 grant_credits RPC 向当前用户发放体验额度（云端落库）。
 * 返回发放后的最新余额。
 */
export async function grantCreditsRemote(amount: number): Promise<number> {
  const { data, error } = await supabase().rpc('grant_credits', { p_amount: amount });
  if (error) throw error;
  return (data as number | null) ?? 0;
}
