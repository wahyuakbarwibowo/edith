import type { Board, CardDetail, Member, Notification, Workspace } from "../../shared/types/index.ts";
import { must, supabase } from "./supabase.ts";

// Column aliases keep the client's camelCase types while Postgres stays snake_case.
const CARD = "id, listId:list_id, title, description, position, dueDate:due_date";

export async function getWorkspaces(userId: string): Promise<Workspace[]> {
  const rows = must(
    await supabase
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name, createdAt:created_at, boards(id, title))")
      .eq("user_id", userId)
      .order("created_at", { referencedTable: "workspaces.boards" }),
  );
  return (rows ?? [])
    .map((r) => ({ ...r.workspace!, role: r.role as Workspace["role"] }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const createWorkspace = async (name: string) => must(await supabase.rpc("create_workspace", { p_name: name }));

export async function getMembers(workspaceId: string): Promise<Member[]> {
  const rows = must(await supabase.from("workspace_members").select("role, profile:profiles(id, name, email)").eq("workspace_id", workspaceId));
  return (rows ?? []).map((r) => ({ ...r.profile!, role: r.role as Member["role"] }));
}

export const addMember = async (workspaceId: string, email: string) =>
  must(await supabase.rpc("add_workspace_member", { p_workspace: workspaceId, p_email: email }));

export const createBoard = async (workspaceId: string, title: string) =>
  must(await supabase.from("boards").insert({ workspace_id: workspaceId, title }));

export async function getBoard(id: string): Promise<Board | null> {
  const board = must(
    await supabase
      .from("boards")
      .select(`id, workspaceId:workspace_id, title, lists(id, title, position, cards(${CARD}))`)
      .eq("id", id)
      .order("position", { referencedTable: "lists" })
      .order("position", { referencedTable: "lists.cards" })
      .maybeSingle(),
  );
  return board as Board | null;
}

export const renameBoard = async (id: string, title: string) => must(await supabase.from("boards").update({ title }).eq("id", id));

export const createList = async (boardId: string, title: string, position: number) =>
  must(await supabase.from("lists").insert({ board_id: boardId, title, position }));
export const updateList = async (id: string, patch: { title?: string; position?: number }) =>
  must(await supabase.from("lists").update(patch).eq("id", id));
export const deleteList = async (id: string) => must(await supabase.from("lists").delete().eq("id", id));

export const createCard = async (listId: string, title: string, position: number) =>
  must(await supabase.from("cards").insert({ list_id: listId, title, position }));

type CardPatch = { title?: string; description?: string; position?: number; listId?: string; dueDate?: string | null };
export async function updateCard(id: string, { listId, dueDate, ...patch }: CardPatch) {
  const row = { ...patch, ...(listId && { list_id: listId }), ...(dueDate !== undefined && { due_date: dueDate }) };
  must(await supabase.from("cards").update(row).eq("id", id));
}

export async function getCard(id: string): Promise<CardDetail | null> {
  const card = must(
    await supabase
      .from("cards")
      .select(`${CARD}, comments(id, body, createdAt:created_at, userId:user_id, author:profiles(name)), attachments(id, name, path)`)
      .eq("id", id)
      .order("created_at", { referencedTable: "comments" })
      .order("created_at", { referencedTable: "attachments" })
      .maybeSingle(),
  );
  if (!card) return null;
  // Private bucket: links are short-lived signed URLs.
  const paths = card.attachments.map((a) => a.path);
  const signed = paths.length ? must(await supabase.storage.from("attachments").createSignedUrls(paths, 3600)) : [];
  return {
    ...card,
    comments: card.comments.map(({ author, ...c }) => ({ ...c, userName: author?.name ?? "?" })),
    attachments: card.attachments.map((a, i) => ({ id: a.id, name: a.name, path: a.path, url: signed?.[i]?.signedUrl ?? "#" })),
  };
}

export async function deleteCard(id: string) {
  const files = must(await supabase.from("attachments").select("path").eq("card_id", id)) ?? [];
  if (files.length) must(await supabase.storage.from("attachments").remove(files.map((f) => f.path)));
  must(await supabase.from("cards").delete().eq("id", id));
}

export const addComment = async (cardId: string, body: string) => must(await supabase.from("comments").insert({ card_id: cardId, body }));
export const deleteComment = async (id: string) => must(await supabase.from("comments").delete().eq("id", id));

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function uploadAttachment(cardId: string, file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error("File too large (max 10 MB)");
  const path = `${cardId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  must(await supabase.storage.from("attachments").upload(path, file, { contentType: file.type || "application/octet-stream" }));
  must(await supabase.from("attachments").insert({ card_id: cardId, path, name: file.name }));
}

export async function deleteAttachment(id: string, path: string) {
  must(await supabase.storage.from("attachments").remove([path]));
  must(await supabase.from("attachments").delete().eq("id", id));
}

export async function getNotifications(): Promise<Notification[]> {
  const rows = must(
    await supabase
      .from("notifications")
      .select("id, type, data, readAt:read_at, createdAt:created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  );
  return rows as Notification[];
}

export const markNotificationsRead = async (userId: string) =>
  must(await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null));
