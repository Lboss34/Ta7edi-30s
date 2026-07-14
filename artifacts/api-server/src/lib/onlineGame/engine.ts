import type { Server } from "socket.io";
import type { Db } from "mongodb";
import { getDb } from "../mongodb";
import { applyMatchReward } from "../xp";
import { isAnswerCorrect } from "./textMatch";
import { serializeRoom } from "./rooms";
import type {
  Room,
  RoomQuestions,
  OnlinePlayer,
  PingPongQuestion,
  AuctionTopic,
  BuzzerQuestion,
  TransferPuzzle,
} from "./types";

// ─── Limits & Timings ────────────────────────────────────────────────────────
const ROUND1_QUESTIONS      = 3;     // exactly 3 questions per spec
const ROUND1_STRIKES_MAX    = 3;     // strikes per player PER QUESTION
const LIMITS = { round2: 3, round3: 10, round5: 4 };

const ROUND1_TIME_MS         = 20_000; // spec: turn timer raised to 20s
const ROUND2_BID_TIME_MS     = 6_000;
const ROUND2_COUNTDOWN_MS    = 3_000;  // "المزاد سيبدأ..." pre-answer countdown
const ROUND2_ANSWER_TIME_MS  = 30_000; // spec: strict 30s answer timer
const ROUND3_BUZZ_WINDOW_MS  = 20_000;
const ROUND3_ANSWER_TIME_MS  = 10_000;
const ROUND5_BUZZ_WINDOW_MS  = 20_000;
const ROUND5_ANSWER_TIME_MS  = 10_000;
const TIEBREAKER_BUZZ_WINDOW_MS  = 25_000;
const TIEBREAKER_ANSWER_TIME_MS  = 10_000;
// Pause (ms) after a round ends so all clients can show the synced
// round-summary popup (opponents' results/scores) before the next round.
const ROUND_END_SUMMARY_MS   = 3_200;

// ─── Utility ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function connectedActive(room: Room): OnlinePlayer[] {
  return room.players.filter((p) => p.connected);
}

function clearTimer(room: Room) {
  if (room.activeTimer) {
    clearTimeout(room.activeTimer);
    room.activeTimer = null;
  }
}

function schedule(room: Room, ms: number, fn: () => void) {
  clearTimer(room);
  room.activeTimer = setTimeout(fn, ms);
}

function emitRoom(io: Server, room: Room, event: string, payload: unknown) {
  io.to(room.code).emit(event, payload);
}

function emitToPlayer(io: Server, room: Room, userId: string, event: string, payload: unknown) {
  const player = room.players.find((p) => p.userId === userId);
  if (player?.socketId) io.to(player.socketId).emit(event, payload);
}

function broadcastRoomState(io: Server, room: Room) {
  emitRoom(io, room, "room:update", { room: serializeRoom(room) });
}

function scoreMap(room: Room): Record<string, number> {
  return Object.fromEntries(room.players.map((p) => [p.userId, p.score]));
}

function broadcastRoundStart(io: Server, room: Room, round: string) {
  emitRoom(io, room, "game:roundStart", { round, scores: scoreMap(room) });
}

/**
 * Emits a synchronized "round complete" summary (opponents' results/current
 * scores) to every player, then pauses ROUND_END_SUMMARY_MS before running
 * `next` (which sets up the following round or finishes the game). Because
 * the pause is driven by the server, all clients stay in lock-step.
 */
function broadcastRoundEnd(io: Server, room: Room, finishedRound: string, next: () => void) {
  clearTimer(room);
  emitRoom(io, room, "game:roundEnd", { round: finishedRound, scores: scoreMap(room) });
  room.activeTimer = setTimeout(next, ROUND_END_SUMMARY_MS);
}

// ─── Questions loader ────────────────────────────────────────────────────────

async function loadQuestions(db: Db, difficulty: string): Promise<RoomQuestions> {
  const filter = { difficulty };
  const [round1, round2, round3, round5, tiebreaker] = await Promise.all([
    db.collection("round1_questions").aggregate([{ $match: filter }, { $sample: { size: ROUND1_QUESTIONS } }]).toArray(),
    db.collection("round2_questions").aggregate([{ $match: filter }, { $sample: { size: LIMITS.round2 } }]).toArray(),
    db.collection("round3_questions").aggregate([{ $match: filter }, { $sample: { size: LIMITS.round3 } }]).toArray(),
    db.collection("round5_questions").aggregate([{ $match: filter }, { $sample: { size: LIMITS.round5 } }]).toArray(),
    db.collection("tiebreaker_questions").aggregate([{ $match: { difficulty: { $in: ["medium", "hard"] } } }, { $sample: { size: 10 } }]).toArray(),
  ]);
  return {
    round1:     round1     as unknown as PingPongQuestion[],
    round2:     round2     as unknown as AuctionTopic[],
    round3:     round3     as unknown as BuzzerQuestion[],
    round5:     round5     as unknown as TransferPuzzle[],
    tiebreaker: tiebreaker as unknown as TransferPuzzle[],
  };
}

