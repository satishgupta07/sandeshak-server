# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma's migration engine is a native binary that links against openssl.
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
RUN npm ci

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# `prisma generate` writes the client into src/generated/prisma (see schema.prisma),
# so it must run BEFORE tsc — the generated files are part of the TS compilation.
RUN npx prisma generate
RUN npm run build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

# `prisma` CLI is now a runtime dependency (not devDependency) so it survives
# --omit=dev and `prisma migrate deploy` can run at container start.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Files needed at runtime:
#   dist/             → compiled server + generated Prisma client
#   prisma/           → schema + migrations consumed by `prisma migrate deploy`
#   prisma.config.ts  → tells the CLI where the schema lives and supplies DATABASE_URL
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

USER node

ENTRYPOINT ["./docker-entrypoint.sh"]
