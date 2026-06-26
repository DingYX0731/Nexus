# MVP 完备化 M4-A 健壮性 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐现有功能的健壮性——统一 Loading/Error/Empty 状态组件 + 抽 UserAvatar/CreditsDisplay、剪辑发布上云、生成中占位卡+续轮询、额度 402 引导+领取体验额度。

**Architecture:** 新建 `src/components/ui/` 放可复用组件；各屏 react-query 接状态组件；editor 改走 DAO publishEdit；个人页保留 generating 行渲染占位卡并续轮询 poll-video；客户端识别 Edge Function 402 弹额度引导，领取额度走新 SECURITY DEFINER rpc 落云端。

**Tech Stack:** Expo SDK 54 / RN 0.81 / TS、Supabase、zustand、@tanstack/react-query、vitest、expo-image。

## Global Constraints

- 设计 spec：`docs/superpowers/specs/2026-06-26-mvp-completion-design.md`（M4-A 节为准）。
- 本计划只做 M4-A。M4-B（社交）/M4-C（资料）是后续独立 plan。
- 保留 hasSupabase=false 本地保底：每处改动都 `if (hasSupabase) {云端} else {本地}`。
- DAO 函数签名不变；现有领域类型不破坏。
- 额度：扣/退/领取只由服务端（Edge Function / SECURITY DEFINER rpc）改 credits，客户端 credits 表只读。
- 提交信息末尾带 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- 不写任何密钥；不改 .env / .env.example。
- migration SQL 由人工在 Supabase 后台执行（无本地 Docker）；plan 只写文件。
- 网络/屏幕代码不写 vitest 单测（靠 typecheck）；纯函数（配色 hash 等）写单测。

---

## Task 1: UserAvatar 组件 + 配色纯函数单测

**Files:**
- Create: `src/components/ui/avatarColor.ts`
- Create: `src/components/ui/avatarColor.test.ts`
- Create: `src/components/ui/UserAvatar.tsx`

**Interfaces:**
- Produces: `avatarColorFor(seed: string): string`；`<UserAvatar user={{ username?: string|null; avatar_url?: string|null }} size?: number />`。

- [ ] **Step 1: 写配色纯函数失败测试**

Create `src/components/ui/avatarColor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { avatarColorFor } from './avatarColor';

describe('avatarColorFor', () => {
  it('returns a hex color', () => {
    expect(avatarColorFor('alex')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it('is deterministic for same seed', () => {
    expect(avatarColorFor('alex')).toBe(avatarColorFor('alex'));
  });
  it('handles empty string', () => {
    expect(avatarColorFor('')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/components/ui/avatarColor.test.ts`
Expected: FAIL（Cannot find module './avatarColor'）

- [ ] **Step 3: 写配色实现**

Create `src/components/ui/avatarColor.ts`:

```ts
const AVATAR_COLORS = ['#fe2c55', '#25f4ee', '#ff6b9d', '#7ad7ff', '#ffd166', '#a06cd5', '#8ad27a', '#ff9f7a'];

export function avatarColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/components/ui/avatarColor.test.ts`
Expected: PASS

- [ ] **Step 5: 写 UserAvatar 组件**

Create `src/components/ui/UserAvatar.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { avatarColorFor } from './avatarColor';

interface UserAvatarProps {
  user?: { username?: string | null; avatar_url?: string | null } | null;
  size?: number;
}

export function UserAvatar({ user, size = 40 }: UserAvatarProps) {
  const username = user?.username ?? '';
  const initial = username ? username.slice(0, 1).toUpperCase() : '?';
  const radius = size / 2;

  if (user?.avatar_url) {
    return (
      <Image
        source={{ uri: user.avatar_url }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: avatarColorFor(username) }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '700' },
});
```

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/avatarColor.ts src/components/ui/avatarColor.test.ts src/components/ui/UserAvatar.tsx
git commit -m "feat(ui): UserAvatar 组件 + 配色纯函数单测

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 统一状态组件 ScreenState

**Files:**
- Create: `src/components/ui/ScreenState.tsx`

