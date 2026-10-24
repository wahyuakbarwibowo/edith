import { db, notifications } from "../../../db/index.ts";
import { pushNotification } from "../../realtime/index.ts";

export async function notifyUsers(userIds: string[], type: string, data: Record<string, string>) {
  if (!userIds.length) return;
  const rows = await db
    .insert(notifications)
    .values(userIds.map((userId) => ({ userId, type, data })))
    .returning();
  for (const n of rows) {
    pushNotification(n.userId, { ...n, readAt: null, createdAt: n.createdAt.toISOString() });
  }
}
