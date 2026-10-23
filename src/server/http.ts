import type { BunRequest, Serve, Server } from "bun";
import { z } from "zod";
import type { WsData } from "./realtime/index.ts";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const notFound = () => new HttpError(404, "Not found");

type Handler<P extends string> = (req: BunRequest<P>, server: Server<WsData>) => Promise<Response | undefined>;

/** Identity helper so each module's handlers get typed `req.params`. */
export const defineRoutes = <R extends string>(routes: { [P in R]: Handler<P> | Partial<Record<Serve.HTTPMethod, Handler<P>>> }) => routes;

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const data = await req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON");
  });
  return schema.parse(data);
}

/** Path ids are uuids; anything else can't exist, so 404 instead of a Postgres cast error. */
export function uuid(value: string): string {
  if (!z.uuid().safeParse(value).success) throw notFound();
  return value;
}

export const noContent = () => new Response(null, { status: 204 });

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return Response.json({ error: z.prettifyError(err) }, { status: 400 });
  console.error(err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
