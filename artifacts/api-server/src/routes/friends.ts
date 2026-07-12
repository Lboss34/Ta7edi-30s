import { Router, type IRouter } from "express";
import { ObjectId, type WithId, type Document } from "mongodb";
import { getDb } from "../lib/mongodb";
import { requireAuth } from "../middlewares/requireAuth";
import { isUserOnline } from "../lib/socket";

const router: IRouter = Router();

const UNIQUE_ID_RE = /^\d{6}$/;

function toPublicProfile(doc: WithId<Document> | Document) {
  return {
    id: String(doc["_id"]),
    uniqueId: doc["uniqueId"] as string,
    username: doc["username"] as string,
    avatar: doc["avatar"] as string,
  };
}

// Every route below requires a logged-in user.
router.use(requireAuth);

// GET /api/users/search?uniqueId=038492 — look someone up before sending a request
router.get("/users/search", async (req, res) => {
  const uniqueId = String(req.query["uniqueId"] ?? "").trim();
  if (!UNIQUE_ID_RE.test(uniqueId)) {
    res.status(400).json({ error: "الرقم التعريفي يجب أن يكون 6 أرقام" });
    return;
  }

  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ uniqueId });
    if (!user) {
      res.status(404).json({ error: "لا يوجد لاعب بهذا الرقم" });
      return;
    }
    if (String(user["_id"]) === req.userId) {
      res.status(400).json({ error: "هذا رقمك أنت" });
      return;
    }
    res.json({ user: toPublicProfile(user) });
  } catch (err) {
    console.error("[friends] search failed:", err);
    res.status(500).json({ error: "فشل البحث" });
  }
});

// POST /api/friends/requests { toUniqueId } — send a friend request
router.post("/friends/requests", async (req, res) => {
  const { toUniqueId } = req.body as { toUniqueId?: string };
  if (!toUniqueId || !UNIQUE_ID_RE.test(toUniqueId)) {
    res.status(400).json({ error: "الرقم التعريفي يجب أن يكون 6 أرقام" });
    return;
  }

  try {
    const db = await getDb();
    const users = db.collection("users");
    const me = await users.findOne({ _id: new ObjectId(req.userId) });
    const target = await users.findOne({ uniqueId: toUniqueId });

    if (!me) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    if (!target) {
      res.status(404).json({ error: "لا يوجد لاعب بهذا الرقم" });
      return;
    }
    if (String(target["_id"]) === req.userId) {
      res.status(400).json({ error: "لا يمكنك إضافة نفسك" });
      return;
    }

    const alreadyFriends = ((me["friends"] as ObjectId[]) ?? []).some(
      (f) => String(f) === String(target["_id"]),
    );
    if (alreadyFriends) {
      res.status(409).json({ error: "أنتما صديقان بالفعل" });
      return;
    }

    const requests = db.collection("friendRequests");
    const existing = await requests.findOne({
      fromUserId: me["_id"],
      toUserId: target["_id"],
      status: "pending",
    });
    if (existing) {
      res.status(409).json({ error: "تم إرسال طلب لهذا اللاعب بالفعل" });
      return;
    }

    // They already sent us a pending request — accept it instead of creating a duplicate.
    const reverse = await requests.findOne({
      fromUserId: target["_id"],
      toUserId: me["_id"],
      status: "pending",
    });
    if (reverse) {
      await requests.updateOne(
        { _id: reverse["_id"] },
        { $set: { status: "accepted", respondedAt: new Date() } },
      );
      await users.updateOne({ _id: me["_id"] }, { $addToSet: { friends: target["_id"] } });
      await users.updateOne({ _id: target["_id"] }, { $addToSet: { friends: me["_id"] } });
      res.status(200).json({ status: "accepted" });
      return;
    }

    await requests.insertOne({
      fromUserId: me["_id"],
      toUserId: target["_id"],
      status: "pending",
      createdAt: new Date(),
    });
    res.status(201).json({ status: "pending" });
  } catch (err) {
    console.error("[friends] request failed:", err);
    res.status(500).json({ error: "فشل إرسال طلب الصداقة" });
  }
});

