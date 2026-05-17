import { z } from 'zod'

// Server-only types like 'system' are excluded from client-sendable schemas.
export const userSendableMessageTypeSchema = z.enum([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'voice',
])

export const sendMessageEventSchema = z
  .object({
    conversationId: z.string().uuid(),
    type: userSendableMessageTypeSchema,
    content: z.string().min(1).max(8000).optional(),
    mediaUrl: z.string().url().max(2000).optional(),
    replyToId: z.string().uuid().optional(),
  })
  .refine((d) => (d.type === 'text' ? Boolean(d.content) : Boolean(d.mediaUrl)), {
    message: 'text messages need content; media messages need mediaUrl',
  })

export const readMessageEventSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
})

export const conversationOnlyEventSchema = z.object({
  conversationId: z.string().uuid(),
})

export type SendMessageEventInput = z.infer<typeof sendMessageEventSchema>
export type ReadMessageEventInput = z.infer<typeof readMessageEventSchema>
export type ConversationOnlyEventInput = z.infer<typeof conversationOnlyEventSchema>
