---
name: Online Multiplayer UI Architecture
description: 3 screens (lobby/waiting/game); myUserId is separate context value; phase-based single-screen game renderer; ready system added for quick match
---

# Online Multiplayer UI

## Screens
- `online-lobby.tsx` — entry point: create room / join by code (6-char code) / quick match.
- `online-waiting.tsx` — 3 visual states:
  1. Matchmaking spinner (state.matchmaking && !room)
  2. **MatchFoundScreen** — quick mode, room in lobby (NEW Task 3: Ready system)
  3. Normal group waiting room — group mode, room in lobby
- `online-game.tsx` — all rounds rendered in one screen via phase-based conditionals.

## Ready System (quick match)
- `room:matched` event → `MatchFoundScreen` shown (both players' avatars, names, level, wins).
- Each player clicks "جاهز" → emits `player:ready` → server tracks in `room.readySet`.
- Server emits `room:readyUpdate` → client updates `readyPlayers[]`.
- When ALL connected players ready → server emits `room:readyCountdown { seconds: 3 }` → auto-starts after 3s.
- Context: `sendReady()`, `readyPlayers: string[]`, `readyCountdown: number | null`.

## Context shape
- `myUserId` is a SEPARATE top-level value in the context (not inside state).
- Room code is always 6 characters (validation `code.length < 6` in lobby).
- `OnlinePlayer` now includes `level: number` and `totalWins: number`.

## Sound effects (Task 5)
- In `OnlineGameScreen`, `useSoundContext()` wired to:
  - `lastResult` change → correct→correctPlayer, wrong→wrongPlayer
  - `round1Answers` latest item → same correct/wrong logic
  - `transitionRound` change → fanfarePlayer
  - `buzzWinner` change → clickPlayer
  - `gameOver` → fanfarePlayer

**Why:** spec required sounds on socket events, not on local actions.

**How to apply:** Sound context must be provided in the tree above `OnlineGameScreen` (it is, via _layout.tsx wrapping with SoundProvider).
