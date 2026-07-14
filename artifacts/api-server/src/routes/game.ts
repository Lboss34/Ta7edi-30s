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
import { xpForNextLevel, applyMatchReward } from "../lib/xp";

const router: IRouter = Router();

router.post("/game/reward", requireAuth, async (req, res) => {
  const { won } = req.body as { won?: boolean };
  const isWin = won === true;

  try {
    const db     = await getDb();
    const result = await applyMatchReward(db, req.userId as string, isWin);
    if (!result) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
    res.json({ ok: true, ...result });
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
