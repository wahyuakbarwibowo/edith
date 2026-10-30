# Trello alternative (Bun + Supabase)

React SPA bundled and served by Bun. Supabase is the whole backend:

| Concern | Supabase feature |
| --- | --- |
| Data | Postgres, queried from the browser with `supabase-js` |
| Access control | Row-level security: every row is visible only to members of its workspace |
| Auth | Supabase Auth (email + password) |
| Realtime | Private broadcast topics sent by database triggers (`board:<id>`, `user:<id>`) |
| Attachments | Private Storage bucket `attachments`, served through signed URLs |
| Notifications | Triggers on new comments and workspace invites |

Schema, policies, RPCs and triggers live in `supabase/migrations`.

## Dev

```sh
bun install
cp .env.example .env            # fill in the project URL and keys
supabase link --project-ref <ref>
bun run db:push                 # apply migrations
bun run dev                     # http://localhost:3000
```

Email confirmation is off and minimum password length is 8 (`supabase/config.toml`; apply with `supabase config push`).

## Scripts

| Script | What |
| --- | --- |
| `bun run db:push` | apply new migrations to the linked project |
| `bun run db:types` | regenerate `src/shared/types/database.ts` after a schema change |
| `bun run check:rls` | end-to-end RLS/realtime/storage check against the linked project (creates and deletes throwaway users) |
| `bun run typecheck` | `bun check` |
| `bun test` | unit tests |

## Deploy

```sh
docker compose up -d --build
```

Only the static app runs on the VPS. Put it behind TLS and add the public URL to Supabase Auth's site URL / redirect URLs.
