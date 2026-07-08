import { Router, type IRouter } from "express";
import { getDb } from "../lib/mongodb";

const router: IRouter = Router();

// GET /api/questions/game?difficulty=easy|medium|hard
// Returns all questions needed for a full game in one request.
router.get("/questions/game", async (req, res) => {
  const difficulty = req.query["difficulty"] as string | undefined;
  const validDifficulties = ["easy", "medium", "hard"];

  if (!difficulty || !validDifficulties.includes(difficulty)) {
    res.status(400).json({ error: "difficulty must be one of: easy, medium, hard" });
    return;
  }

  try {
    const db = await getDb();
    const filter = { difficulty };

    const [round1, round2, round3, round4, round5, tiebreaker] = await Promise.all([
      db.collection("round1_questions").aggregate([{ $match: filter }, { $sample: { size: 50 } }]).toArray(),
      db.collection("round2_questions").aggregate([{ $match: filter }, { $sample: { size: 50 } }]).toArray(),
      db.collection("round3_questions").aggregate([{ $match: filter }, { $sample: { size: 50 } }]).toArray(),
      db.collection("round4_questions").aggregate([{ $match: filter }, { $sample: { size: 50 } }]).toArray(),
      db.collection("round5_questions").aggregate([{ $match: filter }, { $sample: { size: 50 } }]).toArray(),
      db.collection("tiebreaker_questions").aggregate([{ $match: { difficulty: { $in: ["medium", "hard"] } } }, { $sample: { size: 50 } }]).toArray(),
    ]);

    res.json({ round1, round2, round3, round4, round5, tiebreaker });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch questions from database" });
  }
});

// GET /api/questions/status — health check for DB seeding
router.get("/questions/status", async (_req, res) => {
  try {
    const db = await getDb();
    const counts = await Promise.all([
      db.collection("round1_questions").countDocuments(),
      db.collection("round2_questions").countDocuments(),
      db.collection("round3_questions").countDocuments(),
      db.collection("round4_questions").countDocuments(),
      db.collection("round5_questions").countDocuments(),
      db.collection("tiebreaker_questions").countDocuments(),
    ]);
    res.json({
      seeded: counts.every(c => c > 0),
      counts: {
        round1: counts[0],
        round2: counts[1],
        round3: counts[2],
        round4: counts[3],
        round5: counts[4],
        tiebreaker: counts[5],
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Cannot reach database" });
  }
});

export default router;
