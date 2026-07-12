import { Router, type IRouter } from "express";
import { ObjectId, type WithId, type Document } from "mongodb";
import { getDb } from "../lib/mongodb";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  sessionExpiry,
  generateUniqueId,
} from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";
import { ALLOWED_AVATARS, isAllowedAvatar } from "../lib/avatars";

const router: IRouter = Router();

// Letters (incl. Arabic), numbers, underscore. 3-20 chars.
const USERNAME_RE = /^[a-zA-Z0-9_\u0600-\u06FF]{3,20}$/;

function toPublicUser(doc: WithId<Document> | Document) {
  return {
    id: String(doc["_id"]),
    uniqueId: doc["uniqueId"] as string,
    username: doc["username"] as string,
    avatar: doc["avatar"] as string,
    createdAt: doc["createdAt"] as Date,
  };
}

// POST /api/auth/register { username, password, avatar }
router.post("/auth/register", async (req, res) => {
  const { username, password, avatar } = req.body as {
    username?: string;
    password?: string;
    avatar?: string;
  };

  if (!username || typeof username !== "string" || !USERNAME_RE.test(username.trim())) {
    res.status(400).json({
      error: "اسم المستخدم يجب أن يكون بين 3 و20 حرفًا (أحرف أو أرقام أو _)",
    });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" });
    return;
  }

  const name = username.trim();
  const chosenAvatar = isAllowedAvatar(avatar) ? avatar : ALLOWED_AVATARS[0];

  try {
    const db = await getDb();
    const users = db.collection("users");

    const existing = await users.findOne({ usernameLower: name.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: "اسم المستخدم هذا مستخدم بالفعل" });
      return;
    }

    const uniqueId = await generateUniqueId(db);
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const result = await users.insertOne({
      username: name,
      usernameLower: name.toLowerCase(),
      passwordHash,
      uniqueId,
      avatar: chosenAvatar,
      friends: [],
      createdAt: now,
    });

    const token = generateSessionToken();
    await db.collection("sessions").insertOne({
      tokenHash: hashToken(token),
      userId: result.insertedId,
      createdAt: now,
      expiresAt: sessionExpiry(),
    });

    res.status(201).json({
      token,
      user: toPublicUser({
        _id: result.insertedId,
        username: name,
        uniqueId,
        avatar: chosenAvatar,
        createdAt: now,
      }),
    });
  } catch (err) {
    console.error("[auth] register failed:", err);
    res.status(500).json({ error: "فشل إنشاء الحساب" });
  }
});

// POST /api/auth/login { username, password }
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    return;
  }

  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ usernameLower: username.trim().toLowerCase() });

    if (!user || !(await verifyPassword(password, user["passwordHash"]))) {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }

    const token = generateSessionToken();
    const now = new Date();
    await db.collection("sessions").insertOne({
      tokenHash: hashToken(token),
      userId: user["_id"],
      createdAt: now,
      expiresAt: sessionExpiry(),
    });

    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error("[auth] login failed:", err);
    res.status(500).json({ error: "فشل تسجيل الدخول" });
  }
});

// POST /api/auth/logout — revokes the current session token
router.post("/auth/logout", requireAuth, async (req, res) => {
  const token = req.headers.authorization!.slice("Bearer ".length);
  try {
    const db = await getDb();
    await db.collection("sessions").deleteOne({ tokenHash: hashToken(token) });
    res.json({ ok: true });
  } catch (err) {
    console.error("[auth] logout failed:", err);
    res.status(500).json({ error: "فشل تسجيل الخروج" });
  }
});

// GET /api/auth/me — current authenticated profile
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.userId) });
    if (!user) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("[auth] me failed:", err);
    res.status(500).json({ error: "فشل تحميل الملف الشخصي" });
  }
});

export default router;