// GET /api/friends/requests — my incoming pending requests
router.get("/friends/requests", async (req, res) => {
  try {
    const db = await getDb();
    const requests = await db
      .collection("friendRequests")
      .aggregate([
        { $match: { toUserId: new ObjectId(req.userId), status: "pending" } },
        { $lookup: { from: "users", localField: "fromUserId", foreignField: "_id", as: "from" } },
        { $unwind: "$from" },
        { $sort: { createdAt: -1 } },
      ])
      .toArray();

    res.json({
      requests: requests.map((r) => ({
        id: String(r["_id"]),
        from: toPublicProfile(r["from"]),
        createdAt: r["createdAt"],
      })),
    });
  } catch (err) {
    console.error("[friends] list requests failed:", err);
    res.status(500).json({ error: "فشل تحميل طلبات الصداقة" });
  }
});

// POST /api/friends/requests/:id/respond { action: 'accept' | 'decline' }
router.post("/friends/requests/:id/respond", async (req, res) => {
  const { action } = req.body as { action?: string };
  if (action !== "accept" && action !== "decline") {
    res.status(400).json({ error: "إجراء غير صالح" });
    return;
  }

  try {
    const db = await getDb();
    const requests = db.collection("friendRequests");
    const request = await requests.findOne({ _id: new ObjectId(req.params["id"]) });

    if (!request || String(request["toUserId"]) !== req.userId) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    if (request["status"] !== "pending") {
      res.status(409).json({ error: "تم الرد على هذا الطلب بالفعل" });
      return;
    }

    if (action === "accept") {
      await requests.updateOne(
        { _id: request["_id"] },
        { $set: { status: "accepted", respondedAt: new Date() } },
      );
      const users = db.collection("users");
      await users.updateOne(
        { _id: request["fromUserId"] },
        { $addToSet: { friends: request["toUserId"] } },
      );
      await users.updateOne(
        { _id: request["toUserId"] },
        { $addToSet: { friends: request["fromUserId"] } },
      );
    } else {
      await requests.updateOne(
        { _id: request["_id"] },
        { $set: { status: "declined", respondedAt: new Date() } },
      );
    }

    res.json({ status: action === "accept" ? "accepted" : "declined" });
  } catch (err) {
    console.error("[friends] respond failed:", err);
    res.status(500).json({ error: "فشل الرد على الطلب" });
  }
});

// GET /api/friends — my accepted friends, with live online status
router.get("/friends", async (req, res) => {
  try {
    const db = await getDb();
    const me = await db.collection("users").findOne({ _id: new ObjectId(req.userId) });
    if (!me) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    const friendIds: ObjectId[] = me["friends"] ?? [];
    if (friendIds.length === 0) {
      res.json({ friends: [] });
      return;
    }

    const friends = await db
      .collection("users")
      .find({ _id: { $in: friendIds } })
      .toArray();

    res.json({
      friends: friends.map((f) => ({ ...toPublicProfile(f), online: isUserOnline(String(f["_id"])) })),
    });
  } catch (err) {
    console.error("[friends] list failed:", err);
    res.status(500).json({ error: "فشل تحميل قائمة الأصدقاء" });
  }
});

// DELETE /api/friends/:friendId — remove a friend (both directions)
router.delete("/friends/:friendId", async (req, res) => {
  try {
    const db = await getDb();
    const friendId = new ObjectId(req.params["friendId"]);
    const myId = new ObjectId(req.userId);
    const users = db.collection<{ friends: ObjectId[] }>("users");
    await users.updateOne({ _id: myId }, { $pull: { friends: friendId } });
    await users.updateOne({ _id: friendId }, { $pull: { friends: myId } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[friends] remove failed:", err);
    res.status(500).json({ error: "فشل حذف الصديق" });
  }
});

export default router;
