import { z } from 'zod'

// POST /conversations — direct only for Phase 2; group creation is Phase 3.
export const createDirectConversationSchema = z.object({
  participantId: z.string().uuid(),
})

export const conversationIdParamSchema = z.string().uuid()

// GET /conversations/:id/messages?page=&limit=
export const messageHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateDirectConversationInput = z.infer<typeof createDirectConversationSchema>
export type MessageHistoryQuery = z.infer<typeof messageHistoryQuerySchema>
