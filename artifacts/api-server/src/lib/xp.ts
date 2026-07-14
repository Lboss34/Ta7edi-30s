/**
 * Shared XP / level / wins logic — single source of truth for the
 * PUBG-style progressive leveling curve, used by both the manual
 * POST /api/game/reward route and the online-multiplayer engine
 * (which awards rewards automatically when a match finishes).
 *
 * XP curve:      NextLevelXP = 100 * (currentLevel ^ 1.5)
 * XP awarded:    Played a match: +50 XP   |   Won a match: +200 XP total (50 + 150 bonus)
 */
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

export function xpForNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export interface MatchRewardResult {
  level: number;
  xp: number;
  totalWins: number;
  xpGain: number;
  leveledUp: boolean;
}

/**
 * Applies match-end XP/level/wins to a single user document and persists it.
 * Safe to call for every player in a finished match (won=true for the winner
 * only; everyone else gets the smaller "played" XP amount).
 */
export async function applyMatchReward(
  db: Db,
  userId: string,
  won: boolean,
): Promise<MatchRewardResult | null> {
  const users = db.collection("users");
  let objectId: InstanceType<typeof ObjectId>;
  try {
    objectId = new ObjectId(userId);
  } catch {
    return null;
  }

  const user = await users.findOne({ _id: objectId });
  if (!user) return null;

  let level     = (user["level"]     as number) ?? 1;
  let xp        = (user["xp"]        as number) ?? 0;
  let totalWins = (user["totalWins"] as number) ?? 0;
  const startLevel = level;

  const xpGain = won ? 200 : 50;
  xp += xpGain;
  if (won) totalWins += 1;

  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level += 1;
  }

  await users.updateOne({ _id: objectId }, { $set: { level, xp, totalWins } });

  return { level, xp, totalWins, xpGain, leveledUp: level > startLevel };
}
