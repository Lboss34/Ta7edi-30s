import { randomBytes, randomInt, createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Db } from "mongodb";

const SESSION_SECRET = process.env["SESSION_SECRET"];
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required for auth");
}

const SALT_ROUNDS = 10;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const UNIQUE_ID_LENGTH = 6;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Opaque bearer token handed to the client. Never stored raw — see hashToken(). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * HMAC the token with SESSION_SECRET before persisting/looking it up, so a
 * read-only DB leak alone can't be replayed as a valid session token.
 */
export function hashToken(token: string): string {
  return createHmac("sha256", SESSION_SECRET as string).update(token).digest("hex");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

/** Generates a random 6-digit numeric player ID (e.g. "038492"), retrying on collision. */
export async function generateUniqueId(db: Db): Promise<string> {
  const users = db.collection("users");
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = String(randomInt(0, 1_000_000)).padStart(UNIQUE_ID_LENGTH, "0");
    const existing = await users.findOne({ uniqueId: id }, { projection: { _id: 1 } });
    if (!existing) return id;
  }
  throw new Error("Failed to generate a unique player ID after multiple attempts");
}
