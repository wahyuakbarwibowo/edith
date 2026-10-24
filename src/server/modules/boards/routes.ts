import { asc, eq, max } from "drizzle-orm";
import { boards, cards, db, lists } from "../../../db/index.ts";
import { boardInput, boardPatch, listInput, listPatch } from "../../../shared/validators/index.ts";
import { boardAccess, listAccess, workspaceAccess } from "../../access.ts";
import { body, defineRoutes, HttpError, noContent, uuid } from "../../http.ts";
import { boardChanged } from "../../realtime/index.ts";
import { requireUser } from "../auth/session.ts";

export const boardRoutes = defineRoutes({
  "/api/boards": {
    POST: async (req) => {
      const user = await requireUser(req);
      const input = await body(req, boardInput);
      await workspaceAccess(user.id, input.workspaceId);
      const [board] = await db.insert(boards).values(input).returning({ id: boards.id, title: boards.title });
      return Response.json(board, { status: 201 });
    },
  },
  "/api/boards/:id": {
    GET: async (req) => {
      const user = await requireUser(req);
      const { boardId } = await boardAccess(user.id, uuid(req.params.id));
      const [board] = await db
        .select({ id: boards.id, workspaceId: boards.workspaceId, title: boards.title })
        .from(boards)
        .where(eq(boards.id, boardId));
      const listRows = await db
        .select({ id: lists.id, title: lists.title, position: lists.position })
        .from(lists)
        .where(eq(lists.boardId, boardId))
        .orderBy(asc(lists.position));
      const cardRows = await db
        .select({ id: cards.id, listId: cards.listId, title: cards.title, description: cards.description, position: cards.position, dueDate: cards.dueDate })
        .from(cards)
        .innerJoin(lists, eq(lists.id, cards.listId))
        .where(eq(lists.boardId, boardId))
        .orderBy(asc(cards.position));
      return Response.json({
        ...board!,
        lists: listRows.map((l) => ({ ...l, cards: cardRows.filter((c) => c.listId === l.id) })),
      });
    },
    PATCH: async (req) => {
      const user = await requireUser(req);
      const { boardId } = await boardAccess(user.id, uuid(req.params.id));
      const patch = await body(req, boardPatch);
      await db.update(boards).set(patch).where(eq(boards.id, boardId));
      boardChanged(boardId);
      return noContent();
    },
    DELETE: async (req) => {
      const user = await requireUser(req);
      const { boardId, role } = await boardAccess(user.id, uuid(req.params.id));
      if (role !== "owner") throw new HttpError(403, "Only the workspace owner can delete boards");
      await db.delete(boards).where(eq(boards.id, boardId));
      boardChanged(boardId);
      return noContent();
    },
  },
  "/api/boards/:id/lists": {
    POST: async (req) => {
      const user = await requireUser(req);
      const { boardId } = await boardAccess(user.id, uuid(req.params.id));
      const { title } = await body(req, listInput);
      const [last] = await db.select({ pos: max(lists.position) }).from(lists).where(eq(lists.boardId, boardId));
      const [list] = await db
        .insert(lists)
        .values({ boardId, title, position: (last?.pos ?? 0) + 1024 })
        .returning({ id: lists.id, title: lists.title, position: lists.position });
      boardChanged(boardId);
      return Response.json({ ...list, cards: [] }, { status: 201 });
    },
  },
  "/api/lists/:id": {
    PATCH: async (req) => {
      const user = await requireUser(req);
      const listId = uuid(req.params.id);
      const { boardId } = await listAccess(user.id, listId);
      const patch = await body(req, listPatch);
      if (!Object.keys(patch).length) return noContent();
      await db.update(lists).set(patch).where(eq(lists.id, listId));
      boardChanged(boardId);
      return noContent();
    },
    DELETE: async (req) => {
      const user = await requireUser(req);
      const listId = uuid(req.params.id);
      const { boardId } = await listAccess(user.id, listId);
      await db.delete(lists).where(eq(lists.id, listId));
      boardChanged(boardId);
      return noContent();
    },
  },
});
