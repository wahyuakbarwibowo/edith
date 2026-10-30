import index from "../client/index.html";

// Supabase is the backend; Bun only bundles and serves the SPA.
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: { "/*": index },
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});

console.log(`listening on ${server.url}`);
