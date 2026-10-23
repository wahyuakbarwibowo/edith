import { defineRoutes } from "../../http.ts";
import { requireUser } from "../auth/session.ts";

export const userRoutes = defineRoutes({
  "/api/users/me": { GET: async (req) => Response.json(await requireUser(req)) },
});
