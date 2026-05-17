import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import {
  conversationIdParamSchema,
  createDirectConversationSchema,
  messageHistoryQuerySchema,
  type CreateDirectConversationInput,
} from '../validators/conversation.schema'
import { toConversationDTO, toMessageDTO, type DbConversation, type DbMessage } from '../lib/dto'
import { getOnlineUserIds } from '../lib/presence'
import { getIo } from '../socket'
import { conversationRoom, userRoom } from '../socket/types'
import type { ConversationDTO, MessageDTO, PaginatedResponse } from '../types'

// UserDTO.isOnline is part of the contract but toUserDTO can't compute it
// without a Redis round-trip. We populate it post-hoc on freshly-built DTOs
// so the mapper layer stays sync. Mutates in place.
async function annotateOnlinePresence(convs: ConversationDTO[]): Promise<void> {
  const allUserIds = new Set<string>()
  for (const c of convs) for (const p of c.participants) allUserIds.add(p.userId)
  if (allUserIds.size === 0) return
  const online = await getOnlineUserIds([...allUserIds])
  for (const c of convs) {
    for (const p of c.participants) {
      p.user.isOnline = online.has(p.userId)
    }
  }
}

const router = Router()
router.use(requireAuth)

// Prisma include needed everywhere we want to hand a conversation to
// toConversationDTO. Kept here so the include shape matches the DbConversation
// type one place.
const conversationInclude = {
  participants: { include: { user: true } },
} as const

// Prisma select for the reply-to slim payload — must match DbMessageReplySlim.
const replyToSelect = {
  id: true,
  senderId: true,
  type: true,
  content: true,
  mediaUrl: true,
} as const

async function hydrateConversation(
  conv: DbConversation,
  viewerId: string,
): Promise<ConversationDTO> {
  const lastMessage = await prisma.message.findFirst({
    where: { conversationId: conv.id, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    include: { replyTo: { select: replyToSelect } },
  })

  const viewerParticipant = conv.participants.find((p) => p.userId === viewerId)
  const lastReadAt = viewerParticipant?.lastReadAt ?? null

  const unreadCount = await prisma.message.count({
    where: {
      conversationId: conv.id,
      senderId: { not: viewerId },
      isDeleted: false,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  })

  return toConversationDTO(
    conv,
    viewerId,
    lastMessage ? (lastMessage as unknown as DbMessage) : null,
    unreadCount,
  )
}

// ─── POST /conversations ─────────────────────────────────────────────────────
// Direct only for Phase 2; groups arrive in Phase 3. Idempotent: a second
// call with the same participantId returns the existing conversation.
router.post(
  '/',
  validateBody(createDirectConversationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { participantId } = req.body as CreateDirectConversationInput
      const userId = req.user!.id

      if (participantId === userId) {
        res.status(400).json({ error: 'Cannot start a direct conversation with yourself' })
        return
      }

      const other = await prisma.user.findUnique({ where: { id: participantId } })
      if (!other) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      // A 'direct' conversation is implicitly the unique pair {userId, participantId}.
      // Race risk: two concurrent POSTs could both miss the existing lookup and
      // each create a fresh conversation. Acceptable for Phase 2 — Phase 6
      // polish can add a unique canonical-pair constraint if duplicates show up.
      const existing = await prisma.conversation.findFirst({
        where: {
          type: 'direct',
          AND: [
            { participants: { some: { userId } } },
            { participants: { some: { userId: participantId } } },
          ],
        },
        include: conversationInclude,
      })

      const conv =
        existing ??
        (await prisma.conversation.create({
          data: {
            type: 'direct',
            createdBy: userId,
            participants: {
              create: [
                { userId, role: 'member' },
                { userId: participantId, role: 'member' },
              ],
            },
          },
          include: conversationInclude,
        }))

      const dto = await hydrateConversation(conv as unknown as DbConversation, userId)
      await annotateOnlinePresence([dto])

      if (!existing) {
        // Subscribe both users' currently-connected sockets to the new room
        // so they receive subsequent message:new events, then notify them.
        const io = getIo()
        if (io) {
          const room = conversationRoom(conv.id)
          await io.in(userRoom(userId)).socketsJoin(room)
          await io.in(userRoom(participantId)).socketsJoin(room)
          io.to(userRoom(userId)).to(userRoom(participantId)).emit('conversation:new', dto)
        }
      }

      res.status(existing ? 200 : 201).json({ data: dto })
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /conversations ──────────────────────────────────────────────────────
// Returns every conversation the caller participates in, with last message and
// unread count attached. Sorted by createdAt desc — proper "last-activity"
// sorting needs a denormalized lastMessageAt column, which lands with the
// Socket.io slice (Phase 2 Slice B).
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id

    const convs = await prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: conversationInclude,
      orderBy: { createdAt: 'desc' },
    })

    const data = await Promise.all(
      convs.map((c) => hydrateConversation(c as unknown as DbConversation, userId)),
    )
    await annotateOnlinePresence(data)
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

// ─── GET /conversations/:id/messages ─────────────────────────────────────────
// Newest-first paginated history. Cursor-based pagination is Phase 6 polish;
// page/limit is good enough for Phase 2.
router.get(
  '/:id/messages',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idResult = conversationIdParamSchema.safeParse(req.params.id)
      if (!idResult.success) {
        res.status(400).json({ error: 'Invalid conversation id' })
        return
      }
      const conversationId = idResult.data
      const userId = req.user!.id

      const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      })
      if (!participant) {
        // 404 (not 403) — don't leak existence of conversations the caller can't see.
        res.status(404).json({ error: 'Conversation not found' })
        return
      }

      const queryResult = messageHistoryQuerySchema.safeParse(req.query)
      if (!queryResult.success) {
        const message = queryResult.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')
        res.status(400).json({ error: message })
        return
      }
      const { page, limit } = queryResult.data
      const offset = (page - 1) * limit

      const filter = { conversationId, isDeleted: false }

      const [items, total] = await Promise.all([
        prisma.message.findMany({
          where: filter,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: { replyTo: { select: replyToSelect } },
        }),
        prisma.message.count({ where: filter }),
      ])

      const response: PaginatedResponse<MessageDTO> = {
        data: items.map((m) => toMessageDTO(m as unknown as DbMessage)),
        total,
        page,
        limit,
        hasMore: offset + items.length < total,
      }
      res.json(response)
    } catch (err) {
      next(err)
    }
  },
)

export default router
