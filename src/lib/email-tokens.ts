import crypto from 'node:crypto'
import redis from './redis'

// Single-use, opaque tokens stored in Redis with TTL. Both flows use the same
// shape so the helpers stay symmetric.
//   verify-email:<token>    → { userId }   TTL 24 h
//   password-reset:<token>  → { userId }   TTL 1 h

const VERIFY_PREFIX = 'verify-email:'
const RESET_PREFIX = 'password-reset:'

const VERIFY_TTL_SECONDS = 60 * 60 * 24
const RESET_TTL_SECONDS = 60 * 60

interface TokenPayload {
  userId: string
}

async function createToken(prefix: string, ttl: number, userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  const payload: TokenPayload = { userId }
  await redis.set(`${prefix}${token}`, JSON.stringify(payload), 'EX', ttl)
  return token
}

async function consumeToken(prefix: string, token: string): Promise<TokenPayload | null> {
  const key = `${prefix}${token}`
  const raw = await redis.get(key)
  if (!raw) return null
  await redis.del(key)
  return JSON.parse(raw) as TokenPayload
}

export const createVerifyEmailToken = (userId: string) =>
  createToken(VERIFY_PREFIX, VERIFY_TTL_SECONDS, userId)

export const consumeVerifyEmailToken = (token: string) => consumeToken(VERIFY_PREFIX, token)

export const createPasswordResetToken = (userId: string) =>
  createToken(RESET_PREFIX, RESET_TTL_SECONDS, userId)

export const consumePasswordResetToken = (token: string) => consumeToken(RESET_PREFIX, token)
