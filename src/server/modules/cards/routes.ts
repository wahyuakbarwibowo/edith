import { asc, eq, max } from "drizzle-orm";
import { attachments, cards, comments, db, lists, users } from "../../../db/index.ts";
import { cardInput, cardPatch } from "../../../shared/validators/index.ts";
import { cardAccess, listAccess } from "../../access.ts";
import { body, defineRoutes, HttpError, noContent, notFound, uuid } from "../../http.ts";
import { boardChanged } from "../../realtime/index.ts";
import { requireUser } from "../auth/session.ts";
import { publicUrl, r2 } from "./storage.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const cardRoutes = defineRoutes({
  "/api/lists/:id/cards": {
    POST: async (req) => {
      const user = await requireUser(req);
      const listId = uuid(req.params.id);
      const { boardId } = await listAccess(user.id, listId);
      const { title } = await body(req, cardInput);
      const [last] = await db.select({ pos: max(cards.position) }).from(cards).where(eq(cards.listId, listId));
      const [card] = await db
        .insert(cards)
        .values({ listId, title, position: (last?.pos ?? 0) + 1024 })
        .returning();
      boardChanged(boardId);
      return Response.json(card, { status: 201 });
    },
  },
  "/api/cards/:id": {
    GET: async (req) => {
      const user = await requireUser(req);
      const cardId = uuid(req.params.id);
      const { boardId } = await cardAccess(user.id, cardId);
      const [card] = await db
        .select({ id: cards.id, listId: cards.listId, title: cards.title, description: cards.description, position: cards.position, dueDate: cards.dueDate })
        .from(cards)
        .where(eq(cards.id, cardId));
      const commentRows = await db
        .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, userId: comments.userId, userName: users.name })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.userId))
        .where(eq(comments.cardId, cardId))
        .orderBy(asc(comments.createdAt));
      const attachmentRows = await db
        .select({ id: attachments.id, name: attachments.name, url: attachments.url })
        .from(attachments)
        .where(eq(attachments.cardId, cardId))
        .orderBy(asc(attachments.createdAt));
      return Response.json({ ...card!, boardId, comments: commentRows, attachments: attachmentRows });
    },
    PATCH: async (req) => {
      const user = await requireUser(req);
      const cardId = uuid(req.params.id);
      const { boardId } = await cardAccess(user.id, cardId);
      const { dueDate, ...patch } = await body(req, cardPatch);
      if (patch.listId) {
        // Moving is only allowed within the same board.
        const target = await listAccess(user.id, patch.listId);
        if (target.boardId !== boardId) throw new HttpError(400, "List belongs to another board");
      }
      const set = { ...patch, ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }) };
      if (!Object.keys(set).length) return noContent();
      await db.update(cards).set(set).where(eq(cards.id, cardId));
      boardChanged(boardId);
      return noContent();
    },
    DELETE: async (req) => {
      const user = await requireUser(req);
      const cardId = uuid(req.params.id);
      const { boardId } = await cardAccess(user.id, cardId);
      const files = await db.select({ key: attachments.key }).from(attachments).where(eq(attachments.cardId, cardId));
      await db.delete(cards).where(eq(cards.id, cardId));
      await Promise.all(files.map((f) => r2?.delete(f.key)));
      boardChanged(boardId);
      return noContent();
    },
  },
  "/api/cards/:id/attachments": {
    POST: async (req) => {
      const user = await requireUser(req);
      const cardId = uuid(req.params.id);
      const { boardId } = await cardAccess(user.id, cardId);
      if (!r2) throw new HttpError(503, "File storage is not configured");
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) throw new HttpError(400, "Missing file");
      if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "File too large (max 10 MB)");
      const key = `cards/${cardId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      await r2.write(key, file, { type: file.type || "application/octet-stream" });
      const [attachment] = await db
        .insert(attachments)
        .values({ cardId, key, name: file.name, url: publicUrl(key) })
        .returning({ id: attachments.id, name: attachments.name, url: attachments.url });
      boardChanged(boardId);
      return Response.json(attachment, { status: 201 });
    },
  },
  "/api/attachments/:id": {
    DELETE: async (req) => {
      const user = await requireUser(req);
      const [att] = await db
        .select({ id: attachments.id, key: attachments.key, cardId: attachments.cardId })
        .from(attachments)
        .where(eq(attachments.id, uuid(req.params.id)));
      if (!att) throw notFound();
      const { boardId } = await cardAccess(user.id, att.cardId);
      await db.delete(attachments).where(eq(attachments.id, att.id));
      await r2?.delete(att.key);
      boardChanged(boardId);
      return noContent();
    },
  },
});
