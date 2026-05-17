import prisma from '../../lib/prisma'
import { conversationOnlyEventSchema } from '../../validators/socket.schema'
import { conversationRoom, type AppSocket } from '../types'

export function registerTypingHandlers(socket: AppSocket): void {
  async function relay(isTyping: boolean, payload: unknown): Promise<void> {
    const parsed = conversationOnlyEventSchema.safeParse(payload)
    if (!parsed.success) return

    const { conversationId } = parsed.data
    const userId = socket.data.userId

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return

    // Relay only — typing state is ephemeral, no persistence. Exclude the
    // sender so they don't see their own typing indicator.
    socket.to(conversationRoom(conversationId)).emit('typing', {
      conversationId,
      userId,
      isTyping,
    })
  }

  socket.on('typing:start', (payload) => {
    void relay(true, payload)
  })
  socket.on('typing:stop', (payload) => {
    void relay(false, payload)
  })
}
