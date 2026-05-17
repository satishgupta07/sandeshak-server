import prisma from '../lib/prisma'
import { conversationRoom, type AppSocket } from './types'

export async function getUserConversationIds(userId: string): Promise<string[]> {
  const rows = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true },
  })
  return rows.map((r) => r.conversationId)
}

// Subscribe a socket to every conversation room its user participates in.
// Called once on connect; new conversations created during the session
// are joined on demand by the message:send handler (and by the future
// conversation:new emit path).
export async function joinUserConversationRooms(socket: AppSocket): Promise<string[]> {
  const ids = await getUserConversationIds(socket.data.userId)
  for (const id of ids) socket.join(conversationRoom(id))
  return ids
}
