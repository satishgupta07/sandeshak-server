import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { toUserDTO } from '../lib/dto'
import { hashPassword, verifyPassword } from '../lib/password'
import { signAccessToken } from '../lib/jwt'
import {
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from '../lib/refresh-tokens'
import {
  createVerifyEmailToken,
  consumeVerifyEmailToken,
  createPasswordResetToken,
  consumePasswordResetToken,
} from '../lib/email-tokens'
import { sendEmail } from '../lib/mailer'
import { requireAuth } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import {
  registerLimiter,
  loginLimiter,
  passwordResetLimiter,
  verifyEmailResendLimiter,
} from '../middleware/rate-limit'
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailQuerySchema,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
  type LogoutInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '../validators/auth.schema'

const router = Router()

const FRONTEND_URL = process.env.CLIENT_WEB_URL ?? 'http://localhost:5173'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildVerifyEmail(token: string): { subject: string; text: string; html: string } {
  const url = `${FRONTEND_URL}/verify-email?token=${token}`
  return {
    subject: 'Verify your email for Sandeshak',
    text: `Welcome to Sandeshak.\n\nVerify your email by opening this link:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Welcome to Sandeshak.</p><p>Verify your email by opening this link:</p><p><a href="${url}">${url}</a></p><p>This link expires in 24 hours.</p>`,
  }
}

function buildResetEmail(token: string): { subject: string; text: string; html: string } {
  const url = `${FRONTEND_URL}/reset-password?token=${token}`
  return {
    subject: 'Reset your Sandeshak password',
    text: `Click the link below to reset your password.\n\n${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    html: `<p>Click the link below to reset your password.</p><p><a href="${url}">${url}</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
  }
}

// Fire-and-forget email — registration / forgot-password should never block on
// SMTP latency, and a transient mail failure shouldn't fail the request.
function sendInBackground(opts: { to: string; subject: string; text: string; html: string }): void {
  sendEmail(opts).catch((err) => {
    console.error('[mailer] background send failed:', err)
  })
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, name } = req.body as RegisterInput
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) {
        res.status(409).json({ error: 'Email already registered' })
        return
      }
      const passwordHash = await hashPassword(password)
      const user = await prisma.user.create({
        data: { email, name, passwordHash, isVerified: false },
      })
      // Send verification email in the background — don't fail register if SMTP
      // is down or unconfigured (mailer logs to stdout in that case).
      const verifyToken = await createVerifyEmailToken(user.id)
      sendInBackground({ to: user.email, ...buildVerifyEmail(verifyToken) })

      const accessToken = signAccessToken({ sub: user.id, email: user.email })
      const refreshToken = await createRefreshToken(user.id)
      res.status(201).json({
        data: {
          user: toUserDTO(user),
          tokens: { accessToken, refreshToken },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as LoginInput
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        res.status(401).json({ error: 'Invalid email or password' })
        return
      }
      const accessToken = signAccessToken({ sub: user.id, email: user.email })
      const refreshToken = await createRefreshToken(user.id)
      res.json({
        data: {
          user: toUserDTO(user),
          tokens: { accessToken, refreshToken },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

// Refresh rotates the token: the old refresh token is revoked and a new
// pair is issued. Reusing a revoked token returns 401.
router.post(
  '/refresh',
  validateBody(refreshSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as RefreshInput
      const payload = await verifyRefreshToken(refreshToken)
      if (!payload) {
        res.status(401).json({ error: 'Invalid or expired refresh token' })
        return
      }
      const user = await prisma.user.findUnique({ where: { id: payload.userId } })
      if (!user) {
        res.status(401).json({ error: 'User no longer exists' })
        return
      }
      await revokeRefreshToken(refreshToken)
      const newAccess = signAccessToken({ sub: user.id, email: user.email })
      const newRefresh = await createRefreshToken(user.id)
      res.json({
        data: { accessToken: newAccess, refreshToken: newRefresh },
      })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/logout',
  validateBody(logoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as LogoutInput
      await revokeRefreshToken(refreshToken)
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  },
)

// ─── Email verification ──────────────────────────────────────────────────────

router.get(
  '/verify-email',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = verifyEmailQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid token' })
        return
      }
      const payload = await consumeVerifyEmailToken(parsed.data.token)
      if (!payload) {
        res.status(400).json({ error: 'Invalid or expired token' })
        return
      }
      const user = await prisma.user.update({
        where: { id: payload.userId },
        data: { isVerified: true },
      })
      res.json({ data: toUserDTO(user) })
    } catch (err) {
      next(err)
    }
  },
)

// Resend verification email for the current authenticated user.
router.post(
  '/send-verification-email',
  verifyEmailResendLimiter,
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
      if (!user) {
        res.status(401).json({ error: 'User no longer exists' })
        return
      }
      if (user.isVerified) {
        res.json({ data: { sent: false, alreadyVerified: true } })
        return
      }
      const token = await createVerifyEmailToken(user.id)
      sendInBackground({ to: user.email, ...buildVerifyEmail(token) })
      res.json({ data: { sent: true } })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Password reset ──────────────────────────────────────────────────────────

// Always responds 200 regardless of whether the email exists, so attackers
// can't enumerate registered accounts.
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as ForgotPasswordInput
      const user = await prisma.user.findUnique({ where: { email } })
      if (user) {
        const token = await createPasswordResetToken(user.id)
        sendInBackground({ to: user.email, ...buildResetEmail(token) })
      }
      res.json({ data: { sent: true } })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/reset-password',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, newPassword } = req.body as ResetPasswordInput
      const payload = await consumePasswordResetToken(token)
      if (!payload) {
        res.status(400).json({ error: 'Invalid or expired token' })
        return
      }
      const passwordHash = await hashPassword(newPassword)
      await prisma.user.update({
        where: { id: payload.userId },
        data: { passwordHash },
      })
      // Invalidate all sessions on password change — forces re-login everywhere.
      await revokeAllUserRefreshTokens(payload.userId)
      res.json({ data: { reset: true } })
    } catch (err) {
      next(err)
    }
  },
)

export default router
