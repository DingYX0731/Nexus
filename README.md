# AI Shorts — AI short-video app (COMP7506 course project)

A TikTok-style app for AI-generated short videos. Swipe vertically through a feed and create your own clips from a text prompt.

Features:
- **Browse the feed** — vertical paging through AI videos, no account needed
- **Generate videos** — write a prompt, the AI produces a clip that lands in the feed
- **Continue a video** — generate a new segment starting from the previous clip's last frame
- **Remix** — rewrite the prompt to reinterpret a video's theme
- **Likes & comments** — engage with any video
- **Your stats** — plays, likes, and how often your videos were continued

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React Native 0.81 + Expo SDK 54 + TypeScript |
| Routing | expo-router (file-based) |
| Video | expo-video |
| Paging | react-native-pager-view (vertical) |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| State | zustand + @tanstack/react-query |
| AI video | Doubao Seedance via Paratera (through an Edge Function) |

## Quick start

```bash
npm install
npm start            # start Metro
npm run ios          # iOS Simulator
npm run android      # Android Emulator
npm run typecheck    # tsc --noEmit
```

Without a Supabase backend configured, the app runs in local mock mode (no backend required). Scan the QR code with **Expo Go** to run on a device.

## Backend setup (Supabase)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
3. Add them to `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
   EXPO_PUBLIC_AI_PROVIDER=doubao
   ```

### 2. Run migrations

```bash
npm install -g supabase           # if not installed
supabase link --project-ref <project-ref>
supabase db push
```

Migration files live in `supabase/migrations/`.

### 3. Deploy the Edge Functions

```bash
supabase functions deploy generate-video
supabase functions deploy poll-video
```

### 4. Disable email confirmation (development)

In **Authentication → Settings → Email**, turn off **Confirm email**. Re-enable it and configure SMTP before shipping to production.

### 5. Seed demo videos (optional)

Uploads `assets/videos/001-005.mp4` to Storage and inserts 5 rows into the `videos` table. First create a **Public** Storage bucket named `videos` (**Storage → New bucket**).

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npx tsx scripts/seed-demo-videos.ts
```

Copy `SUPABASE_SERVICE_ROLE_KEY` from **Project Settings → API → service_role**. Never commit this key.

> The AI API key is supplied by each user in the app's settings and sent per request — it is never stored in the client `.env` or the repo.

## License

MIT (see [LICENSE](./LICENSE))
