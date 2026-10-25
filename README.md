# Next.js + SQLite

A TypeScript Next.js App Router starter with a working notebook: create, list, and delete notes using Server Actions and SQLite. Uses Node's built-in SQLite driver and parameterized SQL.

## Run locally

Requires Node.js 24 or newer and pnpm (available through Corepack).
If pnpm is not enabled, run `corepack enable` first.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The database and schema are created automatically on first request at `data/app.sqlite`. Notes persist across server restarts.

Optionally copy `.env.example` to `.env.local` and set `DATABASE_PATH` to a different writable file path.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

## Structure

- `src/app/page.tsx`: server-rendered notebook
- `src/app/actions.ts`: validated create and delete actions
- `src/lib/db.ts`: connection, schema, and queries

## Deployment

### Vercel with Cloudflare D1

Use Node.js 24 in Vercel's project settings. Add these server-only environment variables to Production (and Preview if needed), then deploy the updated code:

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=your-database-id
CLOUDFLARE_API_TOKEN=your-token-with-account-D1-edit-permission
OPENROUTER_API_KEY=your-existing-key
```

All three Cloudflare variables are required together. `DATABASE_PATH` is ignored with D1 configured. Tables are created automatically on the first request; the initial SQL is also available in `migrations/0001_initial.sql`. An existing local SQLite database is not imported automatically. Initialization can create the current schema in an empty D1 database; upgrading an older D1 schema requires a migration.

Research, activity logs, visualizations, notes, and video job metadata use D1's authenticated REST query API. `npm run test:d1` tests this adapter with a simulated D1 API, without Cloudflare credentials or paid provider requests. The direct REST integration is suitable for an initial small deployment; [Cloudflare recommends a Worker API](https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/) for application traffic because REST shares the global API rate limit.

For videos, also set `VIDEO_VOICE_ID`. The default photo at `docs/images/presenter.png` is included in Git and explicitly bundled into the API functions by `next.config.ts`; no image environment variable is required. Commit the photo when deploying through Git. On Vercel, video work runs in awaited `after()` callbacks triggered by browser polls and optional webhooks. Keep the video panel open to advance jobs when callbacks are not configured. A job can wait until another poll or webhook arrives. Video processing routes request a 300-second function duration; the effective limit depends on the Vercel project configuration.

D1/Vercel mode stores a provider reference for completed videos and streams the MP4 through the authenticated content route. Playback depends on OpenRouter retaining that content; permanent MP4 archiving still requires object storage such as R2 or Blob. Existing local video files are not uploaded automatically.

### A server with persistent disk

With all Cloudflare variables unset, local SQLite remains available for development or a Node.js server with persistent writable storage. Local SQLite files are unsuitable for ephemeral serverless filesystems or replicas with separate disks. Vercel deployments fail clearly if D1 credentials are missing.

This starter has no authentication; add it before hosting private notes on a public service.

References: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Node.js SQLite](https://nodejs.org/api/sqlite.html).

Presenter video pipeline: see [setup, headless API, smoke test and provider verification status](docs/video.md).

Email agent setup and walkthrough: [docs/email.md](docs/email.md).
