import { z } from 'zod'

export const mediaTypeSchema = z.enum(['image', 'video', 'audio', 'document'])

// Per-type allowlists. MIME types not in this list are rejected.
export const ALLOWED_MIMES_BY_TYPE: Record<z.infer<typeof mediaTypeSchema>, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'],
  document: ['application/pdf'],
}

// Per-type size caps from docs/REQUIREMENTS.md §3.7 (MED-01..MED-04).
export const MAX_SIZE_BY_TYPE: Record<z.infer<typeof mediaTypeSchema>, number> = {
  image: 16 * 1024 * 1024,
  video: 64 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
}

export const presignSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(127),
    mediaType: mediaTypeSchema,
    fileSize: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
  })
  .refine((data) => ALLOWED_MIMES_BY_TYPE[data.mediaType].includes(data.mimeType), {
    message: 'mimeType is not allowed for this mediaType',
    path: ['mimeType'],
  })
  .refine((data) => data.fileSize <= MAX_SIZE_BY_TYPE[data.mediaType], {
    message: 'fileSize exceeds the limit for this mediaType',
    path: ['fileSize'],
  })

export const confirmSchema = z.object({
  key: z.string().min(1).max(512),
})

export type PresignInput = z.infer<typeof presignSchema>
export type ConfirmInput = z.infer<typeof confirmSchema>