export async function startGame(io: Server, db: Db, room: Room): Promise<void> {
  room.questions = await loadQuestions(db, room.difficulty);
  room.status = "playing";
  room.readySet.clear();
  room.players.forEach((p) => {
    p.score = 0;
    p.strikes = 0;
    p.outOfRound1 = false;
    p.skipUsed = false;
    p.questionStrikes = 0;
  });
  emitRoom(io, room, "game:started", { room: serializeRoom(room) });
  setupRound1(io, room);
}

// ════════════════════════════════════════════════════════════════════════════
// Round 1 — "ماذا تعرف؟"  — per-question turn-based (rewritten per spec)
//
// • Exactly 3 questions.
// • Players take turns answering the SAME question.
// • Every typed answer (right or wrong) is broadcast via game:round1Answer.
// • Each player has 3 strikes PER QUESTION (wrong answer OR timeout = 1 strike).
// • If a player hits 3 strikes on a question, the other player wins the point.
// • A correct answer immediately wins the point and moves to the next question.
// ════════════════════════════════════════════════════════════════════════════

function setupRound1(io: Server, room: Room) {
  room.currentRound = "round1";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(ROUND1_QUESTIONS, room.questions!.round1.length);
  room.turnOrder = shuffle(room.players.map((p) => p.userId));
  room.turnIndex = 0;

  if (room.maxQuestionsThisRound === 0 || room.turnOrder.length === 0) {
    setupRound2(io, room);
    return;
  }
  broadcastRoundStart(io, room, "round1");
  askRound1Question(io, room);
}

/** Reset per-question state and emit the question to all players. */
function askRound1Question(io: Server, room: Room) {
  if (room.questionIndex >= room.maxQuestionsThisRound) {
    broadcastRoundEnd(io, room, "round1", () => setupRound2(io, room));
    return;
  }

  // Reset per-question strikes for every player
  room.questionStrikes = {};
  room.players.forEach((p) => { room.questionStrikes[p.userId] = 0; });

  // Find first eligible turn starting from current turnIndex (wrap around)
  const firstIdx = findNextR1TurnIdx(room, room.turnIndex - 1);
  if (firstIdx === -1) { setupRound2(io, room); return; }
  room.turnIndex = firstIdx;

  emitRound1Turn(io, room);
}

/** Emit the current question with the current turn's player. */
function emitRound1Turn(io: Server, room: Room) {
  const question = room.questions!.round1[room.questionIndex]!;
  room.phase = "round1_turn";
  room.questionDeadline = Date.now() + ROUND1_TIME_MS;
  const turnPlayer = room.players.find((p) => p.userId === room.turnOrder[room.turnIndex])!;

  emitRoom(io, room, "game:question", {
    round:      "round1",
    phase:      room.phase,
    turnUserId: turnPlayer.userId,
    question:   { id: question.id, question: question.question },
    deadlineTs: room.questionDeadline,
    scores:     scoreMap(room),
    questionIndex: room.questionIndex,
    questionStrikes: { ...room.questionStrikes },
  });

  schedule(room, ROUND1_TIME_MS, () => handleRound1Turn(io, room, turnPlayer.userId, null));
}

/** Return the next eligible turn index (a player who has < 3 strikes on this question). */
function findNextR1TurnIdx(room: Room, fromIndex: number): number {
  const n = room.turnOrder.length;
  for (let step = 1; step <= n; step++) {
    const idx = (fromIndex + step) % n;
    const uid = room.turnOrder[idx]!;
    const strikes = room.questionStrikes[uid] ?? 0;
    if (strikes < ROUND1_STRIKES_MAX) return idx;
  }
  return -1; // everyone used all their strikes (shouldn't happen with 2 players)
}