**Interfaces:**
- Consumes: `@/theme`（colors/spacing/typography）。
- Produces: `<LoadingState text?: string />`、`<ErrorState message?: string onRetry?: () => void />`、`<EmptyState title: string subtitle?: string icon?: ReactNode cta?: { label: string; onPress: () => void } />`。

> 说明：纯展示组件，无单测，靠 typecheck。

- [ ] **Step 1: 写 ScreenState 组件**

Create `src/components/ui/ScreenState.tsx`:

```tsx
import type { ReactNode } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';

export function LoadingState({ text }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {text ? <Text style={styles.sub}>{text}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <AlertCircle color={colors.danger} size={32} />
      <Text style={styles.title}>出错了</Text>
      <Text style={styles.sub}>{message ?? '加载失败，请重试'}</Text>
      {onRetry ? (
        <Pressable style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>重试</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title, subtitle, icon, cta,
}: { title: string; subtitle?: string; icon?: ReactNode; cta?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.center}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {cta ? (
        <Pressable style={styles.btn} onPress={cta.onPress}>
          <Text style={styles.btnText}>{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, backgroundColor: '#000' },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  btn: {
    marginTop: spacing.md, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.pill,
  },
  btnText: { ...typography.button, color: '#fff' },
});
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误。（若 theme 缺某个 key 如 `primarySoft`/`radius.pill`，用现有 theme 里实际存在的近似值替换——先 `grep -n "primarySoft\|pill\|danger" src/theme/index.ts` 确认。）

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/ScreenState.tsx
git commit -m "feat(ui): 统一 Loading/Error/Empty 状态组件

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: CreditsDisplay 组件 + 各处接入

**Files:**
- Create: `src/components/ui/CreditsDisplay.tsx`
- Modify: `app/(tabs)/create.tsx`、`app/settings.tsx`（替换内联额度显示）

**Interfaces:**
- Consumes: `useCredits`（@/store/credits）、`useAuth`。
- Produces: `<CreditsDisplay />`（自带读取当前用户额度并显示）。

> 说明：先读 `src/store/credits.ts` 看现有 `syncRemote`/`get`/`byUser` 接口与 `useAuth` 取 userId 的方式，再实现。屏幕接入靠 typecheck。

- [ ] **Step 1: 写 CreditsDisplay**

Create `src/components/ui/CreditsDisplay.tsx`:

```tsx
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useCredits } from '@/store/credits';
import { useAuth } from '@/store/auth';
import { hasSupabase } from '@/api/client';
import { colors, spacing, typography } from '@/theme';

