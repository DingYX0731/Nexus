# MVP 后端搭建实现计划（账号与内容上云）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI Shorts 从纯前端 + 内存 store 迁移到 Supabase 真后端，实现真实邮箱账号、会话持久化、内容/点赞/评论/额度全量上云，并通过 Edge Function 中转豆包生成、把视频转存 Storage。

**Architecture:** 方案 A —— 保留现有 DAO 接缝（`src/api/videos.ts` 函数签名不变），新增 `src/api/supabase/*` 仓库实现，DAO 按 `hasSupabase` 选择走 Supabase 还是现有本地 Mock 保底。认证改 `supabase.auth`（邮箱+密码），session 用 AsyncStorage 持久化。视频生成走 Edge Function `generate-video`（豆包密钥服务端、生成后转存 Storage、service role 扣额度）。

**Tech Stack:** Expo SDK 54 / React Native 0.81 / TypeScript、Supabase（Postgres + Auth + Storage + Edge Functions/Deno）、zustand、@tanstack/react-query、vitest（单测纯函数层）、@react-native-async-storage/async-storage。

## Global Constraints

- 设计 spec：`docs/superpowers/specs/2026-06-24-mvp-backend-design.md`，所有任务以它为准。
- 本次范围仅 M2（账号与会话）+ M3（内容上云）。M4/M5 不实现。
- DAO 层 `src/api/videos.ts` 对外导出的函数签名**不得改变**：`listFeed()` / `listMyVideos(userId)` / `getVideo(id)` / `getVersionTree(rootId)` / `generateVideo(input)` / `continueVideo(input)` / `remixVideo(input)` / `publishEdit(input)` / `toggleLike(videoId, userId)` / `recordPlay(videoId)`。
- 必须保留 `hasSupabase=false` 保底：未配 Supabase 时全部走现有本地 Mock，App 仍可跑。
- 现有领域类型不改：`Video` / `Author` / `VideoStats` / `VersionNode` / `AuthUser`（`src/api/types.ts`）。Supabase 行通过 mapper 转成这些类型。
- 额度：初始 5（`FREE_INITIAL_CREDITS`），文生/续写/Remix 各扣 1，剪辑发布不扣。`credits.balance` 客户端只读，扣减只在 Edge Function 用 service role 完成。
- 提交信息以 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 结尾。
- 当前在 `main` 分支：实现前先开实现分支（执行计划的 skill 会处理；若手动，先 `git switch -c feat/supabase-backend`）。

---

## Phase 0：测试与依赖脚手架

### Task 0: 安装测试运行器与后端依赖

**Files:**
- Modify: `package.json`（scripts + devDependencies + dependencies）
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

**Interfaces:**
- Produces: `npm test`（跑 vitest）、`npm run test:run`（CI 单次跑）。供后续所有单测任务使用。

- [ ] **Step 1: 安装依赖**

```bash
npm install @react-native-async-storage/async-storage
npm install -D vitest
```

- [ ] **Step 2: 写 vitest 配置**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
```

- [ ] **Step 3: 写空 setup 文件**

Create `src/test/setup.ts`:

```ts
// vitest 全局 setup。当前无全局 mock,占位以便后续按需扩展。
export {};
```

- [ ] **Step 4: 加 npm scripts**

在 `package.json` 的 `"scripts"` 里加：

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: 写一个 sanity 测试并跑通**

Create `src/test/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm run test:run`
Expected: PASS（1 passed）

- [ ] **Step 6: typecheck 仍过**

Run: `npm run typecheck`
Expected: 无错误（exit 0）

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/
git commit -m "chore: 安装 vitest 与 AsyncStorage，搭建单测脚手架

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 1（M2）：数据库基础 — profiles + credits + 触发器 + RLS

### Task 1: 初始化 Supabase 项目结构与首个 migration（profiles/credits）

**Files:**
- Create: `supabase/config.toml`（`supabase init` 生成）
- Create: `supabase/migrations/0001_profiles_credits.sql`

**Interfaces:**
- Produces: 表 `public.profiles(id, username, avatar_url, created_at)`、`public.credits(user_id, balance)`、触发器 `on_auth_user_created`。后续仓库/Edge Function 依赖这些表。

> 说明：本任务是 SQL/配置，无 vitest 单测。验证方式是用 Supabase CLI 在本地起库并 `db reset` 应用 migration 不报错。若环境无法起本地 Docker，至少做 SQL 语法自检（见 Step 4）并在 Supabase 云项目 SQL Editor 手动执行。

- [ ] **Step 1: 安装并初始化 Supabase CLI**

```bash
npm install -D supabase
npx supabase init
```

（`supabase init` 会创建 `supabase/config.toml`。若提示已存在则跳过。）

- [ ] **Step 2: 写 migration**

Create `supabase/migrations/0001_profiles_credits.sql`:

```sql
-- profiles：用户公开资料，1:1 关联 auth.users
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- credits：用户额度
create table public.credits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance int not null default 5
);

alter table public.profiles enable row level security;
alter table public.credits  enable row level security;

-- profiles：所有人可读，只能改自己的
create policy "profiles_read_all" on public.profiles
  for select using (true);
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- credits：只能读自己的；客户端不能写（无 insert/update/delete policy → 默认拒绝）
create policy "credits_read_own" on public.credits
  for select using (user_id = auth.uid());

-- 新用户注册触发器：建 profile + credits
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8))
  );
  insert into public.credits (user_id, balance) values (new.id, 5);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: 本地应用 migration（若有 Docker）**

```bash
npx supabase start
npx supabase db reset
```

Expected: migration 0001 应用成功，无 SQL 错误。

> 若无 Docker：跳过本步，改为把 `0001_profiles_credits.sql` 内容贴到云项目 Dashboard → SQL Editor 执行，确认无报错。

- [ ] **Step 4: 验证表与触发器存在**

