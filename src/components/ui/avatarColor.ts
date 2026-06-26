const AVATAR_COLORS = ['#fe2c55', '#25f4ee', '#ff6b9d', '#7ad7ff', '#ffd166', '#a06cd5', '#8ad27a', '#ff9f7a'];

export function avatarColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
