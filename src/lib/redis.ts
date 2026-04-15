import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  // Add the password explicitly
  password: process.env.REDIS_PASSWORD ?? 'redispass',

  // Don't auto-connect — we connect explicitly in src/index.ts
  lazyConnect: true,
  maxRetriesPerRequest: 3,

  // Retry with exponential backoff, capped at 3 s
  retryStrategy: (times) => Math.min(times * 200, 3000),
})

redis.on('connect', () => console.log('[redis] connected'))
redis.on('ready', () => console.log('[redis] ready'))
redis.on('error', (err) => console.error('[redis] error:', err.message))
redis.on('close', () => console.warn('[redis] connection closed'))

export default redis
