import { Router } from 'express'
import authRouter from './auth.routes'
import usersRouter from './users.routes'
import mediaRouter from './media.routes'

const router = Router()

router.use('/auth', authRouter)
router.use('/users', usersRouter)
router.use('/media', mediaRouter)

// Future phases:
//   router.use('/conversations', conversationsRouter)

export default router
