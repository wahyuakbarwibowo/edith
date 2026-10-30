// Wire shapes: dates arrive as ISO strings over JSON.
export interface User { id: string; email: string; name: string }
export interface BoardSummary { id: string; title: string }
export interface Workspace { id: string; name: string; createdAt: string; role: "owner" | "member"; boards: BoardSummary[] }
export interface Member { id: string; name: string; email: string; role: "owner" | "member" }
export interface Card { id: string; listId: string; title: string; description: string; position: number; dueDate: string | null }
export interface List { id: string; title: string; position: number; cards: Card[] }
export interface Board { id: string; workspaceId: string; title: string; lists: List[] }
export interface Comment { id: string; body: string; createdAt: string; userId: string; userName: string }
export interface Attachment { id: string; name: string; path: string; url: string }
export interface CardDetail extends Card { comments: Comment[]; attachments: Attachment[] }
export interface Notification { id: string; type: string; data: Record<string, string>; readAt: string | null; createdAt: string }

const GAP = 1024;

/** Position for an item dropped between two neighbours (fractional indexing). */
// ponytail: float midpoints lose precision after ~50 drops into the same gap; renumber a list if that ever bites.
export function positionBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return GAP;
  if (before === undefined) return after! / 2;
  if (after === undefined) return before + GAP;
  return (before + after) / 2;
}

/** Where `id` should land when dropped onto `targetId` (or the end) among `items`. */
export function dropPosition<T extends { id: string; position: number }>(items: T[], id: string, targetId?: string) {
  const others = items.filter((x) => x.id !== id);
  let idx = targetId ? others.findIndex((x) => x.id === targetId) : others.length;
  // Dragging forward within the same sequence lands after the target, backward lands before it.
  const from = items.findIndex((x) => x.id === id);
  if (targetId && from !== -1 && from < items.findIndex((x) => x.id === targetId)) idx++;
  return positionBetween(others[idx - 1]?.position, others[idx]?.position);
}
