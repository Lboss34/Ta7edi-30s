import { type Db } from "mongodb";
import {
  pingPongQuestions,
  auctionTopics,
  buzzerQuestions,
  rapidQuestions,
  transferPuzzles,
  tiebreakerPuzzles,
} from "./seed-data";
import { logger } from "./logger";

const REQUIRED_COUNTS: Record<string, number> = {
  round1_questions: pingPongQuestions.length,
  round2_questions: auctionTopics.length,
  round3_questions: buzzerQuestions.length,
  round4_questions: rapidQuestions.length,
  round5_questions: transferPuzzles.length,
  tiebreaker_questions: tiebreakerPuzzles.length,
};

/** Returns true if every collection has the expected number of documents. */
async function isFullySeeded(db: Db): Promise<boolean> {
  const checks = await Promise.all(
    Object.entries(REQUIRED_COUNTS).map(async ([col, expected]) => {
      const count = await db.collection(col).countDocuments();
      return count >= expected;
    }),
  );
  return checks.every(Boolean);
}

export async function seedIfEmpty(db: Db): Promise<void> {
  if (await isFullySeeded(db)) {
    logger.info("MongoDB already fully seeded — skipping");
    return;
  }

  logger.info("MongoDB collections incomplete — seeding all questions...");

  // Clear then re-insert each collection sequentially so a crash mid-way
  // leaves obviously incomplete state (round1 empty) rather than mixed state.
  const collections: Array<{ name: string; docs: object[] }> = [
    { name: "round1_questions", docs: pingPongQuestions },
    { name: "round2_questions", docs: auctionTopics },
    { name: "round3_questions", docs: buzzerQuestions },
    { name: "round4_questions", docs: rapidQuestions },
    { name: "round5_questions", docs: transferPuzzles },
    { name: "tiebreaker_questions", docs: tiebreakerPuzzles },
  ];

  for (const { name, docs } of collections) {
    await db.collection(name).deleteMany({});
    await db.collection(name).insertMany(docs);
  }

  logger.info(
    {
      round1: pingPongQuestions.length,
      round2: auctionTopics.length,
      round3: buzzerQuestions.length,
      round4: rapidQuestions.length,
      round5: transferPuzzles.length,
      tiebreaker: tiebreakerPuzzles.length,
    },
    "MongoDB seeding complete ✓",
  );
}
