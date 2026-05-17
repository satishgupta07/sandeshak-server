#!/bin/sh
set -e

echo "[entrypoint] running prisma migrate deploy"
npx prisma migrate deploy

echo "[entrypoint] starting server"
exec node dist/index.js
