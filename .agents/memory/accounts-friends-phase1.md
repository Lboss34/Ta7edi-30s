---
name: Accounts/Friends Phase 1 architecture
description: Mongo-backed custom auth (HMAC-hashed bearer tokens), 6-digit uniqueId, Socket.io mounted at /api/socket.io for the artifact proxy; leveling added in V2
---

# Auth / User Architecture

## Auth
- Custom bearer token auth — HMAC-hashed, stored in MongoDB `users` collection.
- Tokens issued on register/login in `artifacts/api-server/src/routes/auth.ts`.
- `requireAuth` middleware checks token from `Authorization: Bearer <token>` header.

## User document fields
```
username, usernameLower, passwordHash, uniqueId (6-char),
avatar (emoji), friends: [],
level: 1, xp: 0, totalWins: 0,   ← added in leveling system (V2)
createdAt
```

## `toPublicUser` returns
`id, uniqueId, username, avatar, createdAt, level, xp, totalWins`

## Leveling system (V2, Task 2)
- XP formula: `NextLevelXP = floor(100 * currentLevel ^ 1.5)`
- Playing a match: +50 XP. Winning: +200 XP total (+150 win bonus).
- Route: `POST /api/game/reward { won: boolean }` → awards XP, level-up loop, totalWins += 1 if won.
- Route: `GET /api/game/stats` → returns level, xp, totalWins, nextLevelXp.
- Level/totalWins shown in: waiting room player rows, MatchFound ready screen, lobby profile badge.

## Socket.io
- Mounted at `/api/socket.io` — required for Replit artifact proxy path routing.
- `registerOnlineGameHandlers` called per authenticated socket connection.
- `fetchProfile(userId)` now returns `username, avatar, level, totalWins` from MongoDB.
- `player:ready` event tracked in `room.readySet: Set<string>`.

**Why:** Replit artifact proxy strips the base path, so socket must mount at the full path prefix.
