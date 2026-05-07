import crypto from 'node:crypto'
import redis from './redis'

// Opaque refresh tokens stored in Redis with TTL — revokable, not signed.
// See docs/ARCHITECTURE.md §8 (Authentication Flow).
//
// Two key shapes:
//   refresh:<token>                    → { userId, issuedAt }   TTL 30 d
//   user:<userId>:refresh-tokens       → Set<token>             (no TTL)
// The user index lets us revoke all tokens for a user (e.g. on password reset)
// without a SCAN. Stale members are pruned on next revoke or full revoke.

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30
const KEY_PREFIX = 'refresh:'
const userIndexKey = (userId: string): string => `user:${userId}:refresh-tokens`

export interface RefreshTokenPayload {
  userId: string
  issuedAt: number
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(64).toString('hex')
  const payload: RefreshTokenPayload = { userId, issuedAt: Date.now() }
  await Promise.all([
    redis.set(`${KEY_PREFIX}${token}`, JSON.stringify(payload), 'EX', REFRESH_TTL_SECONDS),
    redis.sadd(userIndexKey(userId), token),
  ])
  return token
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  const raw = await redis.get(`${KEY_PREFIX}${token}`)
  if (!raw) return null
  return JSON.parse(raw) as RefreshTokenPayload
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const raw = await redis.get(`${KEY_PREFIX}${token}`)
  if (raw) {
    const payload = JSON.parse(raw) as RefreshTokenPayload
    await Promise.all([
      redis.del(`${KEY_PREFIX}${token}`),
      redis.srem(userIndexKey(payload.userId), token),
    ])
  } else {
    await redis.del(`${KEY_PREFIX}${token}`)
  }
}

/** Revoke every refresh token for a user — used after password reset. */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  const tokens = await redis.smembers(userIndexKey(userId))
  if (tokens.length === 0) return
  const tokenKeys = tokens.map((t) => `${KEY_PREFIX}${t}`)
  await Promise.all([redis.del(...tokenKeys), redis.del(userIndexKey(userId))])
}
