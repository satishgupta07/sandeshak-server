/**
 * src/types/index.ts — SOURCE OF TRUTH
 *
 * All API request/response shapes and Socket.io event contracts live here.
 * When this file changes, copy it to:
 *   - sandeshak-web/src/types/index.ts
 *   - sandeshak-mobile/src/types/index.ts
 */

// ─── HTTP: Generic response wrappers ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiError {
  error: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

/** Standard query params for paginated list endpoints */
export interface PaginationQuery {
  page?: number // default: 1
  limit?: number // default: 20, max: 100
  cursor?: string // cursor-based pagination (message history)
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string
  password: string // min 8 chars, validated server-side
  name: string // max 100 chars
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  newPassword: string
}

export interface AuthTokens {
  accessToken: string // JWT, 15-minute TTL
  refreshToken: string // opaque token, 30-day TTL, stored in Redis
}

/** Response payload for register / login — wrapped in ApiResponse<AuthResponse> */
export interface AuthResponse {
  user: UserDTO
  tokens: AuthTokens
}

export interface RefreshRequest {
  refreshToken: string
}

export interface LogoutRequest {
  refreshToken: string
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface UserDTO {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  bio: string | null // max 139 chars
  lastSeen: string | null // ISO 8601, null if hidden by privacy settings
  isOnline: boolean
  isVerified: boolean // email verification status
  createdAt: string
}

export interface UpdateProfileRequest {
  name?: string
  bio?: string
  avatarUrl?: string
}

export type PrivacyVisibility = 'everyone' | 'contacts' | 'nobody'

export interface PrivacySettings {
  lastSeen: PrivacyVisibility
  avatar: PrivacyVisibility
  status: PrivacyVisibility
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export interface ContactDTO {
  userId: string
  contact: UserDTO
  nickname: string | null
  createdAt: string
}

export interface AddContactRequest {
  contactId: string
  nickname?: string
}

// ─── Conversation ────────────────────────────────────────────────────────────

export type ConversationType = 'direct' | 'group'

export interface ConversationDTO {
  id: string
  type: ConversationType
  name: string | null // null for direct conversations
  avatarUrl: string | null
  description: string | null // groups only
  lastMessage: MessageDTO | null
  unreadCount: number
  participants: ParticipantDTO[]
  createdAt: string
}

export type ParticipantRole = 'admin' | 'member'

export interface ParticipantDTO {
  userId: string
  user: UserDTO
  role: ParticipantRole
  joinedAt: string
}

export interface CreateDirectConversationRequest {
  participantId: string
}

export interface CreateGroupRequest {
  name: string
  memberIds: string[] // user IDs to add (creator is added automatically as admin)
  avatarUrl?: string
  description?: string
}

export interface UpdateGroupRequest {
  name?: string
  avatarUrl?: string
  description?: string
}

export interface AddGroupMemberRequest {
  userId: string
}

export interface UpdateParticipantRoleRequest {
  role: ParticipantRole
}

// ─── Message ─────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice' | 'system'

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

export interface MessageDTO {
  id: string
  conversationId: string
  senderId: string
  type: MessageType
  content: string | null // encrypted ciphertext (Phase 5: E2EE)
  mediaUrl: string | null
  thumbUrl: string | null // server-generated thumbnail for images/videos
  replyTo: MessageReplyDTO | null
  reactions: ReactionDTO[]
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

/** Slim version of MessageDTO used inside replyTo (avoids deep nesting) */
export interface MessageReplyDTO {
  id: string
  senderId: string
  type: MessageType
  content: string | null
  mediaUrl: string | null
}

export interface ReactionDTO {
  userId: string
  emoji: string
  createdAt: string
}

export interface SendMessageRequest {
  type: MessageType
  content?: string
  mediaUrl?: string
  replyToId?: string
}

export interface EditMessageRequest {
  content: string
}

export interface AddReactionRequest {
  emoji: string
}

// ─── Media ───────────────────────────────────────────────────────────────────

export type MediaType = 'image' | 'video' | 'audio' | 'document'

export interface PresignRequest {
  fileName: string
  mimeType: string
  mediaType: MediaType
  fileSize: number // bytes — validated against per-type limits server-side
}

export interface PresignResponse {
  uploadUrl: string // pre-signed S3/MinIO URL — PUT directly from client
  key: string // object key in the bucket
  expiresIn: number // seconds until uploadUrl expires
}

export interface MediaConfirmRequest {
  key: string
}

export interface MediaConfirmResponse {
  url: string // permanent CDN URL
  thumbUrl: string | null
}

// ─── Socket.io events ────────────────────────────────────────────────────────
//
// Naming convention : "<resource>:<action>"
// Usage in server  : io.on('connection', (socket: Socket<C2S, S2C>) => { ... })
// Usage in client  : socket.on('message:new', (msg) => { ... })

/** Events emitted BY the server, received BY clients */
export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void

  'message:receipt': (payload: {
    messageId: string
    userId: string
    status: 'delivered' | 'read'
    timestamp: string
  }) => void

  'message:deleted': (payload: { messageId: string; conversationId: string }) => void

  'message:edited': (payload: { messageId: string; content: string; updatedAt: string }) => void

  'message:reaction': (payload: {
    messageId: string
    conversationId: string
    reaction: ReactionDTO
  }) => void

  typing: (payload: { conversationId: string; userId: string; isTyping: boolean }) => void

  'presence:update': (payload: {
    userId: string
    isOnline: boolean
    lastSeen: string | null
  }) => void

  'conversation:new': (conversation: ConversationDTO) => void

  'group:member:added': (payload: { conversationId: string; participant: ParticipantDTO }) => void

  'group:member:removed': (payload: { conversationId: string; userId: string }) => void
}

/** Events emitted BY clients, received BY the server */
export interface ClientToServerEvents {
  'message:send': (payload: {
    conversationId: string
    type: MessageType
    content?: string
    mediaUrl?: string
    replyToId?: string
  }) => void

  'message:read': (payload: { conversationId: string; messageId: string }) => void

  'typing:start': (payload: { conversationId: string }) => void
  'typing:stop': (payload: { conversationId: string }) => void
}

/**
 * Inter-server events — used by the Socket.io Redis adapter when running
 * multiple server instances. Not emitted or listened to directly in app code.
 */
export type InterServerEvents = Record<string, never>

/** Per-socket data attached to socket.data (available anywhere in the server) */
export interface SocketData {
  userId: string
  email: string
}
