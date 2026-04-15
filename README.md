# sandeshak-server

The backend for **Sandeshak** — a WhatsApp/Signal-like secure real-time chat application.

Built with **Node.js**, **Express**, **Socket.io**, **PostgreSQL** (Prisma 7), and **Redis** (ioredis).

> Part of the Sandeshak project: [sandeshak-web](../sandeshak-web) · [sandeshak-mobile](../sandeshak-mobile)

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Available Scripts](#available-scripts)
- [API Overview](#api-overview)
- [Docker](#docker)
- [CI / CD](#ci--cd)

---

## Tech Stack

| Layer        | Technology                              |
| ------------ | --------------------------------------- |
| Runtime      | Node.js 20                              |
| Language     | TypeScript 5                            |
| Framework    | Express 4                               |
| Real-time    | Socket.io _(Phase 1)_                   |
| Database     | PostgreSQL 16 via Prisma 7              |
| Cache / Pub-Sub | Redis 7 via ioredis                  |
| Object Storage | MinIO (S3-compatible, local dev)      |
| Auth         | JWT (access + refresh tokens) _(Phase 1)_ |
| Containerisation | Docker + Docker Compose             |

---

## Project Structure

```
sandeshak-server/
├── src/
│   ├── index.ts              # Entry point — connects DB & Redis, starts server
│   ├── app.ts                # Express app setup (middleware, routes, health)
│   ├── lib/
│   │   ├── prisma.ts         # Prisma client singleton (Pool → PrismaPg adapter)
│   │   └── redis.ts          # ioredis singleton (lazyConnect)
│   ├── middleware/
│   │   └── errorHandler.ts   # Global error handler
│   ├── routes/
│   │   └── index.ts          # Route aggregator
│   ├── types/
│   │   └── index.ts          # Source-of-truth types (DTOs, Socket events)
│   └── generated/
│       └── prisma/           # Auto-generated Prisma client (do not edit)
├── prisma/
│   └── schema.prisma         # Database schema
├── prisma.config.ts          # Prisma config (reads DATABASE_URL)
├── docker-compose.yml        # Local dev services (PostgreSQL, Redis, MinIO)
├── docker-compose.override.yml
├── Dockerfile                # Multi-stage production build
├── .env.example              # Environment variable template
└── .github/
    └── workflows/
        ├── ci.yml            # Lint + type-check + test on every PR
        └── docker-build.yml  # Docker build → GHCR on push to main
```

---

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop) (for local PostgreSQL, Redis, MinIO)
- **npm 10+** (comes with Node 20)

---

## Getting Started

### 1. Clone and install dependencies

```bash
git clone https://github.com/your-org/sandeshak-server.git
cd sandeshak-server
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` work out of the box with Docker Compose — no changes needed for local development.

### 3. Start local services (PostgreSQL, Redis, MinIO)

```bash
npm run docker:up
```

This starts three containers:

| Service  | Port  | Purpose                   |
| -------- | ----- | ------------------------- |
| PostgreSQL 16 | 5432 | Primary database    |
| Redis 7  | 6379  | Cache, sessions, pub/sub  |
| MinIO    | 9000  | S3-compatible media store |
| MinIO Console | 9001 | Web UI for MinIO    |

Wait for all containers to be healthy (about 10–15 seconds), then continue.

### 4. Run database migrations

```bash
npm run db:migrate
```

This creates all tables defined in `prisma/schema.prisma` and generates the Prisma client.

### 5. Start the development server

```bash
npm run dev
```

The server starts at **http://localhost:3000**.

Check it's running:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}

curl http://localhost:3000/health/ready
# {"status":"ready","checks":{"database":"ok","redis":"ok"},"timestamp":"..."}
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in any values marked `change_me`.

| Variable               | Default                                      | Description                              |
| ---------------------- | -------------------------------------------- | ---------------------------------------- |
| `PORT`                 | `3000`                                       | HTTP server port                         |
| `NODE_ENV`             | `development`                                | `development` \| `production`            |
| `DATABASE_URL`         | `postgresql://postgres:postgres@localhost:5432/sandeshak` | PostgreSQL connection string |
| `REDIS_URL`            | `redis://:redispass@localhost:6379`          | Redis connection string                  |
| `JWT_ACCESS_SECRET`    | —                                            | Min 32 chars. Used to sign access tokens |
| `JWT_REFRESH_SECRET`   | —                                            | Min 32 chars. Used to sign refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m`                                       | Access token expiry                      |
| `JWT_REFRESH_EXPIRES_IN` | `30d`                                      | Refresh token expiry                     |
| `CLIENT_WEB_URL`       | `http://localhost:5173`                      | Allowed CORS origin (web client)         |
| `CLIENT_MOBILE_URL`    | `exp://localhost:8081`                       | Allowed CORS origin (mobile client)      |
| `SMTP_HOST`            | —                                            | SMTP server for email verification       |
| `SMTP_PORT`            | `587`                                        | SMTP port                                |
| `SMTP_USER`            | —                                            | SMTP username                            |
| `SMTP_PASS`            | —                                            | SMTP password                            |
| `EMAIL_FROM`           | `noreply@sandeshak.app`                      | Sender address for transactional emails  |
| `S3_ENDPOINT`          | `http://localhost:9000`                      | MinIO / S3 endpoint                      |
| `S3_ACCESS_KEY`        | `minioadmin`                                 | S3 access key                            |
| `S3_SECRET_KEY`        | `minioadmin`                                 | S3 secret key                            |
| `S3_BUCKET`            | `sandeshak`                                  | S3 bucket name                           |

---

## Database

The schema is defined in [prisma/schema.prisma](prisma/schema.prisma) and managed with **Prisma Migrate**.

### Current schema

| Table   | Description                           |
| ------- | ------------------------------------- |
| `users` | User accounts (email, password hash, profile, privacy settings) |

More tables (conversations, messages, contacts, etc.) will be added in Phase 1.

### Common commands

```bash
# Create a new migration after editing schema.prisma
npm run db:migrate

# Apply existing migrations (production / CI)
npm run db:migrate:deploy

# Regenerate Prisma client without a migration
npm run db:generate

# Open Prisma Studio (visual DB browser)
npm run db:studio

# Reset the database (drops + recreates all tables)
npm run db:reset
```

> The Prisma client is generated into `src/generated/prisma/` and is committed to `.gitignore` — always run `npm run db:generate` after a fresh clone.

---

## Available Scripts

| Script                   | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `npm run dev`            | Start dev server with hot-reload (`ts-node-dev`)     |
| `npm run build`          | Compile TypeScript → `dist/`                         |
| `npm start`              | Run compiled server from `dist/`                     |
| `npm run type-check`     | Type-check without emitting files                    |
| `npm run lint`           | Run ESLint                                           |
| `npm run lint:fix`       | Run ESLint and auto-fix issues                       |
| `npm run format`         | Format all source files with Prettier                |
| `npm run format:check`   | Check formatting without writing                     |
| `npm run db:generate`    | Generate Prisma client from schema                   |
| `npm run db:migrate`     | Create + apply a new migration (dev)                 |
| `npm run db:migrate:deploy` | Apply pending migrations (production)             |
| `npm run db:studio`      | Open Prisma Studio in the browser                    |
| `npm run db:reset`       | Drop and recreate the database                       |
| `npm run docker:up`      | Start local services in the background               |
| `npm run docker:down`    | Stop local services                                  |
| `npm run docker:reset`   | Wipe volumes and restart all services                |
| `npm run docker:logs`    | Tail logs from all Docker services                   |

---

## API Overview

All routes are prefixed with `/api/v1`.

### Health

| Method | Path            | Description                                     |
| ------ | --------------- | ----------------------------------------------- |
| GET    | `/health`       | Liveness probe — returns `200` if process is up |
| GET    | `/health/ready` | Readiness probe — checks DB + Redis connectivity |

### Planned routes (Phase 1+)

| Prefix               | Description            |
| -------------------- | ---------------------- |
| `/api/v1/auth`       | Register, login, refresh token, logout |
| `/api/v1/users`      | Profile management     |
| `/api/v1/contacts`   | Contact list           |
| `/api/v1/conversations` | Conversation management |
| `/api/v1/messages`   | Message history        |
| `/api/v1/media`      | Presigned upload URLs  |

---

## Docker

### Local development (Docker Compose)

```bash
npm run docker:up       # Start PostgreSQL + Redis + MinIO
npm run docker:down     # Stop all services
npm run docker:reset    # Wipe all data volumes and restart
npm run docker:logs     # Tail service logs
```

Access the **MinIO Console** at [http://localhost:9001](http://localhost:9001)
(credentials: `minioadmin` / `minioadmin`).

### Production image

The [Dockerfile](Dockerfile) uses a two-stage build:

1. **builder** — installs all dependencies and compiles TypeScript
2. **production** — copies only `dist/` and production `node_modules`, runs as the unprivileged `node` user

```bash
# Build the image locally
docker build -t sandeshak-server .

# Run it
docker run -p 3000:3000 --env-file .env sandeshak-server
```

Production images are automatically built and pushed to **GitHub Container Registry (GHCR)** on every push to `main`.

---

## CI / CD

### CI — `ci.yml`

Runs on every pull request and push to `develop`:

1. `npm ci`
2. `npm run lint`
3. `npm run type-check`
4. `npm test`

### Docker build — `docker-build.yml`

Runs on every push to `main`:

1. Lint + type-check + test
2. Build multi-platform Docker image
3. Push to GHCR with `sha-<commit>` and `latest` tags

Required secrets: `GITHUB_TOKEN` (automatically provided by GitHub Actions).
