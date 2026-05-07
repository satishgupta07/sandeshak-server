import jwt, { SignOptions } from 'jsonwebtoken'

export interface AccessTokenPayload {
  sub: string
  email: string
}

const getAccessSecret = (): string => {
  const s = process.env.JWT_ACCESS_SECRET
  if (!s) throw new Error('JWT_ACCESS_SECRET is not set')
  return s
}

const getAccessExpiresIn = (): SignOptions['expiresIn'] =>
  (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as SignOptions['expiresIn']

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, getAccessSecret(), { expiresIn: getAccessExpiresIn() })

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, getAccessSecret())
  if (typeof decoded === 'string' || !decoded.sub || !decoded.email) {
    throw new Error('Malformed access token')
  }
  return { sub: String(decoded.sub), email: String(decoded.email) }
}
