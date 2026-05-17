import type { Server, Socket } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../types'

export interface SocketData {
  userId: string
  email: string
}

type EmptyEvents = Record<string, never>

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, EmptyEvents, SocketData>
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, EmptyEvents, SocketData>

export const conversationRoom = (conversationId: string): string => `conv:${conversationId}`
export const userRoom = (userId: string): string => `user:${userId}`
export const presenceSetKey = (userId: string): string => `presence:${userId}`
