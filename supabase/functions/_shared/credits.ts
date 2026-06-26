export function applyCharge(balance: number, cost: number): { ok: boolean; next: number } {
  if (balance < cost) return { ok: false, next: balance };
  return { ok: true, next: balance - cost };
}
