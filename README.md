# Trello alternative (full Bun)

Bun.serve (REST + WebSocket + frontend bundling) · React · PostgreSQL · Drizzle · Cloudflare R2.

## Dev

```sh
bun install
cp .env.example .env          # set DATABASE_URL to a local Postgres
bun run db:migrate
bun run dev                   # http://localhost:3000 (HMR)
```

Attachments need the `R2_*` vars; without them uploads answer 503 and everything else works.

## Scripts

| Script | What |
| --- | --- |
| `bun run db:generate` | new migration after editing `src/db/schema` |
| `bun run db:migrate` | apply migrations |
| `bun run typecheck` | `bun check` |
| `bun test` | unit tests |

## Deploy (VPS)

```sh
cp .env.example .env   # set POSTGRES_PASSWORD and R2_*
docker compose up -d --build
```

The app container runs migrations on start. Put it behind a TLS reverse proxy: session cookies are `Secure` in production, and the proxy must pass the `Host` header and WebSocket upgrades through to `/ws`.
