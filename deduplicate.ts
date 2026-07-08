/**
 * deduplicate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time maintenance script — removes duplicate documents from all 6 game
 * collections in MongoDB Atlas.
 *
 * Run with:
 *   npx tsx deduplicate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MongoClient, type Collection, type Document } from "mongodb";

const MONGODB_URI = process.env["MONGODB_URI"];
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI environment variable is not set.");
  process.exit(1);
}

const DB_NAME = "ta7edi30";

// Key field(s) used to detect duplicates per collection
const DUPLICATE_KEYS: Record<string, string[]> = {
  round1_questions:    ["question"],
  round2_questions:    ["description"],
  round3_questions:    ["question"],
  round4_questions:    ["question"],
  round5_questions:    ["answer"],
  tiebreaker_questions: ["answer"],
};

async function deduplicateCollection(
  col: Collection<Document>,
  keyFields: string[],
): Promise<number> {
  const all = await col.find({}).toArray();
  const seen = new Map<string, string>(); // key → first _id
  const toDelete: string[] = [];

  for (const doc of all) {
    const key = keyFields.map(f => JSON.stringify(doc[f])).join("|");
    const id = doc["_id"]!.toString();
    if (seen.has(key)) {
      toDelete.push(id);
    } else {
      seen.set(key, id);
    }
  }

  if (toDelete.length > 0) {
    await col.deleteMany({
      _id: { $in: toDelete.map(id => {
        const { ObjectId } = require("mongodb");
        return new ObjectId(id);
      }) },
    });
  }

  return toDelete.length;
}

async function run(): Promise<void> {
  const client = new MongoClient(MONGODB_URI as string);

  try {
    await client.connect();
    console.log("✅  Connected to MongoDB Atlas\n");

    const db = client.db(DB_NAME);
    let totalDeleted = 0;

    for (const [colName, keyFields] of Object.entries(DUPLICATE_KEYS)) {
      const col = db.collection(colName);
      const deleted = await deduplicateCollection(col, keyFields);
      totalDeleted += deleted;
      if (deleted === 0) {
        console.log(`✅  ${colName}: لا يوجد تكرار`);
      } else {
        console.log(`🗑️   ${colName}: حُذف ${deleted} تكرار`);
      }
    }

    console.log(`\n🎉  اكتمل — إجمالي المحذوف: ${totalDeleted} وثيقة`);
  } catch (err) {
    console.error("❌  فشل:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
