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

const round1_data: PingPongQuestion[] = [
    {
      "id": "ping_rep_01",
      "question": "لاعبين أفارقة حققوا لقب هداف الدوري الإنجليزي الممتاز (البريميرليغ) عبر التاريخ",
      "validAnswers": ["ديدييه دروغبا", "محمد صلاح", "ساديو ماني", "بيير إيميريك أوباميانغ"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_02",
      "question": "مدربين إيطاليين نجحوا في الفوز بلقب الدوري الإنجليزي الممتاز (البريميرليغ)",
      "validAnswers": ["كارلو أنشيلوتي", "روبرتو مانشيني", "كلاوديو رانييري", "أنطونيو كونتي"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_03",
      "question": "أندية ألمانية حققت لقب الدوري الألماني (البوندسليغا) في الألفية الجديدة غير بايرن ميونخ ودورتموند",
      "validAnswers": ["فولفسبورغ", "شتوتغارت", "فيردر بريمن", "باير ليفركوزن"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_04",
      "question": "دول استضافت بطولة كأس أمم أوروبا (اليورو) في تنظيم مشترك (دولتين معاً)",
      "validAnswers": ["بلجيكا", "هولندا", "النمسا", "سويسرا", "بولندا", "أوكرانيا"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_05",
      "question": "لاعبين عرب سجلوا أهدافاً في نهائيات كأس العالم 2022 في قطر",
      "validAnswers": ["سالم الدوسري", "صالح الشهري", "وهبي الخزري", "حكيم زياش", "يوسف النصيري", "زكريا أبوخلال"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_06",
      "question": "أندية إنجليزية هبطت للدرجة الأولى (التشامبيونشيب) وسبق لها التتويج بلقب البريميرليغ بمسماه الجديد",
      "validAnswers": ["بلاكبيرن روفرز", "ليستر سيتي"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_07",
      "question": "حراس مرمى سجلوا أهدافاً في تاريخ بطولة دوري أبطال أوروبا",
      "validAnswers": ["هانس يورغ بوت", "فينسنت إنياما", "سنان بولاط", "إيفان بروفيديل"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_08",
      "question": "لاعبين حققوا لقب هداف كأس العالم برصيد 6 أهداف أو أكثر منذ عام 1990",
      "validAnswers": ["سالفاتوري سكيلاتشي", "هريستو ستويتشكوف", "أوليغ سالينكو", "دافور شوكر", "رونالدو نازاريو", "جيمس رودريغيز", "هاري كين", "كيليان مبابي"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_09",
      "question": "أندية حققت لقب دوري أبطال أوروبا دون التعرض لأي خسارة في البطولة خلال الألفية الجديدة",
      "validAnswers": ["برشلونة", "مانشستر يونايتد", "بايرن ميونخ", "مانشستر سيتي"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_10",
      "question": "لاعبين ارتدوا القميص رقم 10 مع منتخب الأرجنتين في بطولات كأس العالم منذ 1990",
      "validAnswers": ["دييغو مارادونا", "أرييل أورتيغا", "خوان رومان ريكيلمي", "ليونيل ميسي"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_11",
      "question": "لاعبين نجحوا في الفوز بجائزة بوشكاش لأفضل هدف في العالم (من البرازيل)",
      "validAnswers": ["نيمار داسيلفا", "وينديل ليرا", "جوييرمي مادروغا"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_12",
      "question": "أندية إسبانية لعبت في المباراة النهائية لبطولة الدوري الأوروبي (اليوروباليغ) منذ عام 2000",
      "validAnswers": ["إشبيلية", "فالنسيا", "ديبورتيفو ألافيس", "إسبانيول", "أتلتيكو مدريد", "أتلتيك بيلباو", "فياريال"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_13",
      "question": "أشخاص حققوا لقب كأس العالم كلاعب وكمدرب أيضاً",
      "validAnswers": ["ماريو زاغالو", "فرانز بيكنباور", "ديدييه ديشامب"],
      "difficulty": "medium"
    },
    {
      "id": "ping_rep_14",
      "question": "لاعبين سجلوا سوبر هاتريك (4 أهداف) في مباراة واحدة في دوري أبطال أوروبا في الألفية الجديدة",
      "validAnswers": ["دادو برشو", "رود فان نيستلروي", "أندري شيفشينكو", "ليونيل ميسي", "بافيتيمبي غوميز", "ماريو غوميز", "روبرت ليفاندوفسكي", "زلاتان إبراهيموفيتش", "كريستيانو رونالدو", "سيرج غنابري", "جوسيب إيليتشيتش", "أوليفييه جيرو", "سيباستيان هالير"],
      "difficulty": "medium"
    }
  ];

const round2_data: AuctionTopic[] = [];


const round3_data: BuzzerQuestion[] = [];


const round4_data: RapidQuestion[] = [];


const round5_data: TransferPuzzle[] = [];


const tiebreaker_data: TransferPuzzle[] = [
    {
      "id": "tb_rep_01",
      "transfers": [
        "سبورتينغ لشبونة (البرتغالي)",
        "مانشستر يونايتد (الإنجليزي)",
        "فنربخشة (التركي)",
        "فالنسيا (الإسباني)",
        "لاتسيو (الإيطالي)",
        "أورلاندو سيتي (الأمريكي)"
      ],
      "answer": "لويس ناني",
      "difficulty": "medium"
    },
    {
      "id": "tb_rep_02",
      "transfers": [
        "إنديبندينتي (الأرجنتيني)",
        "أتلتيكو مدريد (الإسباني)",
        "مانشستر سيتي (الإنجليزي)",
        "برشلونة (الإسباني)"
      ],
      "answer": "سيرجيو أغويرو",
      "difficulty": "medium"
    },
    {
      "id": "tb_rep_03",
      "transfers": [
        "أياكس (الهولندي)",
        "يوفنتوس (الإيطالي)",
        "بايرن ميونخ (الألماني)",
        "مانشستر يونايتد (الإنجليزي)"
      ],
      "answer": "ماتياس دي ليخت",
      "difficulty": "medium"
    },
    {
      "id": "tb_rep_04",
      "transfers": [
        "رين (الفرنسي)",
        "بوروسيا دورتموند (الألماني)",
        "برشلونة (الإسباني)",
        "باريس سان جيرمان (الفرنسي)"
      ],
      "answer": "عثمان ديمبيلي",
      "difficulty": "medium"
    },
    {
      "id": "tb_rep_05",
      "transfers": [
        "ملقا (الإسباني)",
        "ريال مدريد (الإسباني)",
        "إشبيلية (الإسباني)",
        "ريال بيتيس (الإسباني)"
      ],
      "answer": "إيسكو",
      "difficulty": "medium"
    }
  ];


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
