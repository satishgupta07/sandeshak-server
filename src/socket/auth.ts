import { verifyAccessToken } from '../lib/jwt'
import type { AppSocket } from './types'

// Socket.io handshake middleware. Token can come from either:
//   - socket.handshake.auth.token  (preferred — `io(url, { auth: { token } })`)
//   - Authorization: Bearer <token>  (fallback — works with browsers that
//     can't set custom headers on long-poll requests)
export function socketAuth(socket: AppSocket, next: (err?: Error) => void): void {
  const auth = socket.handshake.auth as { token?: unknown } | undefined
  const headerAuth = socket.handshake.headers.authorization
  const fromHeader = headerAuth?.startsWith('Bearer ') ? headerAuth.slice(7) : undefined
  const token = typeof auth?.token === 'string' ? auth.token : fromHeader

  if (!token) {
    next(new Error('Missing auth token'))
    return
  }

  try {
    const payload = verifyAccessToken(token)
    socket.data.userId = payload.sub
    socket.data.email = payload.email
    next()
  } catch {
    next(new Error('Invalid or expired token'))
  }
}
