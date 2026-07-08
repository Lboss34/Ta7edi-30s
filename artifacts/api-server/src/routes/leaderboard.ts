import { Router, type IRouter } from "express";
import { getDb } from "../lib/mongodb";

const router: IRouter = Router();

// GET /api/leaderboard — top 20 sorted by bestScore desc
router.get("/leaderboard", async (_req, res) => {
  try {
    const db = await getDb();
    const entries = await db
      .collection("leaderboard")
      .find({})
      .sort({ bestScore: -1 })
      .limit(20)
      .toArray();
    res.json(entries);
  } catch (err) {
    console.error("[leaderboard] GET failed:", err);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

// POST /api/leaderboard — upsert winner
// Body: { playerName: string, score: number }
// Uses $max so bestScore only updates when the new score beats the old one.
// gamesWon always increments so total wins are tracked separately.
router.post("/leaderboard", async (req, res) => {
  const { playerName, score } = req.body as {
    playerName?: string;
    score?: number;
  };

  if (!playerName || typeof score !== "number" || !Number.isFinite(score) || score < 0) {
    res.status(400).json({ error: "playerName (string) and score (finite non-negative number) are required" });
    return;
  }

  const name = String(playerName).trim().slice(0, 20);
  if (!name) {
    res.status(400).json({ error: "playerName must not be empty" });
    return;
  }

  try {
    const db = await getDb();
    const col = db.collection("leaderboard");

    // Read the previous best BEFORE the upsert so we can compute isNewRecord correctly.
    const before = await col.findOne({ playerName: name });
    const previousBest: number = before?.bestScore ?? -Infinity;

    await col.updateOne(
      { playerName: name },
      {
        $max:         { bestScore: score },          // only raises when new score is higher
        $inc:         { gamesWon: 1 },               // always count the win
        $set:         { lastPlayed: Date.now() },
        $setOnInsert: { playerName: name },           // set name only on first insert
      },
      { upsert: true },
    );

    const updated = await col.findOne({ playerName: name });
    // isNewRecord is true only when the score strictly beats the previous best
    // (or it is the player's very first entry).
    const isNewRecord = score > previousBest;
    res.json({ entry: updated, isNewRecord });
  } catch (err) {
    console.error("[leaderboard] POST failed:", err);
    res.status(500).json({ error: "Failed to save leaderboard entry" });
  }
});

export default router;
