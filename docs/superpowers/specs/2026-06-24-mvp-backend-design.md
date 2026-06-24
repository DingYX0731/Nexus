# MVP 后端搭建：账号与内容上云设计

- 日期：2026-06-24
- 项目：AI Shorts（COMP7506 课程项目）
- 目标：从纯前端 + 本地内存 store 迁移到 Supabase 真后端，实现真实账号、数据持久化、多设备演示。
- 本次范围：M2（账号与会话）+ M3（内容全量上云）。M4/M5 列为后续路线，不在本次实现。

## 1. 背景与现状

当前 App（M1）已完成全部前端功能，但所有数据都在内存 zustand store 里，App 重启即丢失，无法多设备共享。

关键现状：

- 数据访问全部经过 DAO 层 `src/api/videos.ts`（`listFeed` / `getVideo` / `generateVideo` / `toggleLike` 等），DAO 今天包装的是内存 store。
- `@supabase/supabase-js` 已安装；`src/api/client.ts` 已布线 Supabase client（`persistSession: true, autoRefreshToken: true`），由 `hasSupabase` 环境判断门控，目前未启用。
- 认证 `src/store/auth.ts` 是 mock：`signInMock(username)` 只设本地 state，无密码、无持久化。
- 5 个内存 store：`auth` / `videos` / `comments` / `credits` / `likes`。
- AI 生成走 `VideoGenProvider` 抽象（Mock / Doubao / Kling）。豆包密钥目前在客户端；豆包返回的视频是签名 URL，24h 过期。

## 2. 需求（已确认）

- 发布目标：课程交付 + 真后端演示（真实账号、持久化、多设备）。不做 App Store 上架。
- 后端：Supabase（Postgres + Auth + Storage + Edge Functions）。
- 认证：邮箱 + 密码；现有 username 变为 profile 显示名。
- 持久化范围：全部迁移 —— auth / videos / likes / comments / credits 都上云。
- AI：真豆包，经 Supabase Edge Function 中转（密钥服务端）；生成视频转存 Supabase Storage（避免 24h 过期）。
- 生成任务模式：同步（Edge Function 一个请求走到底）。
- 演示便利：关闭邮箱验证、保留匿名浏览。

## 3. 架构：方案 A —— 保留 DAO 接缝，只换内部实现

```
屏幕 (app/**)  ──►  react-query hooks  ──►  src/api/*.ts (DAO，函数签名不变)
                                                  │
                          ┌───────────────────────┴───────────────────────┐
                          ▼                                                 ▼
                  hasSupabase = true                              hasSupabase = false
                  Supabase 实现                                    现有本地/Mock 实现（保底）
                          │
   ┌──────────┬──────────┼──────────┬──────────┐
   ▼          ▼          ▼          ▼          ▼
 profiles   videos     likes     comments    credits   ← Postgres 表 (RLS)
                          │
                          ▼
              Supabase Auth (邮箱+密码)
                          │
                          ▼
        Edge Function `generate-video` ──► 豆包 API（密钥服务端）
                          │
                          ▼
              Supabase Storage（视频转存，永久 URL）
```

原则：

1. DAO 函数签名完全不变，只改函数体。屏幕与 hooks 不动。
2. 新增 `src/api/supabase/` 目录，每域一个仓库模块：`profiles.ts` / `videos.ts` / `likes.ts` / `comments.ts` / `credits.ts`。
3. 保底开关：复用现有 `hasSupabase`。未配 Supabase 时仍走本地 Mock，便于离线开发和无密钥评分。
4. DB 行 → 现有类型映射：`src/api/supabase/mappers.ts` 把 Postgres 行转成现有 `Video` / `Author` / `Comment` 等类型，保证屏幕零改动。
5. 密钥下沉：豆包密钥从客户端移到 Edge Function，客户端只调自己的后端。

被否决的方案：

- 方案 B（仓库接口 + 双实现按 env 切换）：分离最干净，但本次目标是迁移到后端而非长期双跑，scaffolding 超出课程时间线需要（YAGNI）。借用其「保底开关」一个点子。
- 方案 C（拆掉 store，屏幕直连 Supabase）：数据访问散落 UI，丢失 DAO 接缝，最难测、回归风险最大。否决。

## 4. 数据库表结构

Supabase 自带 `auth.users`（邮箱+密码）。业务表建在 `public` schema，全部开 RLS。