/** Called when a player submits an answer (or timeout fires with null). */
function handleRound1Turn(io: Server, room: Room, userId: string, submittedText: string | null) {
  if (room.phase !== "round1_turn") return;
  const turnPlayer = room.players.find((p) => p.userId === room.turnOrder[room.turnIndex]);
  if (!turnPlayer || turnPlayer.userId !== userId) return;

  const question = room.questions!.round1[room.questionIndex]!;
  const correct  = submittedText !== null && isAnswerCorrect(submittedText, question.validAnswers);

  // Broadcast this answer attempt to BOTH players (spec: every answer must be visible)
  emitRoom(io, room, "game:round1Answer", {
    userId:          turnPlayer.userId,
    text:            submittedText ?? "(انتهى الوقت)",
    correct,
    questionIndex:   room.questionIndex,
    questionStrikes: { ...room.questionStrikes },
  });

  if (correct) {
    // This player wins the point for this question
    turnPlayer.score += 1;
    emitRoom(io, room, "game:answerResult", {
      round:         "round1",
      userId:        turnPlayer.userId,
      submittedText,
      correct:       true,
      correctAnswer: question.validAnswers[0] ?? "",
      scores:        scoreMap(room),
      questionStrikes: { ...room.questionStrikes },
    });
    room.questionIndex += 1;
    // Rotate so the next question starts with the other player
    const nextIdx = findNextR1TurnIdx(room, room.turnIndex);
    if (nextIdx !== -1) room.turnIndex = nextIdx;
    setTimeout(() => askRound1Question(io, room), 1800);
    return;
  }

  // Wrong / timeout — add a strike for this player on this question
  room.questionStrikes[userId] = (room.questionStrikes[userId] ?? 0) + 1;
  const myStrikes = room.questionStrikes[userId]!;

  if (myStrikes >= ROUND1_STRIKES_MAX) {
    // This player exhausted all strikes → opponent wins the point
    const opponentId = room.turnOrder.find((uid) =>
      uid !== userId && (room.questionStrikes[uid] ?? 0) < ROUND1_STRIKES_MAX,
    ) ?? null;

    if (opponentId) {
      const opponent = room.players.find((p) => p.userId === opponentId);
      if (opponent) opponent.score += 1;
    }

    emitRoom(io, room, "game:answerResult", {
      round:           "round1",
      userId:          opponentId,   // winner by forfeit (null if both exhausted)
      submittedText,
      correct:         false,
      correctAnswer:   question.validAnswers[0] ?? "",
      scores:          scoreMap(room),
      questionStrikes: { ...room.questionStrikes },
      strikeOut:       true,         // signal: question ended by strike-out
    });

    room.questionIndex += 1;
    const nextIdx = findNextR1TurnIdx(room, room.turnIndex);
    if (nextIdx !== -1) room.turnIndex = nextIdx;
    setTimeout(() => askRound1Question(io, room), 1800);
    return;
  }

  // Still have strikes left — pass turn to the next eligible player on this question
  const nextIdx = findNextR1TurnIdx(room, room.turnIndex);
  if (nextIdx === -1) {
    // Edge: no one can answer (shouldn't happen with 2 players unless both at 3 strikes)
    room.questionIndex += 1;
    setTimeout(() => askRound1Question(io, room), 1000);
    return;
  }
  room.turnIndex = nextIdx;
  // Short pause, then emit the same question with new turn
  setTimeout(() => emitRound1Turn(io, room), 1000);
}

export function resolveRound1FromSubmit(io: Server, room: Room, userId: string, text: string) {
  if (room.phase !== "round1_turn") return;
  const turnPlayer = room.players.find((p) => p.userId === room.turnOrder[room.turnIndex]);
  if (!turnPlayer || turnPlayer.userId !== userId) return;
  clearTimer(room);
  handleRound1Turn(io, room, userId, text);
}

export function handleSkip(io: Server, room: Room, userId: string) {
  // Skip is only valid in Round 1 for the current turn player
  if (room.phase !== "round1_turn") return;
  const turnPlayer = room.players.find((p) => p.userId === room.turnOrder[room.turnIndex]);
  if (!turnPlayer || turnPlayer.userId !== userId || turnPlayer.skipUsed) return;
  turnPlayer.skipUsed = true;
  clearTimer(room);
  // Treat a skip as a timeout (null answer) — does NOT consume a strike in the new system
  // Just pass the turn to the next player without adding a strike
  emitRoom(io, room, "game:round1Answer", {
    userId:          turnPlayer.userId,
    text:            "(تخطّى)",
    correct:         false,
    skipped:         true,
    questionIndex:   room.questionIndex,
    questionStrikes: { ...room.questionStrikes },
  });
  const nextIdx = findNextR1TurnIdx(room, room.turnIndex);
  if (nextIdx === -1) {
    room.questionIndex += 1;
    setTimeout(() => askRound1Question(io, room), 1000);
    return;
  }
  room.turnIndex = nextIdx;
  setTimeout(() => emitRound1Turn(io, room), 800);
}

// ═══════════════════════════════════════════════════════════════════════════
// Round 2 — Auction (المزاد), rewritten per spec:
//   • Bidding phase: highest bidder wins when the bidding timer expires, OR
//     the other player can instantly win by clicking "Withdraw" (surrender).
//   • A 3s "المزاد سيبدأ..." countdown separates bidding from answering.
//   • Winner has a strict 30s window to name as many correct items as their
//     bid amount, submitting one guess at a time. Every guess is validated
//     instantly and broadcast (green if correct, red if wrong) — no penalty
//     for wrong guesses, matching offline's tiered scoring model.
//   • Scoring on success uses offline's tiered formula: <20 → 1pt,
//     otherwise 2 + floor((bid-20)/10). Failure (quota not met by the
//     deadline) awards 0 points.
// ═══════════════════════════════════════════════════════════════════════════

