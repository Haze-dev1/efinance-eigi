import { randomUUID } from "node:crypto";
import {
  attempts,
  moduleProgress,
  users,
  type Track,
  type UserDoc,
} from "../db/mongo.ts";
import { isDuplicateKey } from "../lib/mongo-errors.ts";
import { hashPassword, verifyPassword } from "../lib/passwords.ts";

export class EmailTaken extends Error {}

/** What the client is allowed to know about itself. Never the password hash. */
export type PublicProfile = {
  id: string;
  email: string;
  track: Track | null;
  xp: number;
  tier: "free" | "pro";
  placed: boolean;
};

export function toPublic(doc: UserDoc): PublicProfile {
  return {
    id: doc._id,
    email: doc.email,
    track: doc.track,
    xp: doc.xp,
    tier: doc.tier,
    placed: doc.placedAt !== null,
  };
}

export async function createUser(
  email: string,
  password: string,
): Promise<UserDoc> {
  const doc: UserDoc = {
    _id: randomUUID(),
    email,
    emailLower: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    track: null,
    placedAt: null,
    placementScore: null,
    xp: 0,
    tier: "free",
    createdAt: new Date(),
  };

  try {
    await (await users()).insertOne(doc);
  } catch (err) {
    // The unique index on emailLower is what makes signup safe against two
    // simultaneous requests for the same address.
    if (isDuplicateKey(err, "emailLower")) throw new EmailTaken(email);
    throw err;
  }
  return doc;
}

/**
 * Returns the user only when the password matches. Always runs a hash
 * comparison, even for an unknown address, so response time does not reveal
 * whether an account exists.
 */
export async function authenticate(
  email: string,
  password: string,
): Promise<UserDoc | null> {
  const doc = await (
    await users()
  ).findOne({ emailLower: email.toLowerCase() });
  const stored =
    doc?.passwordHash ??
    "scrypt$65536$00000000000000000000000000000000$00000000000000000000000000000000";
  const ok = await verifyPassword(password, stored);
  return ok && doc ? doc : null;
}

export async function getProfile(userId: string) {
  return (await users()).findOne({ _id: userId });
}

export async function recordPlacement(
  userId: string,
  track: Track,
  score: number,
) {
  return (await users()).findOneAndUpdate(
    { _id: userId },
    { $set: { track, placementScore: score, placedAt: new Date() } },
    { returnDocument: "after" },
  );
}

/**
 * Slug -> XP actually earned for it. The tombstone shows what the student earned,
 * not the module's headline value, so a partial score must not display as full marks.
 */
export async function completedModules(
  userId: string,
): Promise<Map<string, number>> {
  const rows = await (
    await moduleProgress()
  )
    .find({ userId }, { projection: { moduleSlug: 1, xpAwarded: 1 } })
    .toArray();
  return new Map(rows.map((r) => [r.moduleSlug, r.xpAwarded]));
}

export async function attemptByKey(userId: string, attemptKey: string) {
  return (await attempts()).findOne({ attemptKey, userId });
}

// Invariant 8: XP is added here, server-side, and only ever as a delta computed
// from a scored attempt. The client never sends a total.
export async function awardXp(userId: string, delta: number) {
  if (delta === 0) return;
  await (await users()).updateOne({ _id: userId }, { $inc: { xp: delta } });
}