```sql
-- 1. profiles：用户公开资料，1:1 关联 auth.users
profiles (
  id          uuid PK references auth.users(id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  created_at  timestamptz default now()
)

-- 2. videos：视频内容
videos (
  id            uuid PK default gen_random_uuid(),
  author_id     uuid references profiles(id) on delete set null,
  parent_id     uuid references videos(id),
  root_id       uuid not null,
  remix_kind    text,                 -- continuation|prompt_remix|edit
  depth         int default 0,
  prompt        text not null,
  video_url     text not null,        -- 指向 Storage
  thumbnail_url text, tail_frame_url text,
  duration_ms   int, width int, height int,
  ai_provider   text,
  edit_metadata jsonb,                 -- trim/captions/filter/bgm
  status        text default 'ready',
  visibility    text default 'private',-- private=草稿 public=已发布
  play_count    int default 0,         -- 仅 play_count 存冗余列
  created_at    timestamptz default now()
)

-- 3. likes
likes (
  user_id   uuid references profiles(id) on delete cascade,
  video_id  uuid references videos(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, video_id)       -- 天然防重复点赞
)

-- 4. comments
comments (
  id        uuid PK default gen_random_uuid(),
  video_id  uuid references videos(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body      text not null,
  created_at timestamptz default now()
)

-- 5. credits
credits (
  user_id  uuid PK references profiles(id) on delete cascade,
  balance  int not null default 5        -- FREE_INITIAL_CREDITS
)
```

统计数策略：

- `like_count` / `comment_count` / `fork_count`（`count(videos where parent_id=...)`）用数据库视图或聚合实时算，不存冗余字段，避免计数不一致。
- `play_count` 单独存 videos 一列，`bumpStat` 直接 +1（高频、可容忍弱一致）。
- 提供一个 `video_with_stats` 视图，把 videos 行 join 上述聚合，供 feed 一次查出。

## 5. RLS 权限与触发器

| 表 | 读 | 写 |
|---|---|---|
| profiles | 所有人可读 | 只能改自己的（id = auth.uid()） |
| videos | `visibility='public'` 所有人可读；自己的草稿只有自己可读 | 只能增改删自己的（author_id = auth.uid()） |
| likes | 所有人可读 | 只能增删自己的（user_id = auth.uid()） |
| comments | 跟随视频可见性 | 登录才能发；只能删自己的 |
| credits | 只能读自己的 | 客户端禁止直接改；只能由 Edge Function（service role）扣减 |

额度安全：`credits.balance` 客户端只读。扣额度只发生在 `generate-video` Edge Function 内（service role 绕过 RLS），防止前端篡改白嫖。

新用户初始化：建 `on auth.user created` 触发器，自动插入 `profiles` 行（username 来自注册元数据）+ `credits` 行（余额 5）。注册即就绪。

## 6. 认证流程与客户端改动

`src/store/auth.ts`：

```
signUp(email, password, username) → supabase.auth.signUp(带 username 元数据) → 触发器建 profile/credits
signIn(email, password)           → supabase.auth.signInWithPassword
signOut()                         → supabase.auth.signOut
requireAuth(router)               → 未登录跳 /auth/login（保留）
```

会话持久化：

- 接入 `@react-native-async-storage/async-storage` 作为 Supabase session 存储（RN 默认无 localStorage）。App 重启后登录态保留。
- `src/api/client.ts` 的 client 配置增加 `storage: AsyncStorage`。

启动恢复会话（`app/_layout.tsx`）：

- 启动调 `supabase.auth.getSession()` 恢复登录态。
- 订阅 `onAuthStateChange`，登录/登出同步到 `useAuth` store。
- 把 Supabase user 映射成现有 `AuthUser`（id=uuid, username=profile.username）。

登录界面（`app/auth/login.tsx`）：

- 邮箱 + 密码两个框 + 「注册 / 登录」切换。
- 注册时额外要用户名，沿用现有 2–20 字符、字母/数字/下划线/中文校验。
- 保留「先不登录，继续看视频」匿名入口。匿名可刷公开 feed；生成/点赞/评论时触发 `requireAuth`。

演示便利：

- Supabase 后台关闭邮箱验证（confirm email），注册后直接可用。
- 路线图标注：真上架时重新开启邮箱验证。

新增依赖：`@react-native-async-storage/async-storage`（Expo 兼容）。

## 7. 视频生成 · Edge Function · Storage 转存

改后流程（同步模式）：

