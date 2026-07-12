---
name: تحدي الثلاثين — Accounts/Friends Phase 1 architecture
description: Key non-obvious decisions behind the custom auth + friends + Socket.io system (Phase 1 of the online-multiplayer plan).
---

- Accounts/sessions/friends live in **MongoDB** (`users`, `sessions`, `friendRequests` collections), not Postgres/Drizzle — an explicit user choice, diverging from what would otherwise be the primary data store. Any future auth-adjacent feature should default to Mongo for consistency unless told otherwise.
- Sessions are custom bearer tokens (not cookies — mobile app). The raw token is only ever sent to the client; the server stores `HMAC-SHA256(token, SESSION_SECRET)` and looks up by that hash, so a DB read alone can't be replayed as a session. TTL is 30 days via a Mongo TTL index on `expiresAt` (auto-expiry, no cron needed).
- Player-facing identifier is a random 6-digit numeric `uniqueId` (not the Mongo `_id`) — generated with a collision-retry loop, used for friend search/requests instead of usernames (avoids username-enumeration/uniqueness UX issues).
- Socket.io is mounted at **`/api/socket.io`** (not the library default `/socket.io`) on both server and client, because this project's artifact proxy only routes the `/api` path prefix to the API server — using the default path would silently fail to connect in the deployed/proxied environment.
- **Why:** discovered while wiring realtime presence; the REST API already only works under `/api`, so anything else attached to the same http server needs the same prefix to survive the proxy.
- Preset avatars are emoji strings validated against a fixed allow-list — kept in two files (`artifacts/api-server/src/lib/avatars.ts` and `artifacts/mobile/constants/avatars.ts`) manually in sync, no shared package. No image upload/object storage needed for this feature.