function auctionPoints(bid: number): number {
  // Flat 3-tier scoring per spec: 1–19 → 1pt, 20–29 → 2pts, 30+ → 3pts (capped).
  if (bid < 20) return 1;
  if (bid < 30) return 2;
  return 3;
}

function setupRound2(io: Server, room: Room) {
  const topics = room.questions!.round2;
  room.currentRound = "round2";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(LIMITS.round2, topics.length);
  if (room.maxQuestionsThisRound === 0) {
    setupRound3(io, room);
    return;
  }
  broadcastRoundStart(io, room, "round2");
  askRound2Topic(io, room);
}

function askRound2Topic(io: Server, room: Room) {
  if (room.questionIndex >= room.maxQuestionsThisRound) {
    broadcastRoundEnd(io, room, "round2", () => setupRound3(io, room));
    return;
  }
  const topic = room.questions!.round2[room.questionIndex]!;
  room.phase = "round2_bidding";
  room.currentBid = null;
  room.auctionWinnerUserId = null;
  room.round2CorrectCount = 0;
  room.round2WrongCount = 0;
  room.round2AnsweredSet = new Set();
  room.biddingDeadline = Date.now() + ROUND2_BID_TIME_MS;

  emitRoom(io, room, "game:question", {
    round:      "round2",
    phase:      room.phase,
    question:   { id: topic.id, category: topic.category, description: topic.description },
    deadlineTs: room.biddingDeadline,
    scores:     scoreMap(room),
  });

  schedule(room, ROUND2_BID_TIME_MS, () => closeBidding(io, room));
}

export function placeBid(room: Room, io: Server, userId: string, amount: number) {
  if (room.phase !== "round2_bidding") return;
  const player = room.players.find((p) => p.userId === userId && p.connected);
  if (!player) return;
  if (!Number.isFinite(amount) || amount < 1 || amount > Math.max(player.score, 10)) return;
  if (room.currentBid && amount <= room.currentBid.amount) return;

  room.currentBid = { userId, amount };
  room.biddingDeadline = Date.now() + ROUND2_BID_TIME_MS;
  emitRoom(io, room, "game:bidUpdate", { userId, amount, deadlineTs: room.biddingDeadline });
  schedule(room, ROUND2_BID_TIME_MS, () => closeBidding(io, room));
}

/** A player surrenders during bidding — the opponent instantly wins the auction. */
export function withdrawBid(io: Server, room: Room, userId: string) {
  if (room.phase !== "round2_bidding") return;
  const opponent = room.players.find((p) => p.userId !== userId && p.connected);
  if (!opponent) return;
  const amount = room.currentBid && room.currentBid.userId === opponent.userId
    ? room.currentBid.amount
    : Math.max(room.currentBid?.amount ?? 0, 1);

  emitRoom(io, room, "game:withdraw", { withdrawnBy: userId, winnerUserId: opponent.userId, amount });
  startRound2Countdown(io, room, opponent.userId, amount);
}

function closeBidding(io: Server, room: Room) {
  if (room.phase !== "round2_bidding") return;
  if (!room.currentBid) {
    emitRoom(io, room, "game:auctionResult", { round: "round2", winnerUserId: null, amount: 0 });
    room.questionIndex += 1;
    setTimeout(() => askRound2Topic(io, room), 1500);
    return;
  }
  startRound2Countdown(io, room, room.currentBid.userId, room.currentBid.amount);
}

/** 3-second "المزاد سيبدأ..." countdown between bidding close and the answer phase. */
function startRound2Countdown(io: Server, room: Room, winnerUserId: string, amount: number) {
  room.auctionWinnerUserId = winnerUserId;
  room.currentBid = { userId: winnerUserId, amount };
  room.phase = "round2_countdown";
  room.round2CorrectCount = 0;
  room.round2WrongCount = 0;
  room.round2AnsweredSet = new Set();

  emitRoom(io, room, "game:auctionWon", {
    winnerUserId,
    amount,
    countdownMs: ROUND2_COUNTDOWN_MS,
    startAt: Date.now() + ROUND2_COUNTDOWN_MS,
  });

  schedule(room, ROUND2_COUNTDOWN_MS, () => beginRound2Answer(io, room, winnerUserId, amount));
}

