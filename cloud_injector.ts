/**
 * cloud_injector.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone data-injection script — completely isolated from the Expo/RN app.
 * Reads MONGODB_URI from environment (already set as a Replit Secret).
 *
 * Run with:
 *   npx tsx cloud_injector.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MongoClient } from "mongodb";

// ── Connection ────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env["MONGODB_URI"];
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI environment variable is not set.");
  process.exit(1);
}

const DB_NAME = "ta7edi30";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PingPongQuestion {
  id: string;
  question: string;
  validAnswers: string[];
  difficulty: string; // أضفنا هذا
}

interface AuctionTopic {
  id: string;
  category: string;
  description: string;
  possibleAnswers: string[];
  difficulty: string; // أضفنا هذا
}

interface BuzzerQuestion {
  id: string;
  question: string;
  choices?: string[];
  answer: string;
  difficulty: string; // أضفنا هذا
}

interface RapidQuestion {
  id: string;
  question: string;
  answer: string;
  difficulty: string; // أضفنا هذا
}

interface TransferPuzzle {
  id: string;
  transfers: string[];
  answer: string;
  difficulty: string; // أضفنا هذا
}


// ── Dataset — paste your 2026 medium data here ────────────────────────────────

const round1_data: PingPongQuestion[] = [];

const round2_data: AuctionTopic[] = [];


const round3_data: BuzzerQuestion[] = [];


const round4_data: RapidQuestion[] = [];


const round5_data: TransferPuzzle[] = [];


const tiebreaker_data: TransferPuzzle[] = [];


// ── Injection ─────────────────────────────────────────────────────────────────
async function inject(): Promise<void> {
  const client = new MongoClient(MONGODB_URI as string);

  try {
    await client.connect();
    console.log("✅  Connected to MongoDB Atlas");

    const db = client.db(DB_NAME);

    const collections: Array<{
      name: string;
      docs: (PingPongQuestion | AuctionTopic | BuzzerQuestion | RapidQuestion | TransferPuzzle)[];
    }> = [
      { name: "round1_questions", docs: round1_data },
      { name: "round2_questions", docs: round2_data },
      { name: "round3_questions", docs: round3_data },
      { name: "round4_questions", docs: round4_data },
      { name: "round5_questions", docs: round5_data },
      { name: "tiebreaker_questions", docs: tiebreaker_data },
    ];

    for (const { name, docs } of collections) {
      if (docs.length === 0) {
        console.log(`⏭️   ${name}: empty — skipped`);
        continue;
      }

      // Stamp every document with difficulty: "medium"
      const stamped = docs.map((doc) => ({ ...doc, difficulty: "medium" as const }));

      // Insert without deleting existing data (use insertMany)
      const result = await db.collection(name).insertMany(stamped);
      console.log(`✅  ${name}: inserted ${result.insertedCount} documents`);
    }

    console.log("\n🎉  Injection complete!");
  } catch (err) {
    console.error("❌  Injection failed:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

inject();