export function CreditsDisplay() {
  const { user } = useAuth();
  const uid = user?.id;
  const byUser = useCredits((s) => s.byUser);
  const ensureInit = useCredits((s) => s.ensureInit);
  const syncRemote = useCredits((s) => s.syncRemote);

  useEffect(() => {
    if (!uid) return;
    if (hasSupabase) syncRemote(uid);
    else ensureInit(uid);
  }, [uid, ensureInit, syncRemote]);

  if (!uid) return null;
  const balance = byUser[uid] ?? 0;

  return (
    <View style={styles.row}>
      <Sparkles color={colors.primary} size={14} />
      <Text style={styles.text}>{balance}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { ...typography.captionStrong, color: colors.text },
});
```

> 注意：若 `useCredits` 没有 `syncRemote`，先读 `src/store/credits.ts` 用其真实方法名调整。若没有 `captionStrong`，用 `typography.caption` 等现有 key。

- [ ] **Step 2: create.tsx 接入**

读 `app/(tabs)/create.tsx`，把右上角内联的额度 chip 替换为 `<CreditsDisplay />`（import 之）。保留原布局位置。

- [ ] **Step 3: settings.tsx 接入**

读 `app/settings.tsx`，把额度那一行的数字显示部分替换为 `<CreditsDisplay />`（保留「领取/说明」交互行，只替显示数字部分）。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/CreditsDisplay.tsx "app/(tabs)/create.tsx" app/settings.tsx
git commit -m "feat(ui): CreditsDisplay 组件，替换 create/settings 重复额度显示

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: feed/profile/video detail 接状态组件 + profile/comments 用 UserAvatar

**Files:**
- Modify: `app/(tabs)/index.tsx`、`app/(tabs)/profile.tsx`、`app/video/[id].tsx`、`src/components/comments/CommentsSheet.tsx`

**Interfaces:**
- Consumes: Task 1 `UserAvatar`、Task 2 `LoadingState/ErrorState/EmptyState`。

> 说明：UI 接入，靠 typecheck + 后续端到端验证。先读各文件现有的 loading/empty 处理再替换，保持现有 react-query 结构。

- [ ] **Step 1: feed index.tsx**

`app/(tabs)/index.tsx`：useQuery 解构出 `isError, refetch`；在 `videos.length === 0` 的分支按状态分流：
- `isLoading` → `<LoadingState text="加载中…" />`
- `isError` → `<ErrorState onRetry={refetch} />`
- 空 → 现有的 `<EmptyState title="还没有视频" subtitle="..." cta={{label:'开始创作', onPress: ...}} />`（用 Task 2 组件替换现有内联空态）。
import LoadingState/ErrorState/EmptyState。

- [ ] **Step 2: profile.tsx**

`app/(tabs)/profile.tsx`：Supabase 查询解构 `isLoading, isError, refetch`；列表为空时分流 Loading/Error/Empty（同上模式）。头像处（首字母色块）替换为 `<UserAvatar user={{ username: user?.username, avatar_url: null }} size={80} />`。

- [ ] **Step 3: video detail**

`app/video/[id].tsx`：video 查询 `isLoading→<LoadingState>`、`isError→<ErrorState onRetry>`；找不到视频时 `<EmptyState title="视频不存在" />`。保留现有 owner 操作逻辑。

- [ ] **Step 4: CommentsSheet 用 UserAvatar**

`src/components/comments/CommentsSheet.tsx`：评论项头像（现在用 `authorAvatarColor` + 首字母）替换为 `<UserAvatar user={{ username: comment.authorName, avatar_url: null }} size={32} />`。（Comment 类型暂无 avatar_url，先传 null；M4-C 后可接真头像。）

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/index.tsx" "app/(tabs)/profile.tsx" "app/video/[id].tsx" src/components/comments/CommentsSheet.tsx
git commit -m "feat(ui): feed/profile/detail 接状态组件，头像统一用 UserAvatar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 剪辑发布上云（editor 改走 DAO publishEdit）

**Files:**
- Modify: `app/editor/[id].tsx`
- Modify: `src/store/jobs.ts`（删除无引用的 submitEditPublish）

**Interfaces:**
- Consumes: DAO `publishEdit({ parentId, editMetadata })`（@/api/videos，已有 Supabase 分支）。

- [ ] **Step 1: editor 改调 publishEdit**

`app/editor/[id].tsx` 的 `onPublish`，把 `submitEditPublish({ parentVideo: source, editMetadata: edit })` 改为 await DAO：

```tsx
import { publishEdit } from '@/api/videos';
import { useQueryClient } from '@tanstack/react-query';
// ...
  const qc = useQueryClient();
  const onPublish = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const video = await publishEdit({ parentId: source.id, editMetadata: edit });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['myVideos'] });
      router.dismissTo(`/video/${video.id}`);
    } catch (e: any) {
      Alert.alert('发布失败', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
```

（确认 `publishEdit` 的入参签名是 `{ parentId, editMetadata }`，返回 `Video`；若实际签名不同，按 `src/api/videos.ts` 真实签名调整。）

- [ ] **Step 2: 删除无引用的 submitEditPublish**

`grep -rn "submitEditPublish" app/ src/`。若除定义外无引用，删除 `src/store/jobs.ts` 里的 `submitEditPublish` 函数定义及其专属 helper（若有）。若仍有引用，保留并在报告说明。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add "app/editor/[id].tsx" src/store/jobs.ts
git commit -m "feat: 剪辑发布改走 DAO publishEdit 落云端，移除本地冗余路径

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 生成中占位卡 + 续轮询

**Files:**
- Modify: `src/api/supabase/videosRepo.ts`（listMyVideoRows 保留 generating 行）
- Modify: `src/api/supabase/generateClient.ts`（抽 resumePoll）
- Modify: `app/(tabs)/profile.tsx`（渲染占位卡 + 进页面续轮询）

**Interfaces:**
- Produces: `resumePoll(videoId: string): Promise<'ready' | 'failed'>`（@/api/supabase/generateClient）。
- Consumes: profile 用 react-query 读到的含 generating 的 Video 列表。

> 说明：先读 `videosRepo.ts` 的 `listMyVideoRows` 现在怎么过滤（之前加了 `.neq('video_url','')`，会把 generating 占位行也滤掉，因为占位行 video_url='')。

- [ ] **Step 1: listMyVideoRows 保留 generating 行**

`src/api/supabase/videosRepo.ts` 的 `listMyVideoRows`：把过滤条件从「排除空 video_url」改为「保留 ready 的 + 保留 generating 的，只排除 failed 或既非 ready 又非 generating 的坏行」。具体：去掉 `.neq('video_url','')`，改为查询后在 JS 端 `filter(v => v.status === 'ready' || v.status === 'generating')`。这样 generating 占位行（video_url='')会保留。

- [ ] **Step 2: generateClient 抽 resumePoll**

`src/api/supabase/generateClient.ts`：把内部轮询 poll-video 的逻辑抽成可复用函数：

```ts
export async function resumePoll(videoId: string): Promise<'ready' | 'failed'> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const { data, error } = await supabase().functions.invoke('poll-video', { body: { videoId } });
    if (error) throw new Error(error.message);
    const poll = data as { status?: 'generating' | 'ready' | 'failed'; error?: string };
    if (poll.status === 'ready') return 'ready';
    if (poll.status === 'failed') return 'failed';
  }
  throw new Error('生成超时');
}
```

`callGenerate` 内部改为复用 `resumePoll`（发起后调 resumePoll，ready 则 getVideoRow 返回）。

- [ ] **Step 3: profile 渲染占位卡 + 续轮询**

`app/(tabs)/profile.tsx`：
- 视频网格里 `status === 'generating'` 的项渲染为占位卡（转圈 ActivityIndicator + prompt 文本预览，`pointerEvents` 禁点播放）。`ready` 的正常渲染。
- useEffect：对列表里每个 `status === 'generating'` 的视频，调 `resumePoll(v.id)`，完成（ready/failed）后 `qc.invalidateQueries({ queryKey: ['myVideos', user.id] })` 刷新。用一个 ref Set 防止对同一 videoId 重复起轮询。

```tsx
import { resumePoll } from '@/api/supabase/generateClient';
// ...
  const pollingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hasSupabase || !user) return;
    for (const v of videos) {
      if (v.status === 'generating' && !pollingRef.current.has(v.id)) {
        pollingRef.current.add(v.id);
        resumePoll(v.id)
          .catch(() => undefined)
          .finally(() => {
            pollingRef.current.delete(v.id);
            qc.invalidateQueries({ queryKey: ['myVideos', user.id] });
          });
      }
    }
  }, [videos, user, qc]);
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/api/supabase/videosRepo.ts src/api/supabase/generateClient.ts "app/(tabs)/profile.tsx"
git commit -m "feat: 个人页生成中占位卡 + 进页面续轮询，不依赖内存

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: grant_credits rpc（migration）

