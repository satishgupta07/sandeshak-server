import rateLimit, { type Options } from 'express-rate-limit'

// Tighter limits in production. Dev gets generous limits so curl/Postman
// loops don't trip the throttle while iterating.
const isDev = process.env.NODE_ENV !== 'production'

const baseOptions: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}

/** 5 / 15 min in prod, 100 / 15 min in dev. Mass account creation guard. */
export const registerLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 100 : 5,
})

/** 10 / 15 min in prod, 100 / 15 min in dev. Brute-force guard. */
export const loginLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 100 : 10,
})

/** 3 / hour in prod, 50 / hour in dev. Email-bombing guard. */
export const passwordResetLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: isDev ? 50 : 3,
})

/** 5 / hour in prod, 50 / hour in dev. Same email-bombing guard. */
export const verifyEmailResendLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: isDev ? 50 : 5,
})
