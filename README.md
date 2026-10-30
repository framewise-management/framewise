# Framewise — PERN port

pnpm workspace porting the Framewise studio CRM to Express + React + Postgres (Supabase).

| Folder | What |
|---|---|
| `shared/` | Pure TypeScript business rules (no IO), used by server and client |
| `server/` | Express API (`/health` on port 4000) |
| `client/` | React + Vite app |
| `legacy/` | The original build-less app, kept untouched as the parity reference until cutover |

## Start

```sh
pnpm install
pnpm dev      # server + client
pnpm build    # typecheck all + client build
pnpm test     # package tests + legacy clean-start test
```

## Legacy app

```sh
python -m http.server 4188 --directory legacy/dist
```

Open http://localhost:4188. Data is saved in each browser; use Settings → Export backup to move records.
