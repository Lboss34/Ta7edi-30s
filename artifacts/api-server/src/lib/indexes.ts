import type { Db } from "mongodb";
import { logger } from "./logger";

/**
 * Creates indexes needed by the accounts/friends system. Safe to call on
 * every startup — createIndex is a no-op if an equivalent index exists.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  try {
    await db.collection("users").createIndex({ uniqueId: 1 }, { unique: true });
    await db.collection("users").createIndex({ usernameLower: 1 }, { unique: true });
    await db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true });
    // TTL index: MongoDB automatically deletes session docs once expiresAt passes.
    await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection("friendRequests").createIndex({ fromUserId: 1, toUserId: 1, status: 1 });
    await db.collection("friendRequests").createIndex({ toUserId: 1, status: 1 });
  } catch (err) {
    logger.warn({ err }, "Failed to ensure accounts/friends indexes");
  }
}