function beginRound2Answer(io: Server, room: Room, winnerUserId: string, amount: number) {
  if (room.phase !== "round2_countdown") return;
  room.phase = "round2_answer";
  room.questionDeadline = Date.now() + ROUND2_ANSWER_TIME_MS;

  emitRoom(io, room, "game:round2Start", {
    winnerUserId,
    amount,
    deadlineTs: room.questionDeadline,
  });

  schedule(room, ROUND2_ANSWER_TIME_MS, () => finishRound2(io, room, "timeout"));
}

/** Winner submits guesses one at a time; each is validated instantly (green/red). */
export function submitRound2Answer(io: Server, room: Room, userId: string, submittedText: string) {
  if (room.phase !== "round2_answer" || room.auctionWinnerUserId !== userId) return;
  const topic = room.questions!.round2[room.questionIndex]!;
  const bidAmount = room.currentBid?.amount ?? 0;

  let matchedAnswer: string | null = null;
  for (const candidate of topic.possibleAnswers) {
    const key = candidate.trim().toLowerCase();
    if (room.round2AnsweredSet.has(key)) continue;
    if (isAnswerCorrect(submittedText, [candidate])) {
      matchedAnswer = candidate;
      break;
    }
  }
  const correct = matchedAnswer !== null;

  if (correct) {
    room.round2AnsweredSet.add(matchedAnswer!.trim().toLowerCase());
    room.round2CorrectCount += 1;
  } else {
    room.round2WrongCount += 1;
  }

  emitRoom(io, room, "game:round2Answer", {
    userId,
    text: submittedText,
    correct,
    correctCount: room.round2CorrectCount,
    wrongCount: room.round2WrongCount,
    neededCount: bidAmount,
  });

  if (room.round2CorrectCount >= bidAmount) {
    finishRound2(io, room, "won");
  }
}

function finishRound2(io: Server, room: Room, outcome: "won" | "timeout") {
  if (room.phase !== "round2_answer") return;
  clearTimer(room);
  const topic = room.questions!.round2[room.questionIndex]!;
  const winner = room.players.find((p) => p.userId === room.auctionWinnerUserId);
  const bidAmount = room.currentBid?.amount ?? 0;
  let pointsAwarded = 0;

  if (outcome === "won" && winner) {
    pointsAwarded = auctionPoints(bidAmount);
    winner.score += pointsAwarded;
  }

  room.phase = "round_end";
  emitRoom(io, room, "game:round2Result", {
    winnerUserId: room.auctionWinnerUserId,
    outcome,
    pointsAwarded,
    correctCount: room.round2CorrectCount,
    bidAmount,
    possibleAnswers: topic.possibleAnswers,
    scores: scoreMap(room),
  });

  room.questionIndex += 1;
  setTimeout(() => askRound2Topic(io, room), 2200);
}

// ─────────────────────── Generic buzzer round (Round 3, Round 5, Tiebreaker) ──
// A genuine buzz-in lock, shared by every round that needs it offline too:
// eligible players race to buzz, the first buzzer gets an exclusive answer
// window, and a wrong answer bars them from the current question only
// (others may re-buzz/steal). Parameterized over the question type so
// Round 3 (BuzzerQuestion) and Round 5 / Tiebreaker (TransferPuzzle) can
// all reuse the exact same mechanic instead of duplicating it.

interface BuzzerRoundConfig<Q> {
  roundKey:          "round3" | "round5" | "tiebreaker";
  buzzPhase:         "round3_buzz" | "round5_buzz" | "tiebreaker_buzz";
  answerPhase:       "round3_answer" | "round5_answer" | "tiebreaker_answer";
  buzzWindowMs:      number;
  answerTimeMs:      number;
  pointValue:        number;
  getQuestionPublic: (q: Q) => Record<string, unknown>;
  getValidAnswers:   (q: Q) => string[];
  eligibleUserIds:   (room: Room) => string[];
  currentQuestion:   (room: Room) => Q | undefined;
  onQuestionResolved:(io: Server, room: Room, winnerUserId: string | null, correct: boolean) => void;
}

function askBuzzerQuestion<Q>(io: Server, room: Room, question: Q, cfg: BuzzerRoundConfig<Q>) {
  room.phase = cfg.buzzPhase;
  room.buzzLock = null;
  room.excludedFromBuzz = new Set();
  room.questionDeadline = Date.now() + cfg.buzzWindowMs;

  emitRoom(io, room, "game:question", {
    round:      cfg.roundKey,
    phase:      room.phase,
    question:   cfg.getQuestionPublic(question),
    deadlineTs: room.questionDeadline,
    scores:     scoreMap(room),
  });

  schedule(room, cfg.buzzWindowMs, () => {
    if (room.phase === cfg.buzzPhase) {
      revealBuzzerAnswer(io, room, question, cfg, null, false);
    }
  });
}

