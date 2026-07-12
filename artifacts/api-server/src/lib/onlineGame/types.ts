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
export interface RapidQuestion {
  id: string;
  difficulty: Difficulty;
  question: string;
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
  round4: RapidQuestion[];
  round5: TransferPuzzle[];
  tiebreaker: TransferPuzzle[];
}

export type RoundKey = "round1" | "round2" | "round3" | "round4" | "round5" | "tiebreaker";

export type GamePhase =
  | "lobby"
  | "round1_turn"
  | "round2_bidding"
  | "round2_answer"
  | "round3_buzz"
  | "round3_answer"
  | "round4_question"
  | "round4_reveal"
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
  strikes: number;
  skipUsed: boolean;
  outOfRound1: boolean;
  disconnectedAt: number | null;
  isHost: boolean;
}

export interface BuzzLock {
  userId: string;
  lockedAt: number;
  answerDeadline: number;
}

export interface SimultaneousAnswer {
  userId: string;
  text: string;
  correct: boolean;
  submittedAt: number;
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

  // round2 (auction)
  currentBid: { userId: string; amount: number } | null;
  biddingDeadline: number | null;
  auctionWinnerUserId: string | null;

  // round3/5/tiebreaker (buzzer race)
  buzzLock: BuzzLock | null;
  excludedFromBuzz: Set<string>;

  // round4 (simultaneous rapid fire)
  simultaneousAnswers: Map<string, SimultaneousAnswer>;

  questionDeadline: number | null;
  activeTimer: NodeJS.Timeout | null;

  tiebreakerPool: TransferPuzzle[];
  tiebreakerIndex: number;
  tiebreakerCandidates: string[]; // userIds still tied, competing in sudden death

  createdAt: number;
  lastActivityAt: number;
}
