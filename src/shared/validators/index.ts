import { z } from "zod";

const title = z.string().trim().min(1).max(200);

export const registerInput = z.object({
  email: z.email().trim().toLowerCase(),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});
export const loginInput = z.object({ email: z.email().trim().toLowerCase(), password: z.string() });

export const workspaceInput = z.object({ name: title });
export const memberInput = z.object({ email: z.email().trim().toLowerCase() });

export const boardInput = z.object({ workspaceId: z.uuid(), title });
export const boardPatch = z.object({ title });

export const listInput = z.object({ title });
export const listPatch = z.object({ title, position: z.number() }).partial();

export const cardInput = z.object({ title });
export const cardPatch = z
  .object({
    title,
    description: z.string().max(20_000),
    position: z.number(),
    listId: z.uuid(),
    dueDate: z.iso.datetime().nullable(),
  })
  .partial();

export const commentInput = z.object({ body: z.string().trim().min(1).max(5000) });

export const wsMessage = z.object({ type: z.enum(["join", "leave"]), boardId: z.uuid() });
