import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { toUserDTO } from '../lib/dto'
import { requireAuth } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import {
  updateProfileSchema,
  searchQuerySchema,
  userIdParamSchema,
  type UpdateProfileInput,
} from '../validators/user.schema'
import type { PaginatedResponse, UserDTO } from '../types'

const router = Router()

// All /users routes require auth.
router.use(requireAuth)

// Order matters: /me and /search must come before /:id so they don't match
// the dynamic param route.

router.get('/me', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) {
      res.status(401).json({ error: 'User no longer exists' })
      return
    }
    res.json({ data: toUserDTO(user) })
  } catch (err) {
    next(err)
  }
})

router.patch(
  '/me',
  validateBody(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as UpdateProfileInput
      const data: { name?: string; bio?: string | null; avatarUrl?: string | null } = {}
      if (input.name !== undefined) data.name = input.name
      if (input.bio !== undefined) data.bio = input.bio
      if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl

      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data,
      })
      res.json({ data: toUserDTO(user) })
    } catch (err) {
      next(err)
    }
  },
)

router.get('/search', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = searchQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      res.status(400).json({ error: message })
      return
    }
    const { q, page, limit } = parsed.data
    const offset = (page - 1) * limit

    const filter = {
      AND: [
        { id: { not: req.user!.id } },
        {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        },
      ],
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where: filter,
        take: limit,
        skip: offset,
        orderBy: { name: 'asc' },
      }),
      prisma.user.count({ where: filter }),
    ])

    const viewerId = req.user!.id
    const response: PaginatedResponse<UserDTO> = {
      data: items.map((u) => toUserDTO(u, viewerId)),
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const idResult = userIdParamSchema.safeParse(req.params.id)
    if (!idResult.success) {
      res.status(400).json({ error: 'Invalid user id' })
      return
    }
    const user = await prisma.user.findUnique({ where: { id: idResult.data } })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({ data: toUserDTO(user, req.user!.id) })
  } catch (err) {
    next(err)
  }
})

export default router
