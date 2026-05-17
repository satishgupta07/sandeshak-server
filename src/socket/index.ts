import type { Server as HttpServer } from 'node:http'
import { createAdapter } from '@socket.io/redis-adapter'
import { Server } from 'socket.io'
import redis from '../lib/redis'
import { socketAuth } from './auth'
import { registerMessageHandlers } from './handlers/message'
import { markOffline, markOnline } from './handlers/presence'
import { registerTypingHandlers } from './handlers/typing'
import { joinUserConversationRooms } from './rooms'
import type { AppServer } from './types'

// Module-scoped reference so non-socket code (REST routes) can publish events
// without plumbing the io instance through Express. Returned by getIo() once
// createSocketServer has run.
let currentIo: AppServer | null = null

export function getIo(): AppServer | null {
  return currentIo
}

export async function createSocketServer(httpServer: HttpServer): Promise<AppServer> {
  const io: AppServer = new Server(httpServer, {
    cors: {
      origin: [
        process.env.CLIENT_WEB_URL ?? 'http://localhost:5173',
        process.env.CLIENT_MOBILE_URL ?? 'exp://localhost:8081',
      ],
      credentials: true,
    },
  })

  // Redis adapter — required for horizontal scaling. Two clients: one to
  // publish, one to subscribe (single-subscriber-per-connection rule).
  const pubClient = redis.duplicate({ lazyConnect: false })
  const subClient = redis.duplicate({ lazyConnect: false })
  await Promise.all([
    pubClient.status === 'ready' ? Promise.resolve() : pubClient.connect(),
    subClient.status === 'ready' ? Promise.resolve() : subClient.connect(),
  ])
  io.adapter(createAdapter(pubClient, subClient))

  io.use(socketAuth)

  io.on('connection', (socket) => {
    const { userId } = socket.data

    void (async () => {
      try {
        await joinUserConversationRooms(socket)
        await markOnline(io, userId, socket.id)
      } catch (err) {
        console.error('[socket] connect bootstrap failed:', err)
      }
    })()

    registerMessageHandlers(io, socket)
    registerTypingHandlers(socket)

    socket.on('disconnect', () => {
      void markOffline(io, userId, socket.id).catch((err) => {
        console.error('[socket] disconnect cleanup failed:', err)
      })
    })
  })

  currentIo = io
  return io
}
