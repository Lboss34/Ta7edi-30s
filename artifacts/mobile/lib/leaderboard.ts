import { API_BASE } from './apiClient';

export interface LeaderboardEntry {
  playerName: string;
  bestScore:  number;
  gamesWon:   number;
  lastPlayed: number;
}

export class LeaderboardFetchError extends Error {}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Fetches the full leaderboard from MongoDB via the API server.
 * Retries a couple of times (deployments can take a moment to wake from
 * sleep), then throws LeaderboardFetchError so the UI can tell a real
 * network/server failure apart from a genuinely empty leaderboard.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const attempts = 3;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    const { signal, cancel } = withTimeout(8000);
    try {
      const res = await fetch(`${API_BASE}/leaderboard`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      cancel();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Unexpected response shape');
      return data as LeaderboardEntry[];
    } catch (err) {
      cancel();
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
      }
    }
  }

  console.warn('[leaderboard] getLeaderboard failed after retries:', lastErr);
  throw new LeaderboardFetchError(
    lastErr instanceof Error ? lastErr.message : 'Unknown error',
  );
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
