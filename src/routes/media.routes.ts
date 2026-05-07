import crypto from 'node:crypto'
import { Router, Request, Response, NextFunction } from 'express'
import { createPresignedPutUrl, publicUrlForKey, PRESIGN_EXPIRES_IN_SECONDS } from '../lib/s3'
import { requireAuth } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import {
  presignSchema,
  confirmSchema,
  type PresignInput,
  type ConfirmInput,
} from '../validators/media.schema'

const router = Router()
router.use(requireAuth)

// Map allowed MIME types to file extensions used in the storage key.
// Falls back to 'bin' for anything not listed (validators block unknown MIMEs
// upstream, so this is just defensive).
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
}

const userKeyPrefix = (userId: string): string => `public/${userId}/`

// POST /media/presign — issue a short-lived presigned PUT URL.
// Client uploads the file directly to MinIO/S3. The server never sees the bytes.
router.post(
  '/presign',
  validateBody(presignSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { mimeType, mediaType } = req.body as PresignInput
      const ext = MIME_TO_EXT[mimeType] ?? 'bin'
      const key = `${userKeyPrefix(req.user!.id)}${mediaType}/${crypto.randomUUID()}.${ext}`
      const uploadUrl = await createPresignedPutUrl(key, mimeType)
      res.json({
        data: {
          uploadUrl,
          key,
          expiresIn: PRESIGN_EXPIRES_IN_SECONDS,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

// POST /media/confirm — return the public URL for a key the user just uploaded.
// Ownership is enforced by the user-prefixed key path issued in /presign.
// Phase 3 will extend this to generate thumbnails (Sharp) and persist a media row.
router.post(
  '/confirm',
  validateBody(confirmSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { key } = req.body as ConfirmInput
      if (!key.startsWith(userKeyPrefix(req.user!.id))) {
        res.status(403).json({ error: 'Key does not belong to the current user' })
        return
      }
      res.json({
        data: {
          url: publicUrlForKey(key),
          thumbUrl: null,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
