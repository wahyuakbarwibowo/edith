import type { BunRequest } from "bun";
import { and, eq, gt } from "drizzle-orm";
import { db, sessions, users } from "../../../db/index.ts";
import type { User } from "../../../shared/types/index.ts";
import { HttpError } from "../../http.ts";

const COOKIE = "sid";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => new Bun.CryptoHasher("sha256").update(token).digest("hex");

// ponytail: expired session rows are only ignored, not purged; add a periodic DELETE when the table grows.
export async function createSession(req: BunRequest, userId: string) {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const expires = new Date(Date.now() + TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt: expires });
  req.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession(req: BunRequest) {
  const token = req.cookies.get(COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  req.cookies.delete({ name: COOKIE, path: "/" });
}

export async function requireUser(req: BunRequest): Promise<User> {
  const token = req.cookies.get(COOKIE);
  if (token) {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
    if (user) return user;
  }
  throw new HttpError(401, "Unauthorized");
}
