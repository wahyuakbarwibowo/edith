import { and, eq } from "drizzle-orm";
import { boards, cards, db, lists, workspaceMembers } from "../db/index.ts";
import { notFound } from "./http.ts";

// Every check answers 404 rather than 403 so ids of other workspaces don't leak.

export async function workspaceAccess(userId: string, workspaceId: string) {
  const [m] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  if (!m) throw notFound();
  return { workspaceId, role: m.role };
}

export async function boardAccess(userId: string, boardId: string) {
  const [row] = await db
    .select({ workspaceId: boards.workspaceId, role: workspaceMembers.role })
    .from(boards)
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, boards.workspaceId), eq(workspaceMembers.userId, userId)))
    .where(eq(boards.id, boardId));
  if (!row) throw notFound();
  return { boardId, ...row };
}

export async function listAccess(userId: string, listId: string) {
  const [list] = await db.select({ boardId: lists.boardId }).from(lists).where(eq(lists.id, listId));
  if (!list) throw notFound();
  return boardAccess(userId, list.boardId);
}

export async function cardAccess(userId: string, cardId: string) {
  const [card] = await db
    .select({ boardId: lists.boardId })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(eq(cards.id, cardId));
  if (!card) throw notFound();
  return boardAccess(userId, card.boardId);
}
