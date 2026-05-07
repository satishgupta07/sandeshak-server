import { z } from 'zod'

// PATCH /users/me — partial update. Email/passwordHash are NOT updatable here.
// Send `null` to clear `bio` or `avatarUrl`; omit a field to leave it unchanged.
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    bio: z.string().trim().max(139).nullable().optional(),
    avatarUrl: z.string().url().max(2000).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  })

// GET /users/search?q=&page=&limit=
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const userIdParamSchema = z.string().uuid()

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type SearchQueryInput = z.infer<typeof searchQuerySchema>
