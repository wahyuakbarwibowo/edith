import { and, desc, eq, isNull } from "drizzle-orm";
import { db, notifications } from "../../../db/index.ts";
import { defineRoutes, noContent } from "../../http.ts";
import { requireUser } from "../auth/session.ts";

export const notificationRoutes = defineRoutes({
  "/api/notifications": {
    GET: async (req) => {
      const user = await requireUser(req);
      const rows = await db
        .select({ id: notifications.id, type: notifications.type, data: notifications.data, readAt: notifications.readAt, createdAt: notifications.createdAt })
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
      return Response.json(rows);
    },
  },
  "/api/notifications/read": {
    POST: async (req) => {
      const user = await requireUser(req);
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
      return noContent();
    },
  },
});
