-- Runs once when the PostgreSQL container is first created.
-- Prisma migrations manage the full schema; this file only handles
-- database-level setup that must exist before migrations run.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable full-text search (used for message search in Phase 6)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
