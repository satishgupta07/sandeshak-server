import prisma from '../../lib/prisma'
import { toMessageDTO, type DbMessage } from '../../lib/dto'
import { getOnlineUserIds } from '../../lib/presence'
import { readMessageEventSchema, sendMessageEventSchema } from '../../validators/socket.schema'
import { conversationRoom, type AppServer, type AppSocket } from '../types'

const replyToSelect = {
  id: true,
  senderId: true,
  type: true,
  content: true,
  mediaUrl: true,
} as const

async function deliverToOnlineRecipients(
  io: AppServer,
  conversationId: string,
  messageId: string,
  senderId: string,
): Promise<void> {
  try {
    const others = await prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: senderId } },
      select: { userId: true },
    })
    const otherIds = others.map((o) => o.userId)
    if (otherIds.length === 0) return

    const online = await getOnlineUserIds(otherIds)
    if (online.size === 0) return

    const timestamp = new Date()
    const deliveredIds = [...online]

    // skipDuplicates guards against the rare case of an existing receipt
    // (e.g. recipient's client already raced ahead with message:read).
    await prisma.messageReceipt.createMany({
      data: deliveredIds.map((userId) => ({
        messageId,
        userId,
        status: 'delivered' as const,
        timestamp,
      })),
      skipDuplicates: true,
    })

    const ts = timestamp.toISOString()
    for (const userId of deliveredIds) {
      io.to(conversationRoom(conversationId)).emit('message:receipt', {
        messageId,
        userId,
        status: 'delivered',
        timestamp: ts,
      })
    }
  } catch (err) {
    console.error('[socket] deliverToOnlineRecipients failed:', err)
  }
}

export function registerMessageHandlers(io: AppServer, socket: AppSocket): void {
  socket.on('message:send', async (payload) => {
    const parsed = sendMessageEventSchema.safeParse(payload)
    if (!parsed.success) {
      console.warn(
        '[socket] message:send rejected:',
        parsed.error.issues.map((i) => i.message).join('; '),
      )
      return
    }

    const { conversationId, type, content, mediaUrl, replyToId } = parsed.data
    const userId = socket.data.userId

    // Authorize: caller must participate. Silent drop if not — clients shouldn't
    // be probing arbitrary conversation IDs.
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return

    try {
      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          type,
          content: content ?? null,
          mediaUrl: mediaUrl ?? null,
          replyToId: replyToId ?? null,
        },
        include: { replyTo: { select: replyToSelect } },
      })

      const dto = toMessageDTO(message as unknown as DbMessage)
      io.to(conversationRoom(conversationId)).emit('message:new', dto)

      // Auto-emit 'delivered' receipts for any *other* participants whose
      // socket is currently connected. The recipient's client will later
      // emit message:read when the user actually opens the conversation.
      void deliverToOnlineRecipients(io, conversationId, message.id, userId)
    } catch (err) {
      console.error('[socket] message:send failed:', err)
    }
  })

  socket.on('message:read', async (payload) => {
    const parsed = readMessageEventSchema.safeParse(payload)
    if (!parsed.success) return

    const { conversationId, messageId } = parsed.data
    const userId = socket.data.userId

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return

    // Confirm the message actually belongs to this conversation before we
    // record a receipt — prevents a client from spoofing reads on messages
    // in conversations they don't belong to.
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, createdAt: true },
    })
    if (!message || message.conversationId !== conversationId) return

    const timestamp = new Date()

    try {
      await prisma.$transaction([
        prisma.messageReceipt.upsert({
          where: { messageId_userId: { messageId, userId } },
          create: { messageId, userId, status: 'read', timestamp },
          update: { status: 'read', timestamp },
        }),
        prisma.conversationParticipant.update({
          where: { conversationId_userId: { conversationId, userId } },
          // Advance lastReadAt to the read message's createdAt — only forward,
          // never backward (so a client re-reading an older message doesn't
          // shrink the read horizon).
          data: {
            lastReadAt:
              participant.lastReadAt && participant.lastReadAt > message.createdAt
                ? participant.lastReadAt
                : message.createdAt,
          },
        }),
      ])

      io.to(conversationRoom(conversationId)).emit('message:receipt', {
        messageId,
        userId,
        status: 'read',
        timestamp: timestamp.toISOString(),
      })
    } catch (err) {
      console.error('[socket] message:read failed:', err)
    }
  })
}
