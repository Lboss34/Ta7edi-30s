---
name: تحدي الثلاثين game structure
description: Expo mobile quiz game — navigation structure and rounds overview
---

## Structure
- Expo Router app under `artifacts/mobile/app/(tabs)/`, but navigation is a linear Stack (no tab bar) — `index.tsx` (setup) → `game.tsx` (round hub) → `round1..round5.tsx` → `tiebreaker.tsx` → `results.tsx`.
- `GameProvider` (in `contexts/GameContext.tsx`) wraps the app from `_layout.tsx` and holds shared state: player names, scores, current round, mute flag, difficulty.
- Sound effects are centralized in `hooks/useSounds.ts` (see `expo-audio-migration.md` for the audio API and sourcing constraints).

**Why noted:** Navigation shape (linear Stack, not tabs) is easy to assume incorrectly from the `(tabs)` directory name alone.

## Multiplayer Party Mode
- `MultiplayerProvider` wraps `GameProvider` in `_layout.tsx` — survives all screen transitions.
- `index.tsx` now has a `mode` step first: `mode → names/mp-names → difficulty/mp-difficulty`.
- Party flow: `index → /mp-game → /mp-round1 → /mp-round2 → /mp-round3 → /mp-round5 → /mp-results (or /mp-tiebreaker if tied)`.
- Round 4 is skipped: `nextRound()` in MultiplayerContext jumps 3 → 5.
- All mp-* screens registered in `(tabs)/_layout.tsx`.
- `PLAYER_COLORS` exported from MultiplayerContext: `['#7B2FFF', '#00E5FF', '#FFD700', '#FF6B00', '#00C853']`.
