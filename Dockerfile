# syntax=docker/dockerfile:1.6
FROM node:20-bookworm-slim AS base

# Prisma needs OpenSSL
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages

RUN corepack prepare pnpm@9.12.3 --activate
RUN pnpm install --frozen-lockfile

COPY . .

WORKDIR /app/apps/web
RUN pnpm prisma:generate && pnpm next build

FROM node:20-bookworm-slim AS runner

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app /app

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "next", "start", "-p", "3000"]
