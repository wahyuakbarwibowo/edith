import { and, eq, ne } from "drizzle-orm";
import { boards, cards, comments, db, workspaceMembers } from "../../../db/index.ts";
import { commentInput } from "../../../shared/validators/index.ts";
import { cardAccess } from "../../access.ts";
import { body, defineRoutes, noContent, notFound, uuid } from "../../http.ts";
import { boardChanged } from "../../realtime/index.ts";
import { requireUser } from "../auth/session.ts";
import { notifyUsers } from "../notifications/service.ts";

export const commentRoutes = defineRoutes({
  "/api/cards/:id/comments": {
    POST: async (req) => {
      const user = await requireUser(req);
      const cardId = uuid(req.params.id);
      const { boardId, workspaceId } = await cardAccess(user.id, cardId);
      const input = await body(req, commentInput);
      const [comment] = await db.insert(comments).values({ cardId, userId: user.id, body: input.body }).returning();
      boardChanged(boardId);

      // ponytail: notifies every workspace member; switch to card watchers/assignees when those exist.
      const [card] = await db.select({ title: cards.title }).from(cards).where(eq(cards.id, cardId));
      const [board] = await db.select({ title: boards.title }).from(boards).where(eq(boards.id, boardId));
      const others = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.userId, user.id)));
      await notifyUsers(others.map((m) => m.userId), "comment", {
        boardId,
        cardId,
        boardTitle: board!.title,
        cardTitle: card!.title,
        by: user.name,
        excerpt: input.body.slice(0, 120),
      });

      return Response.json({ ...comment!, userName: user.name }, { status: 201 });
    },
  },
  "/api/comments/:id": {
    DELETE: async (req) => {
      const user = await requireUser(req);
      const [comment] = await db
        .select({ cardId: comments.cardId })
        .from(comments)
        .where(and(eq(comments.id, uuid(req.params.id)), eq(comments.userId, user.id)));
      if (!comment) throw notFound();
      const { boardId } = await cardAccess(user.id, comment.cardId);
      await db.delete(comments).where(eq(comments.id, req.params.id));
      boardChanged(boardId);
      return noContent();
    },
  },
});