export function buzz<Q>(room: Room, io: Server, userId: string, cfg: BuzzerRoundConfig<Q>) {
  if (room.phase !== cfg.buzzPhase) return;
  if (room.buzzLock) return;
  if (room.excludedFromBuzz.has(userId)) return;
  if (!cfg.eligibleUserIds(room).includes(userId)) return;
  const player = room.players.find((p) => p.userId === userId && p.connected);
  if (!player) return;

  room.buzzLock = { userId, lockedAt: Date.now(), answerDeadline: Date.now() + cfg.answerTimeMs };
  room.phase = cfg.answerPhase;
  emitRoom(io, room, "game:buzzResult", { winnerUserId: userId, deadlineTs: room.buzzLock.answerDeadline });

  const question = cfg.currentQuestion(room);
  schedule(room, cfg.answerTimeMs, () => resolveBuzzerAnswer(io, room, userId, null, question!, cfg));
}

export function resolveBuzzerAnswer<Q>(
  io: Server,
  room: Room,
  userId: string,
  submittedText: string | null,
  question: Q,
  cfg: BuzzerRoundConfig<Q>,
) {
  if (room.phase !== cfg.answerPhase || room.buzzLock?.userId !== userId) return;
  const correct = submittedText !== null && isAnswerCorrect(submittedText, cfg.getValidAnswers(question));

  if (correct) {
    const player = room.players.find((p) => p.userId === userId)!;
    player.score += cfg.pointValue;
    emitRoom(io, room, "game:answerResult", {
      round:         cfg.roundKey,
      userId,
      submittedText,
      correct:       true,
      correctAnswer: cfg.getValidAnswers(question)[0] ?? "",
      scores:        scoreMap(room),
    });
    revealBuzzerAnswer(io, room, question, cfg, userId, true);
    return;
  }

  emitRoom(io, room, "game:answerResult", {
    round:   cfg.roundKey,
    userId,
    submittedText,
    correct: false,
    scores:  scoreMap(room),
  });

  room.excludedFromBuzz.add(userId);
  room.buzzLock = null;
  const remaining = cfg.eligibleUserIds(room).filter((uid) => !room.excludedFromBuzz.has(uid));
  if (remaining.length === 0) {
    revealBuzzerAnswer(io, room, question, cfg, null, false);
    return;
  }
  room.phase = cfg.buzzPhase;
  schedule(room, Math.max(1000, room.questionDeadline! - Date.now()), () => {
    if (room.phase === cfg.buzzPhase) revealBuzzerAnswer(io, room, question, cfg, null, false);
  });
}

function revealBuzzerAnswer<Q>(
  io: Server,
  room: Room,
  question: Q,
  cfg: BuzzerRoundConfig<Q>,
  winnerUserId: string | null,
  correct: boolean,
) {
  emitRoom(io, room, "game:questionReveal", {
    round:         cfg.roundKey,
    correctAnswer: cfg.getValidAnswers(question)[0] ?? "",
  });
  cfg.onQuestionResolved(io, room, winnerUserId, correct);
}

// ─── Round 3 ─────────────────────────────────────────────────────────────────

function round3Config(): BuzzerRoundConfig<BuzzerQuestion> {
  return {
    roundKey:          "round3",
    buzzPhase:         "round3_buzz",
    answerPhase:       "round3_answer",
    buzzWindowMs:      ROUND3_BUZZ_WINDOW_MS,
    answerTimeMs:      ROUND3_ANSWER_TIME_MS,
    pointValue:        1, // offline parity: 1 point per correct buzz-in answer
    getQuestionPublic: (q) => ({ id: q.id, question: q.question, choices: q.choices }),
    getValidAnswers:   (q) => [q.answer],
    eligibleUserIds:   (room) => connectedActive(room).map((p) => p.userId),
    currentQuestion:   (room) => room.questions!.round3[room.questionIndex],
    onQuestionResolved:(io, room) => {
      room.questionIndex += 1;
      setTimeout(() => askRound3Question(io, room), 1500);
    },
  };
}

function setupRound3(io: Server, room: Room) {
  const questions = room.questions!.round3;
  room.currentRound = "round3";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(LIMITS.round3, questions.length);
  if (room.maxQuestionsThisRound === 0) { setupRound5(io, room); return; }
  broadcastRoundStart(io, room, "round3");
  askRound3Question(io, room);
}

function askRound3Question(io: Server, room: Room) {
  if (room.questionIndex >= room.maxQuestionsThisRound) {
    broadcastRoundEnd(io, room, "round3", () => setupRound5(io, room));
    return;
  }
  const question = room.questions!.round3[room.questionIndex]!;
  askBuzzerQuestion(io, room, question, round3Config());
}

// ─── Round 5: Transfer Puzzle — buzzer-based (same lock mechanic as Round 3) ──
// Per spec: transfer chain (newest→oldest) is shown, players buzz in on a
// shared button; whoever buzzes first gets an exclusive answer window; a
// wrong answer locks that player out of the puzzle (others may still try);
// the first correct answer wins the point immediately. 4 puzzles.

