import prisma from '../lib/prisma'
import { conversationRoom, userRoom, type AppSocket } from './types'

export async function getUserConversationIds(userId: string): Promise<string[]> {
  const rows = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true },
  })
  return rows.map((r) => r.conversationId)
}

// Subscribe a socket to every conversation room its user participates in,
// plus the user's own room (used to push events to all of that user's
// active sockets — e.g. conversation:new when a new conv is created out-of-band).
export async function joinUserConversationRooms(socket: AppSocket): Promise<string[]> {
  socket.join(userRoom(socket.data.userId))
  const ids = await getUserConversationIds(socket.data.userId)
  for (const id of ids) socket.join(conversationRoom(id))
  return ids
}
