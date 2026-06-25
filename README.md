# AI Shorts — AI 短视频 App (COMP7506 课程项目)

像抖音一样上下滑刷 AI 视频。用户可以:
- **匿名刷 Feed** — 进 App 即可纵向翻页观看 AI 视频
- **生成自己的视频** — 写一段中文 prompt,AI 出片,自动入流
- **基于他人视频续写** — 以原视频的尾帧为起点生成新一段(分支树)
- **Remix** — 改写 prompt,在原视频主题上重新创作
- **剪辑后重发** — 加字幕/滤镜,非破坏性编辑
- **看自己的收获** — 播放数、点赞数、被续写次数(`fork_count`)

## 技术栈

| 层 | 选择 |
|---|---|
| 框架 | React Native 0.81 + Expo SDK 54 + TypeScript |
| 路由 | expo-router (file-based) |
| 视频播放 | expo-video |
| 翻页 | react-native-pager-view (纵向) |
| 列表 | @shopify/flash-list |
| 后端 (M2+) | Supabase (Postgres + Auth + Storage + Edge Functions) |
| 状态 | zustand + @tanstack/react-query |
| AI 视频 (M2+) | 可灵 Kling(通过 `VideoGenProvider` 抽象) |
| 图标 | lucide-react-native |

## 目录速览

```
app/                  # expo-router 路由
  (tabs)/             # 主 tab(Feed / 创作 / 通知 / 个人)
  video/[id].tsx      # 视频详情 + 版本树
  remix/[id].tsx      # 续写 / Prompt Remix
  editor/[id].tsx     # 剪辑器
  auth/login.tsx      # 登录
src/
  api/                # DAO 层(Supabase + 类型)
  ai/                 # VideoGenProvider + Mock + Kling
  components/         # 业务组件(feed / player / editor / tree)
  store/              # zustand stores (auth / videos)
  theme/              # 颜色 / 间距 / 字号
supabase/             # (M2+) migrations + Edge Functions
```

## 启动

```bash
npm install
npm start            # 启动 Metro
npm run ios          # iOS Simulator
npm run android      # Android Emulator
npm run typecheck    # tsc --noEmit
```

或扫码用 **Expo Go** 在真机运行(M1 阶段不需要原生构建)。

## 后端配置（Supabase M2+）

以下步骤适用于配置真实后端。跳过这些步骤则 App 以本地 Mock 模式运行（无需任何后端）。

### 1. 建 Supabase 项目

1. 前往 [https://supabase.com](https://supabase.com)，创建新项目。
2. 在 **Project Settings → API** 里复制 **Project URL** 和 **anon public** 密钥。
3. 把这两个值填入 `.env`：
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
   EXPO_PUBLIC_AI_PROVIDER=doubao
   ```

### 2. 跑 Migrations（建表）

```bash
# 安装 Supabase CLI（如未安装）
npm install -g supabase

# 连接到远程项目（需要 project-ref 和 db password）
supabase link --project-ref <project-ref>

# 推送所有 migration
supabase db push
```

Migration 文件位于 `supabase/migrations/`。

### 3. 部署 Edge Function

```bash
# 部署 generate-video 函数
supabase functions deploy generate-video
```

### 4. 配置 Edge Function secrets

在 Supabase Dashboard → Edge Functions → generate-video → Secrets，或通过 CLI：

```bash
supabase secrets set DOUBAO_API_KEY=<你的豆包密钥>
supabase secrets set DOUBAO_BASE_URL=https://llmapi.paratera.com
supabase secrets set DOUBAO_MODEL=Doubao-Seedance-1.0-Pro
```

豆包密钥**仅放在 Edge Function secrets**，不要写入客户端 `.env`。

### 5. 关闭邮箱验证（开发阶段）

在 Supabase Dashboard → Authentication → Settings → Email → 关闭 **Confirm email**。

正式发布前再重新开启并配置 SMTP。

### 6. 跑 seed 脚本（灌入 demo 视频）

seed 脚本会把 `assets/videos/001-005.mp4` 上传到 Supabase Storage，并向 `videos` 表插入 5 行记录。

**需要先确保 Storage bucket `videos` 已存在并设为 Public**（Dashboard → Storage → New bucket → name: `videos`，勾选 Public）。

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npx tsx scripts/seed-demo-videos.ts
```

`SUPABASE_SERVICE_ROLE_KEY` 在 **Project Settings → API → service_role** 里复制。**勿提交此密钥**。

---

## 环境变量

复制 `.env.example` 到 `.env`(M1 阶段可不配,使用 Mock):

```
EXPO_PUBLIC_SUPABASE_URL=          # M2+ 配置
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # M2+ 配置
EXPO_PUBLIC_AI_PROVIDER=mock       # mock | kling
```

## 里程碑进度

- ✅ **M1 — 骨架 & Feed 可刷**
  - Expo 工程初始化、tab 路由
  - `VideoGenProvider` 抽象 + `MockProvider`(内置 10 条种子视频)
  - Feed 纵向翻页(PagerView)+ 播放/暂停/预加载
  - 创作 / 续写 / 剪辑 / 个人页跑通,使用本地内存 store
- ⏳ M2 — 接入 Supabase Auth + Postgres,实现真生成 (KlingProvider + Edge Function)
- ⏳ M3 — 续写 + 分支树持久化、`fork_count` 触发器
- ⏳ M4 — 剪辑 UI 完善、likes/comments/follows、空状态/错误态

## 三大核心设计点

### 1. `VideoGenProvider` 抽象层

`src/ai/VideoGenProvider.ts` 定义统一接口(`textToVideo` / `imageToVideo` / `getJob`)。
- `MockProvider` — M1 用,内置 10 条无版权示例,模拟 2-3 秒"生成中"
- `KlingProvider` — M2 用,通过 Supabase Edge Function 中转,密钥不进客户端
- 切换只需改 `EXPO_PUBLIC_AI_PROVIDER` 环境变量

### 2. 尾帧续写 — 零 FFmpeg MVP 方案

每条视频在生成完成时存一张 `tail_frame_url`(Kling 返回里自带,或 Cloudinary URL 变换)。
续写时直接拿这张图调 `imageToVideo`,服务端无需跑 FFmpeg。

### 3. 剪辑 = 非破坏性 JSON

剪辑产物是 `edit_metadata: EditMetadata`(裁剪/字幕/滤镜/BGM 的描述)。
`VideoPlayer` 在播放时实时叠加,**不重新编码视频文件**,因此:
- 完全跨平台,Expo Go 直接跑
- "剪辑后重发"的视频在 DB 里复用 `video_url`,只新增一行 `edit_metadata` 不同的记录

## 不在 MVP 范围

- 真金奖励、提现、KYC
- 视频客户端编码导出(剪辑结果只能 in-app 播放)
- 推送通知、长后台任务
- 商业化、内容审核
- 复杂推荐算法(MVP 用按时间排序)

## License

MIT(见 [LICENSE](./LICENSE))
