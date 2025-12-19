FROM node:20-alpine

# Dub (Next.js) self-host image.
# This image intentionally keeps the build/runtime simple for VPS deployments.

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl bash curl

# Enable pnpm via corepack
RUN corepack enable

# Copy repo
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Add entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8888

ENTRYPOINT ["/entrypoint.sh"]
