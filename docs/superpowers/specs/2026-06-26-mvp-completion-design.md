# MVP 完备化设计（健壮性 + 社交 + 资料编辑）

- 日期：2026-06-26
- 项目：AI Shorts（COMP7506 课程项目）
- 基线：main（Supabase 后端 M2+M3 已合并）
- 目标：把 MVP 补到「交付级完备」——补齐功能闭环的洞（P0）+ 核心社交与资料能力（P1）。
- 范围：P0 全做 + P1 核心。视频删除（已完成）、付费/审核/上架（P2）不在本次。

## 1. 背景

Supabase 后端迁移已完成并合并到 main：真实账号、内容上云、异步 AI 生成、自动存草稿、评论回复。现状调研发现 7 个功能点中：删除已 95% 完成（移出范围），其余 6 项有不同程度缺口。本设计覆盖这 6 项，按依赖分 3 个子里程碑。

## 2. 子里程碑划分

一份 spec（本文档）覆盖全部；拆成 3 份 plan 分批 SDD 执行。

- **M4-A 健壮性**：统一状态组件 + 抽可复用组件、剪辑发布上云、生成中占位卡、额度 402 引导。先做（含后续复用的基础组件）。
- **M4-B 社交基建**：follows 表 + notifications 表 + 触发器、关注/取关、inbox 真数据。
- **M4-C 个人资料**：资料编辑屏（username + 头像上传 + bio）。

依赖顺序 A → B → C（B/C 复用 A 的 UserAvatar、状态组件）。

## 3. M4-A 健壮性

### 3.1 统一状态组件 + 抽可复用组件
新建 `src/components/ui/`：
- `ScreenState.tsx`：`<LoadingState>`（居中 ActivityIndicator + 可选文案）、`<ErrorState>`（错误图标 + 消息 + 重试按钮 onRetry）、`<EmptyState>`（图标 + 标题 + 副标题 + 可选 CTA）。统一深色主题。
- `UserAvatar.tsx`：`<UserAvatar user={{username, avatar_url}} size={n} />`。有 avatar_url 用 expo-image 显示图片，否则首字母色块（复用现有 hash 配色）。替换 profile/comments/inbox 散落逻辑。
- `CreditsDisplay.tsx`：统一额度显示，替换 create/settings/profile 三处重复。

接入：feed/profile/video detail/inbox 的 react-query 加 `isLoading→<LoadingState>`、`isError→<ErrorState onRetry={refetch}>`、空→`<EmptyState>`。

### 3.2 剪辑发布上云
`app/editor/[id].tsx` 发布从 `jobs.submitEditPublish()`（纯本地）改为 DAO `publishEdit()`（已有 Supabase 分支 → insertVideoRow）。react-query mutation 包装，成功 invalidate `['myVideos']`/`['feed']` + toast + 返回。`jobs.ts` 的 `submitEditPublish` 无其他引用则删除。

### 3.3 生成中占位卡 + 续轮询
- 个人页 `listMyVideoRows` 保留 `status='generating'` 行（不再被空 url 过滤滤掉；需调整过滤为"排除空 url 但保留 generating"或专门处理）。渲染为「生成中」占位卡（转圈 + prompt 预览，不可播放）。feed 仍只 public+ready。
- 进个人页时，对每个 generating 视频后台调 `poll-video` 续轮询（抽 `resumePoll(videoId)`，复用 generateClient 轮询逻辑），ready 后 invalidate `['myVideos']` 刷成正常卡。
- 不依赖内存 jobs；重启后从云端读到 generating 行继续轮询。

### 3.4 额度 402 引导
- `generateClient.callGenerate`：捕获 Edge Function 402，抛可识别错误（带 code='credits_exhausted'）。
- 客户端（jobs.ts catch / create.tsx / remix）识别该错误 → 弹「额度不足」对话框：说明 + 「领取体验额度」按钮。
- 领取落云端：新增 SECURITY DEFINER rpc `grant_credits(amount)` 给当前用户加额度（migration），客户端调用后 invalidate 额度显示。替换现有内存 grant 占位。

## 4. M4-B 社交基建

### 4.1 表结构
```sql
follows (
  follower_id uuid references profiles(id) on delete cascade,
  followee_id uuid references profiles(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (follower_id, followee_id)
)

notifications (
  id         uuid pk default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete cascade,  -- 接收者
  actor_id   uuid references profiles(id) on delete cascade,  -- 触发者
  type       text not null,         -- like|comment|fork|follow
  video_id   uuid references videos(id) on delete cascade,    -- 可空
  comment_id uuid references comments(id) on delete cascade,  -- 可空
  read       boolean not null default false,
  created_at timestamptz default now()
)
```