function round5Config(): BuzzerRoundConfig<TransferPuzzle> {
  return {
    roundKey:          "round5",
    buzzPhase:         "round5_buzz",
    answerPhase:       "round5_answer",
    buzzWindowMs:      ROUND5_BUZZ_WINDOW_MS,
    answerTimeMs:      ROUND5_ANSWER_TIME_MS,
    pointValue:        1, // offline parity: 1 point for the first correct buzz
    getQuestionPublic: (q) => ({ id: q.id, transfers: q.transfers }),
    getValidAnswers:   (q) => [q.answer],
    eligibleUserIds:   (room) => connectedActive(room).map((p) => p.userId),
    currentQuestion:   (room) => room.questions!.round5[room.questionIndex],
    onQuestionResolved: (io, room) => {
      room.questionIndex += 1;
      setTimeout(() => askRound5Question(io, room), 1800);
    },
  };
}

function setupRound5(io: Server, room: Room) {
  const puzzles = room.questions!.round5;
  room.currentRound = "round5";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(LIMITS.round5, puzzles.length);
  if (room.maxQuestionsThisRound === 0) { finishGame(io, room); return; }
  broadcastRoundStart(io, room, "round5");
  askRound5Question(io, room);
}

function askRound5Question(io: Server, room: Room) {
  if (room.questionIndex >= room.maxQuestionsThisRound) {
    broadcastRoundEnd(io, room, "round5", () => finishGame(io, room));
    return;
  }
  const puzzle = room.questions!.round5[room.questionIndex]!;
  askBuzzerQuestion(io, room, puzzle, round5Config());
}

// ─── Game end + Tiebreaker ────────────────────────────────────────────────────

/**
 * Persists XP/level/totalWins for every player in the room now that the
 * match has finished. The server is the sole authority for this — the
 * client never reports match results itself. Fire-and-forget: a DB hiccup
 * here must not block the `game:over` event already sent to clients.
 *
 * Per spec, XP earned is shown ONLY on the winning player's screen: everyone
 * still gets XP/level/wins persisted server-side (losers keep progressing),
 * but the `game:xpAwarded` payload is emitted solely to the winner's socket.
 */
function awardMatchRewards(io: Server, room: Room, winnerUserId: string | null) {
  void (async () => {
    try {
      const db = await getDb();
      const results = await Promise.all(
        room.players.map(async (p) => ({
          userId: p.userId,
          reward: await applyMatchReward(db, p.userId, p.userId === winnerUserId),
        })),
      );
      if (winnerUserId) {
        const winnerResult = results.find((r) => r.userId === winnerUserId)?.reward;
        if (winnerResult) {
          emitToPlayer(io, room, winnerUserId, "game:xpAwarded", winnerResult);
        }
      }
    } catch (err) {
      console.error("[onlineGame] failed to award match rewards:", err);
    }
  })();
}

function finishGame(io: Server, room: Room) {
  const maxScore = Math.max(...room.players.map((p) => p.score));
  const tied = room.players.filter((p) => p.score === maxScore);

  if (tied.length <= 1 || room.questions!.tiebreaker.length === 0) {
    room.status = "finished";
    room.currentRound = null;
    room.phase = "game_over";
    const winnerUserId = tied[0]?.userId ?? null;
    awardMatchRewards(io, room, tied.length > 1 ? null : winnerUserId);
    emitRoom(io, room, "game:over", {
      scores:       scoreMap(room),
      winnerUserId,
      tied:         tied.length > 1 ? tied.map((p) => p.userId) : [],
    });
    return;
  }

  room.currentRound = "tiebreaker";
  room.tiebreakerPool = room.questions!.tiebreaker;
  room.tiebreakerIndex = 0;
  room.tiebreakerCandidates = tied.map((p) => p.userId);
  room.tiebreakerSkipped = new Set(room.tiebreakerPool[0] ? [room.tiebreakerPool[0].id] : []);
  broadcastRoundStart(io, room, "tiebreaker");
  askTiebreakerQuestion(io, room);
}

