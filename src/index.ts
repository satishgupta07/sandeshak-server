import 'dotenv/config'
import app from './app'
import prisma from './lib/prisma'
import redis from './lib/redis'

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

async function main() {
  // 1. Connect to PostgreSQL
  await prisma.$connect()
  console.log('[db] connected to PostgreSQL')

  // 2. Connect to Redis
  await redis.connect()

  // 3. Start HTTP server — only after both connections are healthy
  app.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`)
    console.log(`[server] Environment: ${process.env.NODE_ENV ?? 'development'}`)
  })
}

main().catch((err) => {
  console.error('[startup] Failed to start server:', err)
  process.exit(1)
})

// ─── Graceful shutdown ───────────────────────────────────────────────────────
// Ensures in-flight requests complete and connections are cleanly closed
// before the process exits (important for Kubernetes / Docker rolling deploys).

async function shutdown(signal: string) {
  console.log(`\n[server] ${signal} received — shutting down gracefully`)
  await prisma.$disconnect()
  console.log('[db] disconnected')
  await redis.quit()
  console.log('[redis] disconnected')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