### 4.2 RLS
- follows：所有人可读（算粉丝/关注数）；只能增删自己的（follower_id = auth.uid()）。
- notifications：只读自己的（user_id = auth.uid()）；客户端不能 insert（只由触发器写）；可 update 自己的 read。
- 防自关注：插入触发器或 check 约束拒绝 follower_id = followee_id。

### 4.3 通知触发器（SECURITY DEFINER）
- likes insert → 给视频作者发 like 通知（actor=点赞者；自赞不发）
- comments insert → 给视频作者发 comment 通知（自评不发）
- videos insert 且 parent_id 非空 → 给父视频作者发 fork 通知（自续不发）
- follows insert → 给 followee 发 follow 通知
actor_id = 动作发起者。自己对自己的动作一律不发。

### 4.4 仓库 + DAO + UI
- `followsRepo.ts`：followUser / unfollowUser / isFollowing / getFollowCounts(userId)→{followers, following}
- `notificationsRepo.ts`：listNotifications / markAllRead / unreadCount + mapper（join actor profile + video）
- 关注按钮：视频详情页作者处 + 个人页顶部，显示 关注/已关注。
- 粉丝/关注数：个人页顶部（现有 播放/点赞/被续写 旁加 关注/粉丝）。
- inbox：listNotifications 替换 mock，按 type 渲染（图标 + actor UserAvatar + 文案 + 时间）；进页面 markAllRead；tab 未读红点（unreadCount）。

## 5. M4-C 个人资料编辑

### 5.1 DB + Storage
```sql
alter table public.profiles add column if not exists bio text;
insert into storage.buckets (id,name,public) values ('avatars','avatars',true) on conflict do nothing;
-- avatars 公开读 + 只能写/改自己目录(({user_id}/...))的 policy
```

### 5.2 依赖
expo-image-picker（用 expo install 装匹配版本；dev build 已支持原生模块）。app.json 配相册权限说明。

### 5.3 屏幕与仓库
- `app/profile/edit.tsx`（modal）：入口在个人页顶部「编辑资料」按钮。
  - 头像：image-picker 选图 → 压缩 → 上传 avatars/{uid}/avatar.jpg → publicUrl
  - username：复用 validateUsername；允许改名，撞 unique 提示「用户名已被占用」
  - bio：多行，≤80 字
  - 保存：updateProfile → invalidate profile 查询 + 同步 auth store username → 返回
- `profilesRepo.ts`：getProfile / updateProfile({username?,avatarUrl?,bio?}) / uploadAvatar(localUri)→publicUrl
- 个人页头像改用 UserAvatar，显示 bio。

### 5.4 边界
- 头像上传失败：错误提示，不阻断其他字段保存。
- username unique 冲突：明确提示。
- 图片压缩控制大小。

## 6. 交付物清单
（见各节；migration 文件、repos、屏幕、组件、依赖）

## 7. 测试策略
- 纯函数/mapper（notification mapper、follow counts）→ vitest 单测。
- 触发器（自赞不通知、自关注拦截）→ 重点手动 + SQL 层验证。
- 网络/UI → typecheck + 真机端到端。
- 每个子里程碑结束一次端到端验证。

## 8. 需人工操作
- 各子里程碑 migration（后台 SQL Editor）。
- M4-A grant_credits rpc（migration）。
- M4-C avatars bucket + bio 列。
- expo-image-picker 装后可能需重新 expo run:ios。

## 9. 风险
- 触发器漏发/错发 → 重点测自己对自己动作。
- 头像图片大小/格式 → 压缩 + 限制。
- 改 username unique 冲突 → 明确提示。
- image-picker 相册权限 → app.json 配权限说明。

## 10. 已有 M4 待办（合并自后端迁移评审，本次顺带或评估）
- 额度显示滞后（异步失败 DB 已退、UI 下次 sync 才更新）→ M4-A 的额度 invalidate 可一并解决。
- 额度并发原子性（读改写）→ 低优先，可用 rpc 原子化时一并改。
- generating 重启占位 → 正是 M4-A #3.3 解决。
- visibility toast 在 onPress 非 onSuccess → 小项，M4-A 顺手。
- profile useMemo dep cosmetic → 小项。
