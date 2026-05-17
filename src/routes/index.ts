import { Router } from 'express'
import authRouter from './auth.routes'
import conversationsRouter from './conversations.routes'
import mediaRouter from './media.routes'
import usersRouter from './users.routes'

const router = Router()

router.use('/auth', authRouter)
router.use('/users', usersRouter)
router.use('/media', mediaRouter)
router.use('/conversations', conversationsRouter)

export default router
