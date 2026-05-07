import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(128),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
})

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1).max(128),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
export type LogoutInput = z.infer<typeof logoutSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