本地：`npx supabase db reset` 输出无错误即可；可选 `psql` 连本地库 `\dt public.*` 看到 profiles/credits。
云端：Dashboard → Table Editor 看到 profiles、credits 两张表。

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat(db): profiles + credits 表、RLS、新用户触发器 (M2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Supabase client 接入 AsyncStorage（会话持久化）

**Files:**
- Modify: `src/api/client.ts`

**Interfaces:**
- Consumes: 现有 `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `hasSupabase`。
- Produces: `supabase()` 返回的 client 使用 AsyncStorage 持久化 session。无签名变化。

> 说明：这是配置改动，无独立单测（client 创建依赖原生 AsyncStorage，单测环境跑不动）。验证靠 typecheck + 后续 Task 4 的手动会话测试。

- [ ] **Step 1: 改 client 配置**

修改 `src/api/client.ts`，在文件顶部加 import：

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
```

把 `createClient(...)` 的 auth 配置改为：

```ts
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "feat(auth): Supabase client 用 AsyncStorage 持久化 session

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 用户名校验提取为纯函数 + 单测

**Files:**
- Create: `src/api/auth/validateUsername.ts`
- Create: `src/api/auth/validateUsername.test.ts`
- Modify: `app/auth/login.tsx`（改为 import 该函数，删除内联副本）

**Interfaces:**
- Produces: `validateUsername(raw: string): { ok: boolean; msg?: string }`、`validateEmail(raw: string): { ok: boolean; msg?: string }`、`validatePassword(raw: string): { ok: boolean; msg?: string }`。供登录页与后续测试使用。

- [ ] **Step 1: 写失败测试**

Create `src/api/auth/validateUsername.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateUsername, validateEmail, validatePassword } from './validateUsername';

describe('validateUsername', () => {
  it('rejects empty', () => expect(validateUsername('').ok).toBe(false));
  it('rejects too short', () => expect(validateUsername('a').ok).toBe(false));
  it('rejects too long', () => expect(validateUsername('a'.repeat(21)).ok).toBe(false));
  it('rejects illegal chars', () => expect(validateUsername('bad name!').ok).toBe(false));
  it('accepts cjk', () => expect(validateUsername('小红').ok).toBe(true));
  it('accepts alnum_underscore', () => expect(validateUsername('kira_2024').ok).toBe(true));
});

describe('validateEmail', () => {
  it('rejects no-at', () => expect(validateEmail('foo.com').ok).toBe(false));
  it('accepts valid', () => expect(validateEmail('a@b.com').ok).toBe(true));
});

