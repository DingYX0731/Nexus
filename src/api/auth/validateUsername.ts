export interface Validation {
  ok: boolean;
  msg?: string;
}

const USERNAME_RE = /^[a-zA-Z0-9_一-龥]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(raw: string): Validation {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, msg: '请输入用户名' };
  if (name.length < 2) return { ok: false, msg: '用户名至少 2 个字符' };
  if (name.length > 20) return { ok: false, msg: '用户名最多 20 个字符' };
  if (!USERNAME_RE.test(name)) return { ok: false, msg: '只允许字母、数字、下划线和中文' };
  return { ok: true };
}

export function validateEmail(raw: string): Validation {
  const email = raw.trim();
  if (email.length === 0) return { ok: false, msg: '请输入邮箱' };
  if (!EMAIL_RE.test(email)) return { ok: false, msg: '邮箱格式不正确' };
  return { ok: true };
}

export function validatePassword(raw: string): Validation {
  if (raw.length < 6) return { ok: false, msg: '密码至少 6 位' };
  return { ok: true };
}

export function validateBio(raw: string): Validation {
  if (raw.length > 80) return { ok: false, msg: '简介最多 80 个字符' };
  return { ok: true };
}
