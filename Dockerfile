# syntax=docker/dockerfile:1.6
FROM node:20-bookworm-slim AS base

# Prisma needs OpenSSL
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Ensure dotenv-flow uses production env pattern
ENV NODE_ENV=production

# Copy workspace manifests for caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages

# Use modern pnpm
RUN corepack prepare pnpm@10.26.1 --activate

# Install deps at monorepo root
RUN pnpm install --frozen-lockfile

# Copy rest of repo
COPY . .

# Build only the workspace packages required by the Next.js app
# (Avoid building packages like @dub/cli which have incompatible build scripts)
WORKDIR /app
RUN pnpm --filter @dub/utils build \
  && pnpm --filter @dub/ui build \
  && pnpm --filter @dub/embed-react build

# Build Next.js app
WORKDIR /app/apps/web
RUN pnpm prisma:generate && pnpm next build

FROM node:20-bookworm-slim AS runner

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app /app

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "next", "start", "-p", "3000"]
