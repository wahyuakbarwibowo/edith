import { asc, eq, inArray } from "drizzle-orm";
import { boards, db, users, workspaceMembers, workspaces } from "../../../db/index.ts";
import type { Workspace } from "../../../shared/types/index.ts";
import { memberInput, workspaceInput } from "../../../shared/validators/index.ts";
import { workspaceAccess } from "../../access.ts";
import { body, defineRoutes, HttpError, uuid } from "../../http.ts";
import { requireUser } from "../auth/session.ts";
import { notifyUsers } from "../notifications/service.ts";

export const workspaceRoutes = defineRoutes({
  "/api/workspaces": {
    GET: async (req) => {
      const user = await requireUser(req);
      const rows = await db
        .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(eq(workspaceMembers.userId, user.id))
        .orderBy(asc(workspaces.createdAt));
      const boardRows = rows.length
        ? await db
            .select({ id: boards.id, title: boards.title, workspaceId: boards.workspaceId })
            .from(boards)
            .where(inArray(boards.workspaceId, rows.map((w) => w.id)))
            .orderBy(asc(boards.createdAt))
        : [];
      const result: Workspace[] = rows.map((w) => ({
        ...w,
        boards: boardRows.filter((b) => b.workspaceId === w.id).map(({ id, title }) => ({ id, title })),
      }));
      return Response.json(result);
    },
    POST: async (req) => {
      const user = await requireUser(req);
      const { name } = await body(req, workspaceInput);
      const workspace = await db.transaction(async (tx) => {
        const [ws] = await tx.insert(workspaces).values({ name }).returning({ id: workspaces.id, name: workspaces.name });
        await tx.insert(workspaceMembers).values({ workspaceId: ws!.id, userId: user.id, role: "owner" });
        return ws!;
      });
      return Response.json({ ...workspace, role: "owner", boards: [] } satisfies Workspace, { status: 201 });
    },
  },
  "/api/workspaces/:id/members": {
    GET: async (req) => {
      const user = await requireUser(req);
      const { workspaceId } = await workspaceAccess(user.id, uuid(req.params.id));
      const members = await db
        .select({ id: users.id, name: users.name, email: users.email, role: workspaceMembers.role })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, workspaceId));
      return Response.json(members);
    },
    POST: async (req) => {
      const user = await requireUser(req);
      const { workspaceId, role } = await workspaceAccess(user.id, uuid(req.params.id));
      if (role !== "owner") throw new HttpError(403, "Only the owner can add members");
      const { email } = await body(req, memberInput);
      const [invitee] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (!invitee) throw new HttpError(404, "No user with that email");
      const [added] = await db
        .insert(workspaceMembers)
        .values({ workspaceId, userId: invitee.id, role: "member" })
        .onConflictDoNothing()
        .returning();
      if (added) {
        const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId));
        await notifyUsers([invitee.id], "workspace:added", { workspaceId, workspaceName: ws!.name, by: user.name });
      }
      return Response.json({ ok: true }, { status: added ? 201 : 200 });
    },
  },
});