**Files:**
- Create: `supabase/migrations/0008_grant_credits.sql`

**Interfaces:**
- Produces: Postgres rpc `grant_credits(p_amount int)`，给当前 auth.uid() 加额度。

> 说明：SQL 文件，人工后台执行。这是「领取体验额度」的服务端落地。

- [ ] **Step 1: 写 migration**

Create `supabase/migrations/0008_grant_credits.sql`:

```sql
-- 0008_grant_credits.sql
-- 领取体验额度：给当前登录用户加 N 额度(服务端落库,客户端 credits 仍只读)。
-- demo 用;真付费时替换。

create or replace function public.grant_credits(p_amount int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.credits
  set balance = balance + p_amount
  where user_id = auth.uid()
  returning balance;
$$;

grant execute on function public.grant_credits(int) to authenticated;
```

- [ ] **Step 2: 提交（人工后台执行 SQL）**

```bash
git add supabase/migrations/0008_grant_credits.sql
git commit -m "feat(db): grant_credits rpc（领取体验额度，服务端落库）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 额度 402 识别 + 引导弹窗 + 领取

**Files:**
- Modify: `src/api/supabase/generateClient.ts`（402 抛可识别错误）
- Create: `src/api/supabase/creditsRepo.ts` 里加 `grantCreditsRemote`（或在现有 creditsRepo 追加）
- Modify: `app/(tabs)/create.tsx`、`app/remix/[id].tsx`（识别错误弹引导）

**Interfaces:**
- Consumes: rpc `grant_credits`（Task 7）。
- Produces: `CREDITS_EXHAUSTED` 错误标识（如 `error.code === 'credits_exhausted'` 或自定义 Error 子类）；`grantCreditsRemote(amount: number): Promise<number>`。

> 说明：先读 `generateClient.callGenerate` 现在怎么处理 invoke 的 error/data.error，以及 Edge Function 402 时 supabase-js 返回的形态（通常 error 非空且含 status 或 message）。读 `app/(tabs)/create.tsx` 与 `app/remix/[id].tsx` 现有 Alert 占位。

- [ ] **Step 1: callGenerate 识别 402**

`src/api/supabase/generateClient.ts`：发起调用后，若 Edge Function 返回额度不足（402 或 data.error 含「额度不足」），抛带标识的错误：

```ts
export class CreditsExhaustedError extends Error {
  code = 'credits_exhausted' as const;
  constructor() { super('额度不足'); }
}
```

在发起结果判断处：若 `start.error` 包含「额度不足」或 invoke error 的 status===402，`throw new CreditsExhaustedError()`。

- [ ] **Step 2: creditsRepo 加 grantCreditsRemote**

在 `src/api/supabase/creditsRepo.ts` 追加：

```ts
export async function grantCreditsRemote(amount: number): Promise<number> {
  const { data, error } = await supabase().rpc('grant_credits', { p_amount: amount });
  if (error) throw error;
  return (data as number | null) ?? 0;
}
```

- [ ] **Step 3: create/remix 识别错误弹引导**

`app/(tabs)/create.tsx` 与 `app/remix/[id].tsx`：提交生成的 catch（或 jobs 失败回调暴露的错误）里，判断 `e?.code === 'credits_exhausted'` 或 `e instanceof CreditsExhaustedError` → 弹引导（用现有 Alert 或 ConfirmDialog）：标题「额度不足」+ 说明 + 「领取体验额度」按钮，按钮 onPress 调 `grantCreditsRemote(5)` 成功后 `useCredits.getState().syncRemote(uid)` 刷新 + toast「已领取 5 额度」。非额度错误走原有错误提示。

（注意：若生成走的是 jobs.ts 异步路径，错误在 jobs 的 fail 里。需让 jobs 把 `credits_exhausted` 错误透传到一个可被 UI 捕获的地方——可在 jobs fail 时 `showToast` 或通过一个回调。最简单：在 create.tsx 提交前先本地预检额度不足就弹引导；同时 jobs 异步失败时若是该错误也弹。实现时选最少改动且覆盖两条路径的方式，在报告说明。）

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/api/supabase/generateClient.ts src/api/supabase/creditsRepo.ts "app/(tabs)/create.tsx" "app/remix/[id].tsx"
git commit -m "feat: 额度耗尽识别 402 + 引导弹窗 + 领取体验额度

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 完成标准（M4-A 验收）
- feed/profile/detail 有统一的加载/错误/空态（错误可重试）。
- 头像统一走 UserAvatar；额度显示统一走 CreditsDisplay。
- 剪辑发布的视频落云端，重启/多设备可见。
- 个人页能看到「生成中」占位卡，重启后仍在并继续轮询到完成。
- 额度耗尽时弹专门引导，可领取体验额度（落云端）。
- `npm run typecheck` 与 `npm run test:run` 全绿。

## 人工操作
- 执行 migration 0008（grant_credits rpc）。
- 端到端验证上述完成标准。

## 后续（不在本计划）
- M4-B 社交基建（follows/notifications/inbox）。
- M4-C 个人资料编辑（含头像上传，届时 UserAvatar 接真 avatar_url）。
