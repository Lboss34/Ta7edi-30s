/**
 * Game reward route — awards XP and updates stats after a match.
 * POST /api/game/reward  { won: boolean }
 *
 * XP curve (PUBG-style progressive):
 *   NextLevelXP = 100 * (currentLevel ^ 1.5)
 *
 * XP awarded:
 *   Played a match:  +50 XP
 *   Won a match:     +150 XP bonus  +  totalWins += 1
 */
import { Router, type IRouter } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/mongodb";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function xpForNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

router.post("/game/reward", requireAuth, async (req, res) => {
  const { won } = req.body as { won?: boolean };
  const isWin = won === true;

  try {
    const db    = await getDb();
    const users = db.collection("users");
    const user  = await users.findOne({ _id: new ObjectId(req.userId) });
    if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

    let level     = (user["level"]     as number) ?? 1;
    let xp        = (user["xp"]        as number) ?? 0;
    let totalWins = (user["totalWins"] as number) ?? 0;

    const xpGain = isWin ? 200 : 50; // 50 for playing, 150 bonus for winning
    xp += xpGain;
    if (isWin) totalWins += 1;

    // Level up loop
    while (xp >= xpForNextLevel(level)) {
      xp -= xpForNextLevel(level);
      level += 1;
    }

    await users.updateOne(
      { _id: new ObjectId(req.userId) },
      { $set: { level, xp, totalWins } },
    );

    res.json({ ok: true, level, xp, totalWins, xpGain, leveledUp: level > ((user["level"] as number) ?? 1) });
  } catch (err) {
    console.error("[game/reward] failed:", err);
    res.status(500).json({ error: "فشل تحديث الإحصائيات" });
  }
});

// GET /api/game/stats — fetch current user's stats
router.get("/game/stats", requireAuth, async (req, res) => {
  try {
    const db   = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.userId) });
    if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
    res.json({
      level:     (user["level"]     as number) ?? 1,
      xp:        (user["xp"]        as number) ?? 0,
      totalWins: (user["totalWins"] as number) ?? 0,
      nextLevelXp: xpForNextLevel((user["level"] as number) ?? 1),
    });
  } catch (err) {
    res.status(500).json({ error: "فشل تحميل الإحصائيات" });
  }
});

export default router;
