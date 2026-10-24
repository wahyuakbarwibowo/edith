import { eq } from "drizzle-orm";
import { db, users } from "../../../db/index.ts";
import { loginInput, registerInput } from "../../../shared/validators/index.ts";
import { body, defineRoutes, HttpError, noContent } from "../../http.ts";
import { createSession, destroySession } from "./session.ts";

// ponytail: no login rate limit; argon2 cost slows brute force, add a per-IP limiter before going public.
export const authRoutes = defineRoutes({
  "/api/auth/register": {
    POST: async (req) => {
      const input = await body(req, registerInput);
      const [user] = await db
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash: await Bun.password.hash(input.password) })
        .onConflictDoNothing()
        .returning({ id: users.id, email: users.email, name: users.name });
      if (!user) throw new HttpError(409, "Email already registered");
      await createSession(req, user.id);
      return Response.json(user, { status: 201 });
    },
  },
  "/api/auth/login": {
    POST: async (req) => {
      const input = await body(req, loginInput);
      const [user] = await db.select().from(users).where(eq(users.email, input.email));
      if (!user || !(await Bun.password.verify(input.password, user.passwordHash))) {
        throw new HttpError(401, "Invalid email or password");
      }
      await createSession(req, user.id);
      return Response.json({ id: user.id, email: user.email, name: user.name });
    },
  },
  "/api/auth/logout": {
    POST: async (req) => {
      await destroySession(req);
      return noContent();
    },
  },
});