```
客户端 generateVideo(prompt)
   │
   ▼
Edge Function `generate-video`（密钥在服务端 secrets）
   1. 校验登录态（JWT）
   2. 检查 credits.balance ≥ 1，不足直接拒绝
   3. service role 扣 1 额度（先扣，失败再退）
   4. 调豆包 textToVideo / imageToVideo，轮询直到出片
   5. 下载豆包返回的视频 + 尾帧
   6. 上传到 Supabase Storage（bucket: videos / thumbnails）
   7. 往 videos 表插一行（video_url 指向 Storage 永久地址）
   8. 返回新 video 行
   │
   ▼
客户端拿到结果 → react-query 刷新 feed
```

同步模式风险与对策：

- 豆包一次 1–2 分钟，可能撞 Edge Function 同步超时。
- 把 Edge Function 超时配到上限（约 150 秒墙钟时间）。
- 客户端 `waitForJob` 保留超时兜底：撞上限则提示重试，并由 Edge Function 退还额度。
- 路线图标注：若豆包经常超时，升级为异步两段式（`generate-video` 发起 + `get-job` 轮询 + 状态表）。

Storage 设计：

- bucket `videos`（公开读）、`thumbnails`（公开读）。
- 文件路径 `{user_id}/{video_id}.mp4`，避免命名冲突。
- 转存后视频永久有效，多设备可看（全量迁移的必要条件）。

额度扣减（防白嫖）：

- 在 Edge Function 里用 service role 扣，客户端无法绕过。
- 生成失败 → 退回额度（对应现有 `credits.refund`）。
- 续写 / Remix 各扣 1；剪辑发布（不调 AI）不扣。沿用现有规则。

4 个生成入口都改走 Edge Function：

- `generateVideo`（文生）、`continueVideo`（尾帧续写）、`remixVideo`（改 prompt）、`publishEdit`（不调 AI，仅插行 + 复制父视频 URL）。

保底：`hasSupabase=false` 时这些函数仍走现有 Mock provider + 本地 store。

## 8. 完整路线图

- M1 ✅ 已完成：前端全功能、Mock 数据、本地 store、5 个新 demo 视频已接入。
- M2（本次）账号与会话：AsyncStorage 持久化；`auth.ts` 真 Auth；登录页改邮箱+密码+用户名；`profiles`+`credits` 表+触发器+RLS；根布局恢复会话。
  - 出口：能注册/登录，重启仍在线，资料存云端。
- M3（本次）内容全量上云：`videos`/`likes`/`comments` 表+RLS+计数视图；`src/api/supabase/*` 仓库+mappers；DAO 各函数改走 Supabase（保留保底）；Storage bucket；Edge Function `generate-video`；4 个生成入口改造；demo 视频 seed 脚本。
  - 出口：多设备登录看到同一份数据，生成视频永久可看，额度服务端扣减。
- M4（后续）打磨稳健：全局错误边界、网络重试、加载/空/错态统一、react-query 缓存策略、举报/屏蔽、基础埋点。
- M5（后续，仅当真上架）：EAS Build 原生构建、重开邮箱验证、隐私政策/用户协议页、图标启动图商店素材、内容审核、付费/额度购买、商店审核。

## 9. 本次交付物清单

- `supabase/migrations/*.sql`：表 + RLS + 触发器 + 视图。
- `supabase/functions/generate-video/`：Edge Function。
- `src/api/supabase/`：5 个仓库 + `mappers.ts`。
- 改造：`src/store/auth.ts`、`app/auth/login.tsx`、`app/_layout.tsx`、`src/api/client.ts`、`src/api/videos.ts`、各生成入口、`src/store/credits.ts`（改读云端）。
- 一次性 seed 脚本：把 5 个 demo 视频灌入云端。
- 更新 `.env.example` 与 README 配置说明。
- 新增依赖：`@react-native-async-storage/async-storage`。

## 10. 测试策略

- 仓库层（`src/api/supabase/*`）和 `mappers.ts`：纯函数/映射逻辑写单元测试。
- Edge Function 额度扣减/退还逻辑：重点测（成功扣 1、失败退还、余额不足拒绝）。
- RLS：用非 owner 身份验证读写被拒。
- 认证流程：手动验证「注册 → 重启 App → 仍在线」「多设备登录看到同一数据」。
- 保底开关：`hasSupabase=false` 时本地 Mock 仍可跑。

## 11. 风险与决策记录

- Edge Function 同步超时：已选同步模式，配满超时 + 客户端兜底 + 退额度；超时频发再升级异步。
- 豆包成本：一次约 25 万 tokens / 5 秒视频，演示时控制调用次数。
- 邮箱验证：演示阶段关闭，上架前重开。
- 计数一致性：聚合视图实时算，play_count 例外存冗余列。
