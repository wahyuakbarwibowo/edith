FROM oven/bun:1.4-alpine
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production
COPY . .
ENV NODE_ENV=production
USER bun
EXPOSE 3000
# PUBLIC_SUPABASE_* must be set at runtime: the SPA is bundled on start.
CMD ["bun", "src/server/index.ts"]
