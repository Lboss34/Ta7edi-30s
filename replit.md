# تحدي الثلاثين (The Thirty Challenge)

A mobile trivia/competition game built with Expo (React Native), featuring 5 game rounds, a leaderboard, and results screen.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port is env-driven via `PORT`, defaults to 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `PORT` — port for API server (injected automatically by Replit; required, no default fallback in code)
- Optional env: `MONGODB_URI` — MongoDB connection string; if unset, questions API is disabled and app uses local fallback data

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

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Build libs before typechecking api-server**: `lib/api-zod` and `lib/db` use TypeScript project references (`composite: true`). Run `pnpm --filter @workspace/api-zod exec tsc -p tsconfig.json && pnpm --filter @workspace/db exec tsc -p tsconfig.json` before running `pnpm --filter @workspace/api-server run typecheck`, otherwise you'll get "Output file has not been built from source file" errors.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
