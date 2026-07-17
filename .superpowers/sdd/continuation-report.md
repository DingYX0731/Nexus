# Continuation Branch — Implementation Report

**状态**: DONE

## Commit Hashes

| 改动 | Commit |
|------|--------|
| A — 续写缺尾帧兜底 | 2c57033 |
| B data — VersionNode avatar_url + getVersionTreeRows | 395e412 |
| B UI — 版本树卡片升级 | 4744cf0 |
| C/D — stats 去点赞 + 作品/点赞 tab | 59437ff |

## 一行摘要

4 项改动全部落地：续写缺尾帧兜底(A)、版本树升级为卡片(B)、个人页 stats 精简为 4 项(C)、作品区加点赞 tab(D)；tsc 无错，vitest 25/25 通过。

## 详情

### A — 续写缺尾帧兜底
- `src/api/videos.ts` `continueVideo`：移除 `throw '缺少尾帧'`，改为 `frameUrl = tail_frame_url ?? thumbnail_url ?? null`；有帧走 imageToVideo，无帧退化 textToVideo。
- `src/store/jobs.ts` `submitContinuation`：同步移除顶部 throw，本地路径根据 frameUrl 是否存在分支到 imageToVideo / textToVideo；Supabase 路径将 frameUrl 传给 callGenerate。

### B — 版本树卡片升级
- `src/api/types.ts` `VersionNode` 增加 `author_avatar_url?: string | null`。
- `src/api/supabase/videosRepo.ts` `getVersionTreeRows` select 改为 `author:profiles!…(username,avatar_url)`，map 加 `author_avatar_url`。
- `src/api/videos.ts` 本地 fallback 同步加 `author_avatar_url`。
- `app/video/[id].tsx`：import `expo-image Image` + `UserAvatar`；版本树从简单文本行升级为卡片（缩略图 40×56 / 占位色块、UserAvatar size=20 + @username、kindBadge、prompt 截断、左侧 depth×16 缩进、当前节点高亮边框、右侧「续写」→ /remix/{id}）；上限 slice 8 → 20。

### C — stats 去掉点赞
- `app/(tabs)/profile.tsx` statsRow：删除点赞 `<Stat>`，剩 播放/被续写/关注/粉丝 4 项，各 `flex:1`，均分。

### D — 作品/点赞 tab
- `useState<'works' | 'liked'>('liked')` → 默认 `'works'`。
- `useQuery(['likedVideos', user.id], listLikedVideos, enabled=liked tab)`。
- `displayVideos = activeTab === 'works' ? videos : likedVideos`，FlatList data 指向 displayVideos。
- sectionHeader 替换为双 tab 行（样式复用已有 tabsRow/tabsItem）；各 tab 独立 EmptyState。

## Concern

- Supabase 路径 `continueVideo`（hasSupabase 分支，改动 A 未触及）仍透传 `tail_frame_url ?? undefined`；若 Edge Function 无法处理 undefined imageUrl 需后端额外兜底，但属 Edge Function 侧责任，客户端已不再 throw。
- 版本树「从此续写」按钮任何人都能点，含匿名用户；进入 /remix 后有登录墙，行为一致。
