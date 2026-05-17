import prisma from '../../lib/prisma'
import redis from '../../lib/redis'
import { getUserConversationIds } from '../rooms'
import { conversationRoom, presenceSetKey, type AppServer } from '../types'

// 24h safety TTL so a process crashing mid-disconnect doesn't strand a user
// "online" forever. The next connect re-extends it; the next disconnect
// cleans up properly.
const PRESENCE_TTL_SECONDS = 60 * 60 * 24

async function broadcastPresence(
  io: AppServer,
  userId: string,
  isOnline: boolean,
  lastSeen: string | null,
): Promise<void> {
  const convIds = await getUserConversationIds(userId)
  for (const convId of convIds) {
    io.to(conversationRoom(convId)).emit('presence:update', { userId, isOnline, lastSeen })
  }
}

// Returns whether this connect was the user's first active socket.
export async function markOnline(io: AppServer, userId: string, socketId: string): Promise<void> {
  const key = presenceSetKey(userId)
  const wasOffline = (await redis.scard(key)) === 0
  await redis.sadd(key, socketId)
  await redis.expire(key, PRESENCE_TTL_SECONDS)

  if (wasOffline) {
    await broadcastPresence(io, userId, true, null)
  }
}

export async function markOffline(io: AppServer, userId: string, socketId: string): Promise<void> {
  const key = presenceSetKey(userId)
  await redis.srem(key, socketId)
  const remaining = await redis.scard(key)
  if (remaining > 0) return

  const lastSeen = new Date()
  await prisma.user.update({ where: { id: userId }, data: { lastSeen } })
  await broadcastPresence(io, userId, false, lastSeen.toISOString())
}
