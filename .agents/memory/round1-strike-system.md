---
name: V3.0 Round 1 Strike System
description: Round 1 completely rewritten; per-question strikes, 3 Qs, answer feed broadcast to both players
---

# Round 1 — Per-Question Turn-Based (V3.0)

## Rule
- Exactly **3 questions** (`ROUND1_QUESTIONS = 3`).
- Players take turns on the **SAME question** (alternating on wrong answers).
- Each player has **3 strikes PER QUESTION** (`ROUND1_STRIKES_MAX = 3`), reset each question.
- Correct answer → that player wins the point, next question.
- 3 strikes for one player → opponent wins the point automatically.
- Every answer attempt (right/wrong/skip/timeout) is broadcast to BOTH players via `game:round1Answer`.

## Key server state (Room)
- `room.questionStrikes: Record<userId, number>` — resets each question in `askRound1Question`.
- `room.turnIndex` tracks whose turn it is within `room.turnOrder`.
- `findNextR1TurnIdx(room, fromIndex)` returns the next eligible player (< 3 strikes on this question).

## Client state (OnlineGameState)
- `round1Answers: Round1Answer[]` — accumulated live feed for current question; cleared on new question.
- `state.question.questionStrikes: Record<string, number>` — sent with every `game:question` and `game:round1Answer`.

## Events
- `game:question` — same event reused when turn changes (same question ID → input NOT reset, turnUserId changes).
- `game:round1Answer` — broadcast on every attempt; client appends to `round1Answers`.
- `game:answerResult` — only emitted when question is CONCLUDED (point awarded).

**Why:** Per spec — players must see each other's answers live; old "one answer per turn per question" replaced.

**How to apply:** Do NOT reuse the old global `strikes` field for Round 1 display; use `question.questionStrikes` map instead.