describe('validatePassword', () => {
  it('rejects under 6', () => expect(validatePassword('12345').ok).toBe(false));
  it('accepts 6+', () => expect(validatePassword('123456').ok).toBe(true));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/api/auth/validateUsername.test.ts`
Expected: FAIL（Cannot find module './validateUsername'）

- [ ] **Step 3: 写实现**

Create `src/api/auth/validateUsername.ts`:

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/api/auth/validateUsername.test.ts`
Expected: PASS（全部通过）

- [ ] **Step 5: 登录页改用该函数**

修改 `app/auth/login.tsx`：删除内联的 `USERNAME_RE`、`Validation` 接口、`validateUsername` 函数定义，改为顶部 import：

```ts
import { validateUsername } from '@/api/auth/validateUsername';
```

（其余登录页逻辑暂不动，Task 5 会重写为邮箱+密码。）

- [ ] **Step 6: typecheck + 测试**

Run: `npm run typecheck && npm run test:run`
Expected: 无类型错误，测试全过。

- [ ] **Step 7: Commit**

```bash
git add src/api/auth/ app/auth/login.tsx
git commit -m "refactor(auth): 提取 validateUsername/Email/Password 纯函数 + 单测

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: auth store 改真 Supabase Auth + 根布局恢复会话

**Files:**
- Modify: `src/store/auth.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `supabase()` from `src/api/client.ts`、`hasSupabase`。
- Produces: `useAuth` store 新增 `signUp(email, password, username): Promise<{ ok: boolean; error?: string }>`、`signIn(email, password): Promise<{ ok: boolean; error?: string }>`、`signOut(): Promise<void>`、`hydrateSession(): Promise<void>`、`setUserFromSession(user: AuthUser | null): void`。保留 `requireAuth(router)`、`signInMock(username)`（保底用）、`user`、`isAnonymous`。

> 说明：auth store 直接打 Supabase 网络，难做纯单测；本任务验证靠 typecheck + 手动会话测试（Step 6）。`requireAuth` 已是纯逻辑，Task 5 不改它。

- [ ] **Step 1: 重写 auth store**

修改 `src/store/auth.ts` 为：

```ts
import { create } from 'zustand';
import type { AuthUser } from '@/api/types';
import type { useRouter } from 'expo-router';
import { supabase, hasSupabase } from '@/api/client';

type RouterLike = ReturnType<typeof useRouter>;

interface AuthState {
  user: AuthUser | null;
  isAnonymous: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ ok: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  hydrateSession: () => Promise<void>;
  setUserFromSession: (user: AuthUser | null) => void;
  signInMock: (username: string) => void; // 保底：hasSupabase=false 时用
  requireAuth: (router: RouterLike) => boolean;
}

async function profileUsername(userId: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabase().from('profiles').select('username').eq('id', userId).single();
    return data?.username ?? fallback;
  } catch {
    return fallback;
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAnonymous: true,

  signUp: async (email, password, username) => {
    if (!hasSupabase) { get().signInMock(username); return { ok: true }; }
    const { data, error } = await supabase().auth.signUp({
      email, password, options: { data: { username } },
    });
    if (error) return { ok: false, error: error.message };
    const u = data.user;
    if (u) set({ user: { id: u.id, username }, isAnonymous: false });
    return { ok: true };
  },

  signIn: async (email, password) => {
    if (!hasSupabase) { get().signInMock(email.split('@')[0] ?? 'user'); return { ok: true }; }
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    const u = data.user;
    if (u) {
      const username = await profileUsername(u.id, email.split('@')[0] ?? 'user');
      set({ user: { id: u.id, username }, isAnonymous: false });
    }
    return { ok: true };
  },

  signOut: async () => {
    if (hasSupabase) { try { await supabase().auth.signOut(); } catch {} }
    set({ user: null, isAnonymous: true });
  },

  hydrateSession: async () => {
    if (!hasSupabase) return;
    try {
      const { data } = await supabase().auth.getSession();
      const u = data.session?.user;
      if (u) {
        const username = await profileUsername(u.id, u.email?.split('@')[0] ?? 'user');
        set({ user: { id: u.id, username }, isAnonymous: false });
      }
    } catch {}
  },

  setUserFromSession: (user) => set({ user, isAnonymous: !user }),

  signInMock: (username) =>
    set({ user: { id: `local_${username}`, username }, isAnonymous: false }),

  requireAuth: (router) => {
    if (get().user) return true;
    router.push('/auth/login');
    return false;
  },
}));
```

- [ ] **Step 2: 根布局启动恢复会话 + 订阅 authStateChange**

修改 `app/_layout.tsx`，在 import 区加：

```ts
import { useAuth } from '@/store/auth';
import { supabase, hasSupabase } from '@/api/client';
```

在 `RootLayout` 的现有 `useEffect`（已有 SplashScreen + preloadDemoVideos）里追加会话恢复，并新增一个订阅 effect：

```ts
  useEffect(() => {
    useAuth.getState().hydrateSession();
    if (!hasSupabase) return;
    const { data: sub } = supabase().auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      useAuth.getState().setUserFromSession(
        u ? { id: u.id, username: u.email?.split('@')[0] ?? 'user' } : null,
      );
    });
    return () => sub.subscription.unsubscribe();
  }, []);
```

- [ ] **Step 3: 修复 signInMock 调用点**

搜索旧调用：`grep -rn "signInMock" app/ src/`。Task 5 会把 `login.tsx` 改掉；此处仅确认编译不依赖被删方法。

Run: `grep -rn "signInMock\|signOut\b" app/ src/`
对每个 `signOut()` 调用点（如 `app/settings.tsx`）确认现在是 `await` 或 fire-and-forget 均可（返回 Promise，不阻塞 UI）。若有 `const { signInMock } = useAuth()` 解构，保留即可。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无错误。（若 settings.tsx 报 signOut 类型不符，把调用改为 `void signOut()`。）

- [ ] **Step 5: Commit**

```bash
git add src/store/auth.ts app/_layout.tsx app/settings.tsx
git commit -m "feat(auth): auth store 接 Supabase Auth + 启动恢复会话

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: 手动验证（需配好 .env 的云项目）**

在 Supabase Dashboard → Authentication → Providers → Email 关闭 "Confirm email"。
启动 App：注册一个邮箱账号 → 杀进程重启 App → 仍处于登录态（个人页显示用户名）。记录结果。

---

### Task 5: 登录页改邮箱 + 密码 + 注册/登录切换

**Files:**
- Modify: `app/auth/login.tsx`

**Interfaces:**
- Consumes: `useAuth().signUp/signIn`、`validateEmail/validatePassword/validateUsername`。
- Produces: 登录界面支持注册（邮箱+密码+用户名）与登录（邮箱+密码），保留匿名入口。

> 说明：RN 组件无自动化测试框架（无 RTL），本任务验证靠 typecheck + 手动。校验逻辑已在 Task 3 单测覆盖。

- [ ] **Step 1: 重写 login.tsx 表单状态与提交**

将 `app/auth/login.tsx` 的组件主体改为支持 mode 切换。关键片段（完整替换 `LoginScreen` 内部）：

```tsx
  const router = useRouter();
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailV = useMemo(() => validateEmail(email), [email]);
  const pwV = useMemo(() => validatePassword(password), [password]);
  const nameV = useMemo(() => validateUsername(username), [username]);
  const canSubmit =
    emailV.ok && pwV.ok && (mode === 'signIn' || nameV.ok) && !submitting;

  const onSubmit = async () => {
    setServerError(null);
    if (!canSubmit) return;
    setSubmitting(true);
    const res = mode === 'signUp'
      ? await signUp(email.trim(), password, username.trim())
      : await signIn(email.trim(), password);
    setSubmitting(false);
    if (res.ok) router.back();
    else setServerError(res.error ?? '操作失败，请重试');
  };
```

import 区改为：

```tsx
import { useState, useMemo } from 'react';
import { validateEmail, validatePassword, validateUsername } from '@/api/auth/validateUsername';
```

- [ ] **Step 2: 渲染邮箱、密码框，注册态额外渲染用户名框，加 mode 切换按钮**

在表单区渲染三个受控 `TextInput`（email：`keyboardType="email-address"`、`autoCapitalize="none"`；password：`secureTextEntry`；username 仅 `mode==='signUp'` 时显示），按钮文案随 mode 显示「登录」/「注册」，下方放一个切换链接：

```tsx
<Pressable onPress={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setServerError(null); }}>
  <Text style={styles.skipText}>
    {mode === 'signIn' ? '没有账号？去注册' : '已有账号？去登录'}
  </Text>
</Pressable>
```

`serverError` 非空时在按钮上方渲染红色错误行（复用现有 `styles.errorRow`/`errorText` + `AlertCircle`）。保留底部「先不登录，继续看视频」入口。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add app/auth/login.tsx
git commit -m "feat(auth): 登录页改邮箱+密码，支持注册/登录切换

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: 手动验证**

App 内：切到注册 → 填邮箱/密码/用户名 → 注册成功进 feed；登出 → 用同账号登录成功。错误密码显示 serverError。

---

## Phase 2（M3）：内容表 + 仓库层 + mappers

### Task 6: videos/likes/comments migration + RLS + 统计视图

**Files:**
- Create: `supabase/migrations/0002_content.sql`

**Interfaces:**
- Produces: 表 `videos` / `likes` / `comments`、视图 `video_with_stats`（含 like_count/comment_count/fork_count）、各表 RLS。后续仓库依赖。

- [ ] **Step 1: 写 migration**

Create `supabase/migrations/0002_content.sql`:

```sql
create table public.videos (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid references public.profiles(id) on delete set null,
  parent_id     uuid references public.videos(id) on delete set null,
  root_id       uuid not null,
  remix_kind    text,
  depth         int not null default 0,
  prompt        text not null,
  video_url     text not null,
  thumbnail_url text,
  tail_frame_url text,
  duration_ms   int,
  width         int,
  height        int,
  ai_provider   text,
  edit_metadata jsonb,
  status        text not null default 'ready',
  visibility    text not null default 'private',
  play_count    int not null default 0,
  created_at    timestamptz not null default now()
);

create table public.likes (
  user_id    uuid references public.profiles(id) on delete cascade,
  video_id   uuid references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid references public.videos(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index videos_root_idx   on public.videos(root_id);
create index videos_author_idx on public.videos(author_id);
create index comments_video_idx on public.comments(video_id);

-- 统计视图：实时聚合 like/comment/fork
create view public.video_with_stats as
select
  v.*,
  coalesce(l.cnt, 0) as like_count,
  coalesce(c.cnt, 0) as comment_count,
  coalesce(f.cnt, 0) as fork_count
from public.videos v
left join (select video_id, count(*) cnt from public.likes group by video_id) l on l.video_id = v.id
left join (select video_id, count(*) cnt from public.comments group by video_id) c on c.video_id = v.id
left join (select parent_id, count(*) cnt from public.videos where parent_id is not null group by parent_id) f on f.parent_id = v.id;

alter table public.videos   enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;

-- videos：public 所有人可读；草稿仅作者可读；只能增改删自己的
create policy "videos_read_public_or_own" on public.videos
  for select using (visibility = 'public' or author_id = auth.uid());
create policy "videos_insert_own" on public.videos
  for insert with check (author_id = auth.uid());
create policy "videos_update_own" on public.videos
  for update using (author_id = auth.uid());
create policy "videos_delete_own" on public.videos
  for delete using (author_id = auth.uid());

-- likes：所有人可读；只能增删自己的
create policy "likes_read_all" on public.likes
  for select using (true);
create policy "likes_insert_own" on public.likes
  for insert with check (user_id = auth.uid());
create policy "likes_delete_own" on public.likes
  for delete using (user_id = auth.uid());

-- comments：跟随视频可见性读；登录可发；只能删自己的
create policy "comments_read" on public.comments
  for select using (
    exists (select 1 from public.videos v
            where v.id = comments.video_id
              and (v.visibility = 'public' or v.author_id = auth.uid()))
  );
create policy "comments_insert_own" on public.comments
  for insert with check (author_id = auth.uid());
create policy "comments_delete_own" on public.comments
  for delete using (author_id = auth.uid());
```

- [ ] **Step 2: 应用 migration**

```bash
npx supabase db reset
```

Expected: 0001 + 0002 应用成功，无错误。（无 Docker 则在云端 SQL Editor 执行 0002 内容。）

- [ ] **Step 3: 验证视图**

本地/云端执行：`select * from public.video_with_stats limit 1;` 不报错（空结果正常）。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_content.sql
git commit -m "feat(db): videos/likes/comments 表 + RLS + 统计视图 (M3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: mappers（DB 行 ↔ 领域类型）+ 单测

**Files:**
- Create: `src/api/supabase/mappers.ts`
- Create: `src/api/supabase/mappers.test.ts`
- Create: `src/api/supabase/rows.ts`（DB 行类型）

**Interfaces:**
- Consumes: 领域类型 `Video` / `Author` / `Comment`（注意 Comment 在 `src/store/comments.ts`）。
- Produces: `rowToVideo(row: VideoWithStatsRow): Video`、`rowToComment(row: CommentRow & { author?: ProfileRow }): Comment`、类型 `VideoRow` / `VideoWithStatsRow` / `ProfileRow` / `CommentRow`。

- [ ] **Step 1: 写行类型**

Create `src/api/supabase/rows.ts`:

```ts
export interface ProfileRow {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface VideoRow {
  id: string;
  author_id: string | null;
  parent_id: string | null;
  root_id: string;
  remix_kind: string | null;
  depth: number;
  prompt: string;
  video_url: string;
  thumbnail_url: string | null;
  tail_frame_url: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  ai_provider: string | null;
  edit_metadata: unknown | null;
  status: string;
  visibility: string;
  play_count: number;
  created_at: string;
}

export interface VideoWithStatsRow extends VideoRow {
  like_count: number;
  comment_count: number;
  fork_count: number;
  // join 出来的作者资料（可选）
  author?: ProfileRow | null;
}

export interface CommentRow {
  id: string;
  video_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: ProfileRow | null;
}
```

- [ ] **Step 2: 写失败测试**

Create `src/api/supabase/mappers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rowToVideo, rowToComment } from './mappers';
import type { VideoWithStatsRow, CommentRow } from './rows';

const baseRow: VideoWithStatsRow = {
  id: 'v1', author_id: 'u1', parent_id: null, root_id: 'v1',
  remix_kind: null, depth: 0, prompt: 'hi', video_url: 'http://x/v.mp4',
  thumbnail_url: null, tail_frame_url: null, duration_ms: 5000,
  width: 720, height: 1280, ai_provider: 'doubao', edit_metadata: null,
  status: 'ready', visibility: 'public', play_count: 12, created_at: '2026-06-24T00:00:00Z',
  like_count: 3, comment_count: 2, fork_count: 1,
  author: { id: 'u1', username: 'alex', avatar_url: null, created_at: '2026-06-24T00:00:00Z' },
};

describe('rowToVideo', () => {
  it('maps core fields', () => {
    const v = rowToVideo(baseRow);
    expect(v.id).toBe('v1');
    expect(v.video_url).toBe('http://x/v.mp4');
    expect(v.author?.username).toBe('alex');
  });
  it('maps stats from view counts', () => {
    const v = rowToVideo(baseRow);
    expect(v.stats).toEqual({ play_count: 12, like_count: 3, fork_count: 1, comment_count: 2 });
  });
  it('coerces remix_kind null', () => {
    expect(rowToVideo(baseRow).remix_kind).toBeNull();
  });
});

describe('rowToComment', () => {
  it('maps body to text and author name', () => {
    const row: CommentRow = {
      id: 'c1', video_id: 'v1', author_id: 'u1', body: 'nice', created_at: '2026-06-24T00:00:00Z',
      author: { id: 'u1', username: 'alex', avatar_url: null, created_at: '2026-06-24T00:00:00Z' },
    };
    const c = rowToComment(row);
    expect(c.text).toBe('nice');
    expect(c.authorName).toBe('alex');
    expect(c.videoId).toBe('v1');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm run test:run -- src/api/supabase/mappers.test.ts`
Expected: FAIL（Cannot find module './mappers'）

- [ ] **Step 4: 写实现**

Create `src/api/supabase/mappers.ts`:

```ts
import type { Video, Author, RemixKind, EditMetadata } from '@/api/types';
import type { Comment } from '@/store/comments';
import type { VideoWithStatsRow, CommentRow, ProfileRow } from './rows';

const AVATAR_COLORS = ['#fe2c55', '#25f4ee', '#ff6b9d', '#7ad7ff', '#ffd166', '#a06cd5', '#8ad27a', '#ff9f7a'];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

function profileToAuthor(p?: ProfileRow | null, fallbackId?: string | null): Author | null {
  if (p) return { id: p.id, username: p.username, avatar_url: p.avatar_url };
  if (fallbackId) return { id: fallbackId, username: '已注销用户', avatar_url: null };
  return null;
}

export function rowToVideo(row: VideoWithStatsRow): Video {
  return {
    id: row.id,
    author_id: row.author_id,
    parent_id: row.parent_id,
    root_id: row.root_id,
    remix_kind: (row.remix_kind as RemixKind | null) ?? null,
    depth: row.depth,
    title: null,
    prompt: row.prompt,
    video_url: row.video_url,
    thumbnail_url: row.thumbnail_url,
    tail_frame_url: row.tail_frame_url,
    duration_ms: row.duration_ms,
    width: row.width,
    height: row.height,
    ai_provider: row.ai_provider,
    edit_metadata: (row.edit_metadata as EditMetadata | null) ?? null,
    status: row.status as Video['status'],
    visibility: row.visibility as Video['visibility'],
    created_at: row.created_at,
    author: profileToAuthor(row.author, row.author_id),
    stats: {
      play_count: row.play_count,
      like_count: row.like_count,
      fork_count: row.fork_count,
      comment_count: row.comment_count,
    },
    is_liked: false, // 由仓库层根据当前用户单独填充
  };
}

export function rowToComment(row: CommentRow): Comment {
  const name = row.author?.username ?? '匿名用户';
  return {
    id: row.id,
    videoId: row.video_id,
    authorId: row.author_id ?? 'anon',
    authorName: name,
    authorAvatarColor: colorFor(row.author_id ?? row.id),
    text: row.body,
    createdAt: new Date(row.created_at).getTime(),
    likeCount: 0,
    liked: false,
    parentId: null,
    replyCount: 0,
  };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test:run -- src/api/supabase/mappers.test.ts`
Expected: PASS

- [ ] **Step 6: typecheck + Commit**

```bash
npm run typecheck
git add src/api/supabase/rows.ts src/api/supabase/mappers.ts src/api/supabase/mappers.test.ts
git commit -m "feat(api): Supabase 行类型 + mappers + 单测

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: videos 仓库（读 + 点赞 + 播放计数）

**Files:**
- Create: `src/api/supabase/videosRepo.ts`

**Interfaces:**
- Consumes: `supabase()`、`rowToVideo`、`VideoWithStatsRow`、`useAuth`（取当前 userId 填 is_liked）。
- Produces: `listFeedRows(): Promise<Video[]>`、`listMyVideoRows(userId): Promise<Video[]>`、`getVideoRow(id): Promise<Video | null>`、`getVersionTreeRows(rootId): Promise<VersionNode[]>`、`toggleLikeRemote(videoId, userId): Promise<boolean>`、`recordPlayRemote(videoId): Promise<void>`、`insertVideoRow(v): Promise<Video>`、`setVisibilityRemote(id, vis)`、`deleteVideoRemote(id)`。

> 说明：仓库直打网络，无纯单测；逻辑正确性靠 typecheck + Task 12 端到端手动验证 + Task 7 mapper 单测。

- [ ] **Step 1: 写仓库**

Create `src/api/supabase/videosRepo.ts`:

```ts
import { supabase } from '@/api/client';
import type { Video, VersionNode } from '@/api/types';
import { useAuth } from '@/store/auth';
import { rowToVideo } from './mappers';
import type { VideoWithStatsRow } from './rows';

const SELECT = '*, author:profiles!videos_author_id_fkey(*)';

function currentUserId(): string | null {
  return useAuth.getState().user?.id ?? null;
}

async function likedSet(userId: string | null, videoIds: string[]): Promise<Set<string>> {
  if (!userId || videoIds.length === 0) return new Set();
  const { data } = await supabase().from('likes').select('video_id')
    .eq('user_id', userId).in('video_id', videoIds);
  return new Set((data ?? []).map((r) => r.video_id as string));
}

function withLiked(videos: Video[], liked: Set<string>): Video[] {
  return videos.map((v) => ({ ...v, is_liked: liked.has(v.id) }));
}

export async function listFeedRows(): Promise<Video[]> {
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT)
    .eq('visibility', 'public').order('created_at', { ascending: false });
  if (error) throw error;
  const videos = (data as VideoWithStatsRow[]).map(rowToVideo);
  return withLiked(videos, await likedSet(currentUserId(), videos.map((v) => v.id)));
}

export async function listMyVideoRows(userId: string | null | undefined): Promise<Video[]> {
  if (!userId) return [];
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT)
    .eq('author_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  const videos = (data as VideoWithStatsRow[]).map(rowToVideo);
  return withLiked(videos, await likedSet(userId, videos.map((v) => v.id)));
}

export async function getVideoRow(id: string): Promise<Video | null> {
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = rowToVideo(data as VideoWithStatsRow);
  const liked = await likedSet(currentUserId(), [v.id]);
  return { ...v, is_liked: liked.has(v.id) };
}

export async function getVersionTreeRows(rootId: string): Promise<VersionNode[]> {
  const { data, error } = await supabase()
    .from('videos').select('id,parent_id,root_id,remix_kind,depth,prompt,thumbnail_url,created_at,author:profiles!videos_author_id_fkey(username)')
    .eq('root_id', rootId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => ({
      id: r.id, parent_id: r.parent_id, root_id: r.root_id,
      remix_kind: r.remix_kind, depth: r.depth, prompt: r.prompt,
      author_username: r.author?.username ?? null,
      thumbnail_url: r.thumbnail_url, created_at: r.created_at,
    }))
    .sort((a, b) => a.depth - b.depth || a.created_at.localeCompare(b.created_at));
}

export async function toggleLikeRemote(videoId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data: existing } = await supabase().from('likes')
    .select('video_id').eq('user_id', userId).eq('video_id', videoId).maybeSingle();
  if (existing) {
    await supabase().from('likes').delete().eq('user_id', userId).eq('video_id', videoId);
    return false;
  }
  await supabase().from('likes').insert({ user_id: userId, video_id: videoId });
  return true;
}

export async function recordPlayRemote(videoId: string): Promise<void> {
  // 直接 +1：用 rpc 或读改写。MVP 用读改写（弱一致可接受）。
  const { data } = await supabase().from('videos').select('play_count').eq('id', videoId).maybeSingle();
  const cur = (data?.play_count as number | undefined) ?? 0;
  await supabase().from('videos').update({ play_count: cur + 1 }).eq('id', videoId);
}

export async function setVisibilityRemote(id: string, vis: 'public' | 'private'): Promise<void> {
  await supabase().from('videos').update({ visibility: vis }).eq('id', id);
}

export async function deleteVideoRemote(id: string): Promise<void> {
  await supabase().from('videos').delete().eq('id', id);
}

// publishEdit 用：不调 AI，直接插一行（复制父视频 URL + editMetadata）
export interface InsertVideoInput {
  authorId: string;
  prompt: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  remixKind: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  tailFrameUrl: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  aiProvider: string | null;
  editMetadata: unknown | null;
  visibility?: 'public' | 'private';
}

export async function insertVideoRow(input: InsertVideoInput): Promise<Video> {
  const { data, error } = await supabase().from('videos').insert({
    author_id: input.authorId,
    parent_id: input.parentId,
    root_id: input.rootId,
    depth: input.depth,
    remix_kind: input.remixKind,
    prompt: input.prompt,
    video_url: input.videoUrl,
    thumbnail_url: input.thumbnailUrl,
    tail_frame_url: input.tailFrameUrl,
    duration_ms: input.durationMs,
    width: input.width,
    height: input.height,
    ai_provider: input.aiProvider,
    edit_metadata: input.editMetadata,
    status: 'ready',
    visibility: input.visibility ?? 'public',
  }).select('id').single();
  if (error) throw error;
  const created = await getVideoRow((data as { id: string }).id);
  if (!created) throw new Error('插入后读取失败');
  return created;
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/api/supabase/videosRepo.ts
git commit -m "feat(api): videos 仓库（读/点赞/播放计数/可见性/删除）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: comments 仓库 + credits 仓库

**Files:**
- Create: `src/api/supabase/commentsRepo.ts`
- Create: `src/api/supabase/creditsRepo.ts`

**Interfaces:**
- Produces:
  - `listCommentsRemote(videoId): Promise<Comment[]>`、`addCommentRemote(videoId, body, authorId): Promise<Comment>`
  - `getBalanceRemote(userId): Promise<number>`

- [ ] **Step 1: 写 comments 仓库**

Create `src/api/supabase/commentsRepo.ts`:

```ts
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

export async function addCommentRemote(videoId: string, body: string, authorId: string): Promise<Comment> {
  const { data, error } = await supabase()
    .from('comments').insert({ video_id: videoId, body, author_id: authorId })
    .select(SELECT).single();
  if (error) throw error;
  return rowToComment(data as CommentRow);
}
```

- [ ] **Step 2: 写 credits 仓库**

Create `src/api/supabase/creditsRepo.ts`:

```ts
import { supabase } from '@/api/client';

export async function getBalanceRemote(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from('credits').select('balance').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.balance as number | undefined) ?? 0;
}
```

- [ ] **Step 3: typecheck + Commit**

```bash
npm run typecheck
git add src/api/supabase/commentsRepo.ts src/api/supabase/creditsRepo.ts
git commit -m "feat(api): comments 仓库 + credits 只读仓库

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3（M3）：Edge Function + Storage + 生成入口改造

### Task 10: Edge Function `generate-video`（豆包中转 + 转存 + 扣额度）

**Files:**
- Create: `supabase/functions/generate-video/index.ts`
- Create: `supabase/functions/generate-video/doubao.ts`
- Create: `supabase/functions/_shared/credits.ts`
- Create: `supabase/functions/_shared/credits.test.ts`
- Create: Storage buckets `videos`、`thumbnails`（通过 migration `0003_storage.sql`）

**Interfaces:**
- Consumes: 请求体 `{ kind: 'text'|'continuation'|'remix', prompt: string, parentTailFrameUrl?: string, parentId?: string, aspect?: '9:16'|'16:9' }`、Authorization header（用户 JWT）。
- Produces: 成功返回插好的 `video_with_stats` 行（JSON）。失败返回 `{ error }` 且已退还额度。纯函数 `applyCharge(balance, cost): { ok: boolean; next: number }`。

> 说明：Edge Function 跑在 Deno。额度扣减纯逻辑抽到 `_shared/credits.ts` 用 Deno test 覆盖；网络/Storage 部分靠 Task 12 手动端到端验证。

- [ ] **Step 1: Storage migration**

Create `supabase/migrations/0003_storage.sql`:

```sql
insert into storage.buckets (id, name, public) values ('videos', 'videos', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true) on conflict do nothing;

-- 公开读
create policy "videos_public_read" on storage.objects
  for select using (bucket_id = 'videos');
create policy "thumbs_public_read" on storage.objects
  for select using (bucket_id = 'thumbnails');
```

Run: `npx supabase db reset`（或云端执行）
Expected: bucket 创建成功。

- [ ] **Step 2: 写额度纯函数 + Deno 测试**

Create `supabase/functions/_shared/credits.ts`:

```ts
export function applyCharge(balance: number, cost: number): { ok: boolean; next: number } {
  if (balance < cost) return { ok: false, next: balance };
  return { ok: true, next: balance - cost };
}
```

Create `supabase/functions/_shared/credits.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyCharge } from './credits.ts';

Deno.test('charges when enough', () => {
  assertEquals(applyCharge(5, 1), { ok: true, next: 4 });
});
Deno.test('rejects when insufficient', () => {
  assertEquals(applyCharge(0, 1), { ok: false, next: 0 });
});
```

- [ ] **Step 3: 跑 Deno 测试（若装了 deno）**

Run: `deno test supabase/functions/_shared/credits.test.ts`
Expected: 2 passed。
（若无 deno：`npm install -D deno` 或跳过，标注待 CI 跑；纯函数极简，风险低。）

- [ ] **Step 4: 写豆包调用模块**

Create `supabase/functions/generate-video/doubao.ts`（封装 create task + poll，密钥从 `Deno.env`）：

```ts
const BASE = Deno.env.get('DOUBAO_BASE_URL') ?? 'https://llmapi.paratera.com';
const KEY = Deno.env.get('DOUBAO_API_KEY') ?? '';
const MODEL = Deno.env.get('DOUBAO_MODEL') ?? 'Doubao-Seedance-1.0-Pro';
const TASKS = '/v1/p001/contents/generations/tasks';

export interface GenResult { videoUrl: string; tailFrameUrl?: string; durationMs?: number; width?: number; height?: number; }

export async function generate(prompt: string, imageUrl?: string): Promise<GenResult> {
  if (!KEY) throw new Error('DOUBAO_API_KEY 未配置');
  const body: Record<string, unknown> = { model: MODEL, content: [{ type: 'text', text: prompt }] };
  if (imageUrl) (body.content as unknown[]).push({ type: 'image_url', image_url: { url: imageUrl } });
  const create = await fetch(`${BASE}${TASKS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!create.ok) throw new Error(`豆包发起失败 ${create.status}`);
  const { id } = await create.json();

  const deadline = Date.now() + 140_000; // 留余量给转存，墙钟上限约 150s
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}${TASKS}/${id}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    const status = j.status ?? j.state;
    if (status === 'succeeded' || status === 'success') {
      const url = j.content?.video_url ?? j.video_url;
      if (!url) throw new Error('成功但缺少 video_url');
      return { videoUrl: url, tailFrameUrl: j.content?.image_url, durationMs: undefined };
    }
    if (status === 'failed' || status === 'error') throw new Error(j.error ?? '豆包生成失败');
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error('生成超时');
}
```

- [ ] **Step 5: 写 Edge Function 主体**

Create `supabase/functions/generate-video/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyCharge } from '../_shared/credits.ts';
import { generate } from './doubao.ts';

const COST = 1;

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await userClient.auth.getUser(jwt);
    const user = ures?.user;
    if (!user) return json({ error: '未登录' }, 401);

    const admin = createClient(url, service);
    const body = await req.json();
    const { kind, prompt, parentTailFrameUrl, parentId, aspect } = body;

    // 1. 读余额 + 扣
    const { data: cRow } = await admin.from('credits').select('balance').eq('user_id', user.id).maybeSingle();
    const charged = applyCharge(cRow?.balance ?? 0, COST);
    if (!charged.ok) return json({ error: '额度不足' }, 402);
    await admin.from('credits').update({ balance: charged.next }).eq('user_id', user.id);

    try {
      // 2. 调豆包
      const gen = await generate(prompt, kind === 'continuation' ? parentTailFrameUrl : undefined);

      // 3. 下载并转存
      const vid = crypto.randomUUID();
      const videoUrl = await store(admin, 'videos', `${user.id}/${vid}.mp4`, gen.videoUrl, 'video/mp4');
      let thumbUrl: string | null = null;
      if (gen.tailFrameUrl) thumbUrl = await store(admin, 'thumbnails', `${user.id}/${vid}.jpg`, gen.tailFrameUrl, 'image/jpeg');

      // 4. 取父视频算 root/depth
      let rootId = vid, depth = 0, remixKind: string | null = null;
      if (parentId) {
        const { data: parent } = await admin.from('videos').select('root_id,depth').eq('id', parentId).maybeSingle();
        if (parent) { rootId = parent.root_id; depth = parent.depth + 1; }
        remixKind = kind === 'continuation' ? 'continuation' : 'prompt_remix';
      }

      // 5. 插 videos 行
      const { data: inserted, error: insErr } = await admin.from('videos').insert({
        id: vid, author_id: user.id, parent_id: parentId ?? null, root_id: rootId,
        remix_kind: remixKind, depth, prompt, video_url: videoUrl, thumbnail_url: thumbUrl,
        tail_frame_url: thumbUrl, ai_provider: 'doubao', status: 'ready', visibility: 'public',
      }).select('*').single();
      if (insErr) throw insErr;

      const { data: full } = await admin.from('video_with_stats')
        .select('*, author:profiles!videos_author_id_fkey(*)').eq('id', vid).single();
      return json(full ?? inserted, 200);
    } catch (genErr) {
      // 失败退还额度
      await admin.from('credits').update({ balance: (cRow?.balance ?? 0) }).eq('user_id', user.id);
      return json({ error: String((genErr as Error).message ?? genErr) }, 500);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function store(admin: any, bucket: string, path: string, srcUrl: string, contentType: string): Promise<string> {
  const res = await fetch(srcUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  const { error } = await admin.storage.from(bucket).upload(path, buf, { contentType, upsert: true });
  if (error) throw error;
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl as string;
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
```

- [ ] **Step 6: 部署 Edge Function + 配 secrets**

```bash
npx supabase functions deploy generate-video
npx supabase secrets set DOUBAO_API_KEY=<你的密钥> DOUBAO_BASE_URL=https://llmapi.paratera.com DOUBAO_MODEL=Doubao-Seedance-1.0-Pro
```

（`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 由平台自动注入到函数环境。）

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/ supabase/migrations/0003_storage.sql
git commit -m "feat(edge): generate-video 函数（豆包中转+转存+扣额度）+ Storage bucket

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: DAO 与 jobs store 改走 Supabase（带保底）

**Files:**
- Modify: `src/api/videos.ts`
- Modify: `src/store/jobs.ts`
- Create: `src/api/supabase/generateClient.ts`

**Interfaces:**
- Consumes: 全部仓库函数（Task 8/9）、Edge Function。
- Produces: `callGenerate(args): Promise<Video>`（调 Edge Function，返回 mapper 后的 Video）。DAO 函数签名不变。

> 说明：保留 `hasSupabase` 分支——true 走 Supabase，false 走现有本地实现。

- [ ] **Step 1: 写 Edge Function 客户端封装**

Create `src/api/supabase/generateClient.ts`:

```ts
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
```

- [ ] **Step 2: DAO 读路径加 Supabase 分支**

修改 `src/api/videos.ts`：顶部 import：

```ts
import { hasSupabase } from '@/api/client';
import * as repo from '@/api/supabase/videosRepo';
import * as commentsRepo from '@/api/supabase/commentsRepo';
import { callGenerate } from '@/api/supabase/generateClient';
```

把读函数改为分支（保留原 body 作 else）。示例 `listFeed`：

```ts
export async function listFeed(): Promise<Video[]> {
  if (hasSupabase) return repo.listFeedRows();
  snapshot().hydrate();
  return [...snapshot().videos].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
```

同样改 `listMyVideos`（→ `repo.listMyVideoRows`）、`getVideo`（→ `repo.getVideoRow`）、`getVersionTree`（→ `repo.getVersionTreeRows`）、`toggleLike`（→ `repo.toggleLikeRemote`）、`recordPlay`（→ `repo.recordPlayRemote`）。每个都是 `if (hasSupabase) return repo.xxx(...);` 在前，原逻辑在后。

- [ ] **Step 3: DAO 生成路径改走 Edge Function**

`generateVideo` / `continueVideo` / `remixVideo` 改为：

```ts
export async function generateVideo(input: { prompt: string; aspect?: '9:16' | '16:9'; onProgress?: (s: string) => void }): Promise<Video> {
  if (hasSupabase) {
    input.onProgress?.('running');
    return callGenerate({ kind: 'text', prompt: input.prompt, aspect: input.aspect });
  }
  // …原有 Mock 逻辑（保留）
}
```

`continueVideo` → `callGenerate({ kind: 'continuation', prompt, parentId, parentTailFrameUrl: parent.tail_frame_url })`（需先 `getVideo(parentId)` 拿 tail_frame_url）。
`remixVideo` → `callGenerate({ kind: 'remix', prompt, parentId })`。
`publishEdit` → 有 Supabase 时直接 `repo.insertVideoRow`（Task 8 已定义 `InsertVideoInput`）：先 `getVideo(parentId)` 拿父视频的 video_url/thumbnail/tail_frame/尺寸 与 root_id/depth，组装 `InsertVideoInput`（`remixKind: 'edit'`、`editMetadata: input.editMetadata`、复制父视频 URL，不调 AI），再调 `repo.insertVideoRow`。

- [ ] **Step 4: jobs store 生成入口改走 Edge Function**

修改 `src/store/jobs.ts`：将 `runJob`/poll 里调 `defaultProvider.textToVideo`+`getJob` 的本地编排，在 `hasSupabase` 为 true 时替换为单次 `callGenerate(...)`（同步等待返回），完成后 `useLocalVideos.addVideo` 仍调用以即时入流（或改为 `listFeed` 失效刷新）。`hasSupabase=false` 保留原编排。额度本地扣减逻辑在 Supabase 模式下移除（由 Edge Function 负责），仅在保底模式扣本地 credits。

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add src/api/videos.ts src/store/jobs.ts src/api/supabase/generateClient.ts src/api/supabase/videosRepo.ts
git commit -m "feat(api): DAO 与 jobs 改走 Supabase（生成走 Edge Function），保留本地保底

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: 评论 store + 额度显示改读云端 + 种子脚本 + 端到端验证

**Files:**
- Modify: `src/store/comments.ts`
- Modify: `src/store/credits.ts`（或其读取点）
- Create: `scripts/seed-demo-videos.ts`
- Modify: `.env.example`、`README.md`

**Interfaces:**
- Consumes: `commentsRepo`、`creditsRepo`。
- Produces: 评论/额度在 Supabase 模式读云端；seed 脚本把 5 个 demo 视频灌入云端 videos 表（指向已上传 Storage 的文件）。

- [ ] **Step 1: 评论 store 接云端**

修改 `src/store/comments.ts`：`ensureSeeded(videoId)` 在 `hasSupabase` 时改为 `listCommentsRemote(videoId)` 填 `byVideo`；`add(...)` 在 `hasSupabase` 时改为 `addCommentRemote` 后把结果 push。保留本地 seed 作保底。

- [ ] **Step 2: 额度显示接云端**

找到读 credits 的组件（`grep -rn "useCredits" app/ src/`）。在 Supabase 模式下，改为登录后用 `getBalanceRemote(userId)` 拉取并显示。保底模式保留本地 `useCredits`。

- [ ] **Step 3: 写 seed 脚本**

Create `scripts/seed-demo-videos.ts`：用 service role key 把 `assets/videos/001-005.mp4` 上传到 Storage、并向 videos 表插 5 行（author_id 设为一个 seed 用户或 null，visibility=public，prompt 取自 `src/ai/demoVideos.ts` 的 DEMO_VIDEOS）。脚本用 `@supabase/supabase-js` + 本地读文件。运行说明写进注释：`npx tsx scripts/seed-demo-videos.ts`（需 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 环境变量）。

- [ ] **Step 4: 更新 .env.example + README**

`.env.example` 增加：

```
# 豆包密钥现在放 Supabase Edge Function secrets，不再放客户端
# 客户端只需 Supabase 公钥：
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_AI_PROVIDER=doubao
```

README 增加「后端配置」一节：建 Supabase 项目、跑 migrations、部署 function、配 secrets、关邮箱验证、跑 seed 脚本的步骤。

- [ ] **Step 5: typecheck + 全部单测**

Run: `npm run typecheck && npm run test:run`
Expected: 无类型错误，所有单测通过。

- [ ] **Step 6: 端到端手动验证（核心验收）**

记录每条结果：
1. 注册新账号 → 重启 App → 仍登录。
2. 文生视频 → 生成成功 → 视频出现在 feed → 杀进程重启 → 视频仍在（Storage 永久 URL）。
3. 额度从 5 扣到 4（云端 credits 表确认）。
4. 第二台设备（或 Supabase Studio）登录同账号 → 看到同一视频。
5. 点赞 → 重启 → 点赞态保留。
6. 评论 → 重启 → 评论保留。
7. 额度耗尽时生成被 Edge Function 拒绝（402 额度不足）。

- [ ] **Step 7: Commit**

```bash
git add src/store/comments.ts src/store/credits.ts scripts/seed-demo-videos.ts .env.example README.md app/
git commit -m "feat: 评论/额度读云端 + demo 视频 seed 脚本 + 后端配置文档

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 完成标准（验收）

- 能用邮箱+密码注册/登录，App 重启保持登录态。
- 生成的视频转存 Supabase Storage，永久可看、多设备同步。
- videos/likes/comments/credits 全部持久化在 Postgres，受 RLS 保护。
- 额度只能由 Edge Function（service role）扣减，客户端无法篡改。
- 未配 Supabase（`hasSupabase=false`）时仍能用本地 Mock 跑起来（保底）。
- `npm run typecheck` 与 `npm run test:run` 全绿。

## 后续（不在本次范围，列入路线）

- M4：全局错误边界、网络重试、加载/空/错态统一、react-query 缓存策略、举报/屏蔽、埋点。
- M5：EAS Build 原生构建、重开邮箱验证、隐私政策/协议页、商店素材、内容审核、付费、商店审核。
- 若豆包频繁超时：把 `generate-video` 升级为异步两段式（发起 + `get-job` 轮询 + 状态表 + Realtime 推送）。
