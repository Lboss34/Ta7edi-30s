export type Difficulty = "easy" | "medium" | "hard";

export interface PingPongQuestion {
  id: string;
  difficulty: Difficulty;
  question: string;
  validAnswers: string[];
}
export interface AuctionTopic {
  id: string;
  difficulty: Difficulty;
  category: string;
  description: string;
  possibleAnswers: string[];
}
export interface BuzzerQuestion {
  id: string;
  difficulty: Difficulty;
  question: string;
  choices?: string[];
  answer: string;
}
export interface TransferPuzzle {
  id: string;
  difficulty: Difficulty;
  transfers: string[];
  answer: string;
}

export interface RoomQuestions {
  round1: PingPongQuestion[];
  round2: AuctionTopic[];
  round3: BuzzerQuestion[];
  round5: TransferPuzzle[];
  tiebreaker: TransferPuzzle[];
}

export type RoundKey = "round1" | "round2" | "round3" | "round5" | "tiebreaker";

export type GamePhase =
  | "lobby"
  | "round1_turn"
  | "round2_bidding"
  | "round2_countdown"
  | "round2_answer"
  | "round3_buzz"
  | "round3_answer"
  | "round5_buzz"
  | "round5_answer"
  | "tiebreaker_buzz"
  | "tiebreaker_answer"
  | "round_end"
  | "game_over";

export interface OnlinePlayer {
  userId: string;
  username: string;
  avatar: string;
  socketId: string | null;
  connected: boolean;
  score: number;
  strikes: number;         // global strikes (unused in new Round 1 but kept for compat)
  skipUsed: boolean;
  outOfRound1: boolean;
  disconnectedAt: number | null;
  isHost: boolean;
  // Leveling & stats
  level: number;
  totalWins: number;
  // Round 1 per-question state (resets each question)
  questionStrikes: number;
}

export interface BuzzLock {
  userId: string;
  lockedAt: number;
  answerDeadline: number;
}

export interface Room {
  code: string;
  mode: "group" | "quick";
  difficulty: Difficulty;
  status: "lobby" | "playing" | "finished";
  players: OnlinePlayer[];
  questions: RoomQuestions | null;

  currentRound: RoundKey | null;
  phase: GamePhase;
  questionIndex: number;
  maxQuestionsThisRound: number;

  // round1 (ping-pong turn based)
  turnOrder: string[];
  turnIndex: number;
  // Per-question strikes for Round 1 (key = userId)
  questionStrikes: Record<string, number>;

  // round2 (auction)
  currentBid: { userId: string; amount: number } | null;
  biddingDeadline: number | null;
  auctionWinnerUserId: string | null;
  // Multi-answer quota tracking during round2_answer (winner must name `amount` correct items)
  round2CorrectCount: number;
  round2WrongCount: number;
  round2AnsweredSet: Set<string>; // normalized (lowercased) matched possibleAnswers

  // round3 (buzzer race — buzz-in lock)
  buzzLock: BuzzLock | null;
  excludedFromBuzz: Set<string>;

  questionDeadline: number | null;
  activeTimer: NodeJS.Timeout | null;

  tiebreakerPool: TransferPuzzle[];
  tiebreakerIndex: number;
  tiebreakerCandidates: string[];
  // Puzzle ids already shown/skipped this tiebreaker — used so "skip" always
  // draws a different puzzle and cycles back once the pool is exhausted.
  tiebreakerSkipped: Set<string>;

  // Ready system (quick match)
  readySet: Set<string>;

  createdAt: number;
  lastActivityAt: number;
}
