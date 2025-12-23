# syntax=docker/dockerfile:1.6
FROM node:20-bookworm-slim AS app

# System deps (Prisma needs OpenSSL)
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Use a known pnpm version (matches pnpm-lock.yaml)
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Make builds reproducible and quieter
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy workspace manifests first for better Docker layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

# Copy workspace packages needed for dependency graph resolution
COPY packages ./packages

# Install deps (allow native build scripts required by Next/Prisma)
RUN pnpm install --frozen-lockfile

# Copy the rest of the repo
COPY . .

# Build internal workspace packages that Next imports directly
RUN pnpm --filter @dub/utils build \
  && pnpm --filter @dub/ui build \
  && pnpm --filter @dub/embed-react build

# Build the Next.js app
WORKDIR /app/apps/web
RUN pnpm prisma:generate && pnpm next build --no-lint

EXPOSE 3000
CMD ["pnpm", "next", "start", "-p", "3000"]
