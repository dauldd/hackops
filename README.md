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

Run on a Node.js server with persistent, writable disk. Mount the database directory on a persistent volume for containers. Local SQLite files are unsuitable for ephemeral serverless filesystems or multiple replicas with separate disks. This starter has no authentication; add it before hosting private notes on a public service.

References: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Node.js SQLite](https://nodejs.org/api/sqlite.html).
