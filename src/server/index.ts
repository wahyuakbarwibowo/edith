import index from "../client/index.html";
import { errorResponse } from "./http.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { boardRoutes } from "./modules/boards/routes.ts";
import { cardRoutes } from "./modules/cards/routes.ts";
import { commentRoutes } from "./modules/comments/routes.ts";
import { notificationRoutes } from "./modules/notifications/routes.ts";
import { userRoutes } from "./modules/users/routes.ts";
import { workspaceRoutes } from "./modules/workspaces/routes.ts";
import { setServer, upgrade, websocket } from "./realtime/index.ts";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  maxRequestBodySize: 11 * 1024 * 1024,
  routes: {
    ...authRoutes,
    ...userRoutes,
    ...workspaceRoutes,
    ...boardRoutes,
    ...cardRoutes,
    ...commentRoutes,
    ...notificationRoutes,
    "/ws": upgrade,
    "/api/*": () => Response.json({ error: "Not found" }, { status: 404 }),
    "/*": index,
  },
  websocket,
  error: errorResponse,
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});

setServer(server);
console.log(`listening on ${server.url}`);
