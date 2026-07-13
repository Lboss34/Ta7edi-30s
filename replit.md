# تحدي الثلاثين (The Thirty Challenge)

A mobile trivia/competition game built with Expo (React Native), featuring 5 game rounds, a leaderboard, and results screen.

## Run & Operate

- Configured workflows:
  - **API Server** (`artifacts/api-server: API Server`) — `PORT=8080 pnpm --filter @workspace/api-server run dev` — running
  - **Mobile (Expo)** (`artifacts/mobile`, config at `artifacts/mobile/.replit-artifact/artifact.toml`) — must be started/previewed from replit.com (not the iOS app); command: `PORT=18115 BASE_PATH=/ pnpm --filter @workspace/mobile run dev`. No workflow is currently running for it — start it from replit.com when needed.
- `pnpm --filter @workspace/api-server run dev` — run the API server manually (port is env-driven via `PORT`, no default)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (used by `lib/db` Drizzle setup)
- Required env: `PORT` — port for API server (injected automatically by Replit; required, no default fallback in code)
- Required env: `MONGODB_URI` — MongoDB connection string; questions are served from MongoDB collections (`round1_questions`, etc.); if unset, questions API is disabled and the mobile app falls back to local data
  - Connected and healthy — seeded counts confirmed via `GET /api/questions/status`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- **اللغة**: التواصل دائماً باللغة العربية بين المستخدم والـ Agent.
- **هوية اللعبة**: اللعبة هي "تحدي الثلاثين" المشهورة على يوتيوب من تقديم مساعد الفوزان — كل واجهات اللعبة باللغة العربية.
- **لا تعديلات كبيرة**: تجنّب إعادة هيكلة المشروع أو تغيير الـ stack — فقط تعديلات خفيفة وإضافات مدروسة.

## Gotchas

- **Build libs before typechecking api-server**: `lib/api-zod` and `lib/db` use TypeScript project references (`composite: true`). Run `pnpm --filter @workspace/api-zod exec tsc -p tsconfig.json && pnpm --filter @workspace/db exec tsc -p tsconfig.json` before running `pnpm --filter @workspace/api-server run typecheck`, otherwise you'll get "Output file has not been built from source file" errors.
- **MongoDB `mongodb+srv://` DNS lookups fail in this dev sandbox**: the default resolver returns `ESERVFAIL` for SRV records. Fixed in `artifacts/api-server/src/lib/mongodb.ts` by pointing Node's DNS resolver at `8.8.8.8`/`1.1.1.1` before connecting.
- **Mobile `apiClient.ts` (`artifacts/mobile/lib/apiClient.ts`)** intentionally hardcodes the published `.replit.app` deployment URL, not the `.replit.dev` dev-preview domain — update it if/when a new deployment URL is issued.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
