import { API_BASE } from './apiClient';

export interface LeaderboardEntry {
  playerName: string;
  bestScore:  number;
  gamesWon:   number;
  lastPlayed: number;
}

/**
 * Fetches the full leaderboard from MongoDB via the API server.
 * Returns an empty array on any failure so the UI degrades gracefully.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as LeaderboardEntry[];
  } catch (err) {
    console.warn('[leaderboard] getLeaderboard failed:', err);
    return [];
  }
}

/**
 * Sends a win to the API. MongoDB upserts the document:
 * - If the player is new  → creates an entry.
 * - If the player exists  → updates bestScore only when the new score is higher;
 *                            always increments gamesWon.
 *
 * Returns { entry, isNewRecord } from the server, or null on failure.
 */
export async function addLeaderboardEntry(
  playerName: string,
  score: number,
): Promise<{ entry: LeaderboardEntry; isNewRecord: boolean } | null> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({ playerName: playerName.trim().slice(0, 20), score }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[leaderboard] addLeaderboardEntry failed:', err);
    return null;
  }
}
