import { doublePrecision, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

// Session id is a sha256 of the cookie token, so a DB leak can't be replayed as cookies.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner" | "member">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index().on(t.userId)],
);

export const boards = pgTable(
  "boards",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId)],
);

export const lists = pgTable(
  "lists",
  {
    id: id(),
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: doublePrecision("position").notNull(),
  },
  (t) => [index().on(t.boardId)],
);

export const cards = pgTable(
  "cards",
  {
    id: id(),
    listId: uuid("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    position: doublePrecision("position").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.listId)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.cardId)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.cardId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, string>>().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