function tiebreakerConfig(): BuzzerRoundConfig<TransferPuzzle> {
  return {
    roundKey:          "tiebreaker",
    buzzPhase:         "tiebreaker_buzz",
    answerPhase:       "tiebreaker_answer",
    buzzWindowMs:      TIEBREAKER_BUZZ_WINDOW_MS,
    answerTimeMs:      TIEBREAKER_ANSWER_TIME_MS,
    pointValue:        0, // no score points — sudden death wins the whole game
    getQuestionPublic: (q) => ({ id: q.id, transfers: q.transfers }),
    getValidAnswers:   (q) => [q.answer],
    eligibleUserIds:   (room) => room.tiebreakerCandidates,
    currentQuestion:   (room) => room.tiebreakerPool[room.tiebreakerIndex],
    onQuestionResolved: (io, room, winnerUserId, correct) => {
      if (correct && winnerUserId) {
        room.status = "finished";
        room.phase = "game_over";
        awardMatchRewards(io, room, winnerUserId);
        emitRoom(io, room, "game:over", {
          scores:               scoreMap(room),
          winnerUserId,
          tied:                 [],
          decidedByTiebreaker:  true,
        });
        return;
      }
      room.tiebreakerIndex += 1;
      if (room.tiebreakerIndex >= room.tiebreakerPool.length) {
        room.status = "finished";
        room.phase = "game_over";
        awardMatchRewards(io, room, null);
        emitRoom(io, room, "game:over", {
          scores:       scoreMap(room),
          winnerUserId: null,
          tied:         room.tiebreakerCandidates,
          decidedByTiebreaker: false,
        });
        return;
      }
      setTimeout(() => askTiebreakerQuestion(io, room), 1800);
    },
  };
}

function askTiebreakerQuestion(io: Server, room: Room) {
  const puzzle = room.tiebreakerPool[room.tiebreakerIndex]!;
  askBuzzerQuestion(io, room, puzzle, tiebreakerConfig());
}

/**
 * Skip the current tiebreaker puzzle without buzzing — valid only while no
 * one has buzzed yet. Always advances to a *different* puzzle (never causes
 * a draw): draws randomly from puzzles not yet shown this tiebreaker, and
 * once the whole pool has been cycled through, resets exclusions so it can
 * keep cycling indefinitely. This mirrors the offline pass-and-play skip.
 */
export function handleSkipPuzzle(io: Server, room: Room, userId: string) {
  if (room.currentRound !== "tiebreaker") return;
  if (room.phase !== "tiebreaker_buzz") return;
  if (!room.tiebreakerCandidates.includes(userId)) return;

  const pool = room.tiebreakerPool;
  if (pool.length <= 1) return; // nothing else to skip to

  const current = pool[room.tiebreakerIndex];
  if (current) room.tiebreakerSkipped.add(current.id);

  let available = pool.filter((p) => !room.tiebreakerSkipped.has(p.id));
  if (available.length === 0) {
    // Exhausted the pool — reset exclusions (keep current) so skip never stalls.
    room.tiebreakerSkipped = current ? new Set([current.id]) : new Set();
    available = pool.filter((p) => !room.tiebreakerSkipped.has(p.id));
  }
  if (available.length === 0) return;

  const next = available[Math.floor(Math.random() * available.length)]!;
  room.tiebreakerIndex = pool.findIndex((p) => p.id === next.id);
  room.tiebreakerSkipped.add(next.id);

  emitRoom(io, room, "game:puzzleSkipped", { skippedBy: userId });
  askTiebreakerQuestion(io, room);
}

// ─── Shared dispatch entry points (from socket handlers) ─────────────────────

export function handleSubmitAnswer(io: Server, room: Room, userId: string, text: string) {
  switch (room.currentRound) {
    case "round1":
      resolveRound1FromSubmit(io, room, userId, text);
      return;
    case "round2":
      submitRound2Answer(io, room, userId, text);
      return;
    case "round3": {
      const q = room.questions!.round3[room.questionIndex];
      if (q) resolveBuzzerAnswer(io, room, userId, text, q, round3Config());
      return;
    }
    case "round5": {
      const q = room.questions!.round5[room.questionIndex];
      if (q) resolveBuzzerAnswer(io, room, userId, text, q, round5Config());
      return;
    }
    case "tiebreaker": {
      const q = room.tiebreakerPool[room.tiebreakerIndex];
      if (q) resolveBuzzerAnswer(io, room, userId, text, q, tiebreakerConfig());
      return;
    }
  }
}

export function handleBuzz(io: Server, room: Room, userId: string) {
  if (room.currentRound === "round3") buzz(room, io, userId, round3Config());
  else if (room.currentRound === "round5") buzz(room, io, userId, round5Config());
  else if (room.currentRound === "tiebreaker") buzz(room, io, userId, tiebreakerConfig());
}

export function handleWithdraw(io: Server, room: Room, userId: string) {
  if (room.currentRound === "round2") withdrawBid(io, room, userId);
}

/** Full state snapshot for a reconnecting client. */
export function buildStateSnapshot(room: Room) {
  return {
    room:                serializeRoom(room),
    questionDeadline:    room.questionDeadline,
    buzzLock:            room.buzzLock ? { userId: room.buzzLock.userId } : null,
    auctionWinnerUserId: room.auctionWinnerUserId,
    currentBid:          room.currentBid,
    questionStrikes:     room.questionStrikes,
  };
}
