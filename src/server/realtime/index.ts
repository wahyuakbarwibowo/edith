import type { BunRequest, Server, WebSocketHandler } from "bun";
import type { Notification, ServerEvent } from "../../shared/types/index.ts";
import { wsMessage } from "../../shared/validators/index.ts";
import { boardAccess } from "../access.ts";
import { requireUser } from "../modules/auth/session.ts";

export type WsData = { userId: string };

// ponytail: Bun pub/sub is per-process; multiple instances need a Redis/Postgres fan-out behind publish().
let server: Server<WsData> | undefined;
export const setServer = (s: Server<WsData>) => void (server = s);

const publish = (topic: string, event: ServerEvent) => server?.publish(topic, JSON.stringify(event));
export const boardChanged = (boardId: string) => publish(`board:${boardId}`, { type: "board:changed", boardId });
export const pushNotification = (userId: string, notification: Notification) =>
  publish(`user:${userId}`, { type: "notification", notification });

export async function upgrade(req: BunRequest, srv: Server<WsData>) {
  // Block cross-site WebSocket hijacking: the session cookie would ride along otherwise.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return new Response("Forbidden", { status: 403 });
  const user = await requireUser(req);
  if (srv.upgrade(req, { data: { userId: user.id } })) return;
  return new Response("Upgrade required", { status: 426 });
}

export const websocket: WebSocketHandler<WsData> = {
  data: {} as WsData,
  open(ws) {
    ws.subscribe(`user:${ws.data.userId}`);
  },
  async message(ws, raw) {
    let msg;
    try {
      msg = wsMessage.parse(JSON.parse(String(raw)));
    } catch {
      return;
    }
    const topic = `board:${msg.boardId}`;
    if (msg.type === "leave") {
      ws.unsubscribe(topic);
      return;
    }
    try {
      await boardAccess(ws.data.userId, msg.boardId);
      ws.subscribe(topic);
    } catch {
      // no access: silently ignore
    }
  },
};
