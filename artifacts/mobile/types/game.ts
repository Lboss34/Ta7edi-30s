// ─────────────────────────────────────────────────────────────────────────────
// Shared game types — single source of truth for the whole mobile app
// ─────────────────────────────────────────────────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PingPongQuestion {
  id: string;
  difficulty: Difficulty;
  question: string;
  validAnswers: string[];
}

export interface Question {
  id: string;
  question: string;
  answer: string;
}

export interface Round1Set {
  id: string;
  difficulty: Difficulty;
  player1Questions: Question[];
  player2Questions: Question[];
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
