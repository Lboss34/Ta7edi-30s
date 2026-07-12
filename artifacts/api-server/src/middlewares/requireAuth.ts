import type { Request, Response, NextFunction } from "express";
import { getDb } from "../lib/mongodb";
import { hashToken } from "../lib/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Express middleware: requires `Authorization: Bearer <token>`, sets req.userId. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    return;
  }

  try {
    const db = await getDb();
    const session = await db.collection("sessions").findOne({ tokenHash: hashToken(token) });

    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ error: "انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجددًا" });
      return;
    }

    req.userId = String(session.userId);
    next();
  } catch (err) {
    console.error("[auth] requireAuth failed:", err);
    res.status(500).json({ error: "فشل التحقق من الجلسة" });
  }
}
