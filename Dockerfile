# syntax=docker/dockerfile:1.6
FROM node:20-bookworm-slim AS base

# Prisma needs OpenSSL
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
WORKDIR /app
ENV NODE_ENV=production

# Copy workspace manifests for caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc .npmrc
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages

# Force official npm registry (avoids proxy/mirror 404s) + increase fetch retries
RUN pnpm config set registry https://registry.npmjs.org/ \
  && pnpm config set fetch-retries 5 \
  && pnpm config set fetch-retry-factor 2 \
  && pnpm config set fetch-retry-mintimeout 10000 \
  && pnpm config set fetch-retry-maxtimeout 60000

# Install deps at monorepo root.
# Use the lockfile when possible, but fall back to a non-frozen install if the
# registry returns a bad tarball/integrity/404 for a specific version.
RUN pnpm install --prefer-frozen-lockfile || pnpm install --no-frozen-lockfile

# Copy rest of repo
COPY . .

# Build only the workspace packages required by the Next.js app
WORKDIR /app
RUN pnpm --filter @dub/utils build \
  && pnpm --filter @dub/ui build \
  && pnpm --filter @dub/embed-react build

# Build Next.js app (skip lint to reduce CI build time)
WORKDIR /app/apps/web
RUN pnpm prisma:generate && pnpm next build --no-lint

FROM node:20-bookworm-slim AS runner

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "next", "start", "-p", "3000"]
