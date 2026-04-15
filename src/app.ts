import express, { Application, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { errorHandler } from './middleware/errorHandler'
import router from './routes'
import prisma from './lib/prisma'
import redis from './lib/redis'

const app: Application = express()

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet())
app.use(
  cors({
    origin: [
      process.env.CLIENT_WEB_URL ?? 'http://localhost:5173',
      process.env.CLIENT_MOBILE_URL ?? 'exp://localhost:8081',
    ],
    credentials: true,
  }),
)

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/v1', router)

// ─── Health check ─────────────────────────────────────────────────────────────
// Two endpoints:
//   GET /health        — liveness probe  (is the process alive?)
//   GET /health/ready  — readiness probe (are DB + Redis reachable?)
//
// Kubernetes / load balancers use liveness to decide whether to restart a pod,
// and readiness to decide whether to send it traffic.

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/health/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'error'> = {
    database: 'error',
    redis: 'error',
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch {
    // database check failed — logged below
  }

  try {
    const pong = await redis.ping()
    if (pong === 'PONG') checks.redis = 'ok'
  } catch {
    // redis check failed — logged below
  }

  const allHealthy = Object.values(checks).every((v) => v === 'ok')

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not ready',
    checks,
    timestamp: new Date().toISOString(),
  })
})

// ─── Error handler (must be last) ────────────────────────────────────────────
app.use(errorHandler)

export default app
