import redis from './redis'
import { presenceSetKey } from '../socket/types'

// A user is "online" if their presence set contains at least one socket id.
// The set is populated by the socket layer's markOnline / markOffline.
export async function isUserOnline(userId: string): Promise<boolean> {
  const count = await redis.scard(presenceSetKey(userId))
  return count > 0
}

// Batched variant — one pipelined SCARD per id. Returns the subset of input
// ids that are currently online.
export async function getOnlineUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const pipeline = redis.pipeline()
  for (const id of userIds) pipeline.scard(presenceSetKey(id))
  const results = await pipeline.exec()
  const online = new Set<string>()
  if (!results) return online
  results.forEach(([err, count], idx) => {
    if (err) return
    if (typeof count === 'number' && count > 0) online.add(userIds[idx])
  })
  return online
}
