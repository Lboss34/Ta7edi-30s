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

## Round 2 (Auction) — multi-guess quota model
- Winner of the bid must submit `amount` correct guesses before running out of time (no partial credit branch — timeout = 0 points).
- Flow: bidding → withdraw (opponent can concede anytime, instantly ends bidding in the other player's favor) → 3s "المزاد سيبدأ..." countdown (`round2_countdown` phase) → 30s answer window (`round2_answer`) with live guess feed (`round2Answers[]`) and final `round2Result` banner.
- The existing generic `deadlineTs` field is reused to drive the countdown ring for both the 3s pre-answer countdown and the 30s answer phase — avoids adding new timer plumbing.

## Rounds 3/5/Tiebreaker — buzzer vs. race split
- Round 3 kept the buzz-lock mechanic (`BuzzerUI`, phases `round3_buzz`/`round3_answer`).
- Round 5 and Tiebreaker converted to a freeform "race": no buzzer, text input open the whole window, any eligible player can guess anytime, first correct guess wins, wrong guesses don't eliminate (`RaceUI`, phases `round5_guess`/`tiebreaker_guess`).
- Race guesses reuse the generic `game:answerResult` event/`ResultOverlay` for instant feedback — no separate feed array needed (unlike Round 2's quota feed, since race has no multi-guess-by-one-player concept).

## Voice chat — fully removed
Voice chat (WebRTC P2P) was removed entirely from both frontend and backend per product decision. If voice is wanted again, it needs to be rebuilt from scratch — the old `VoiceContext.tsx`, mic buttons, and socket relay are gone.

## Profile screen
`app/(tabs)/profile.tsx` shows Level/XP-to-next-level/Total Wins via `GET /api/game/stats` (already existed server-side, returns `{level, xp, totalWins, nextLevelXp}`). Entry point: person-circle icon button next to the account button on the home screen, only shown when logged in.
