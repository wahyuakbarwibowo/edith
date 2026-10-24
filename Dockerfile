FROM oven/bun:1.4-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
ENV NODE_ENV=production
USER bun
EXPOSE 3000
CMD ["sh", "-c", "bun src/db/migrate.ts && bun src/server/index.ts"]
