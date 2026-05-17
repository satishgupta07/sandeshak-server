import type {
  ConversationDTO,
  ConversationType,
  MessageDTO,
  MessageReplyDTO,
  MessageType,
  ParticipantDTO,
  ParticipantRole,
  PrivacySettings,
  PrivacyVisibility,
  UserDTO,
} from '../types'

export type DbUser = {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  bio: string | null
  lastSeen: Date | null
  isVerified: boolean
  privacy: unknown
  createdAt: Date
}

const DEFAULT_PRIVACY: PrivacySettings = {
  lastSeen: 'everyone',
  avatar: 'everyone',
  status: 'everyone',
}

function parsePrivacy(raw: unknown): PrivacySettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_PRIVACY
  const p = raw as Partial<PrivacySettings>
  return {
    lastSeen: p.lastSeen ?? 'everyone',
    avatar: p.avatar ?? 'everyone',
    status: p.status ?? 'everyone',
  }
}

// Phase 1 doesn't have a contacts table yet, so 'contacts' visibility is
// treated as the strictest interpretation (= 'nobody'). Phase 3 will refine
// this once contacts land — at that point pass the contact relationship in.
function isVisible(setting: PrivacyVisibility): boolean {
  return setting === 'everyone'
}

/**
 * @param viewerId  pass to apply the target user's privacy settings.
 *                  When omitted, or equal to the user's own id, all fields
 *                  are returned (used for /users/me, auth responses, etc.).
 */
export function toUserDTO(u: DbUser, viewerId?: string): UserDTO {
  const isSelf = viewerId === undefined || viewerId === u.id
  const privacy = parsePrivacy(u.privacy)

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: isSelf || isVisible(privacy.avatar) ? u.avatarUrl : null,
    bio: isSelf || isVisible(privacy.status) ? u.bio : null,
    lastSeen: isSelf || isVisible(privacy.lastSeen) ? (u.lastSeen?.toISOString() ?? null) : null,
    isOnline: false,
    isVerified: u.isVerified,
    createdAt: u.createdAt.toISOString(),
  }
}

// ─── Conversations / Messages ────────────────────────────────────────────────

export type DbMessageReplySlim = {
  id: string
  senderId: string
  type: MessageType
  content: string | null
  mediaUrl: string | null
}

export type DbMessage = {
  id: string
  conversationId: string
  senderId: string
  type: MessageType
  content: string | null
  mediaUrl: string | null
  thumbUrl: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
  replyTo: DbMessageReplySlim | null
}

export type DbParticipant = {
  userId: string
  role: ParticipantRole
  joinedAt: Date
  lastReadAt: Date | null
  user: DbUser
}

export type DbConversation = {
  id: string
  type: ConversationType
  name: string | null
  avatarUrl: string | null
  description: string | null
  createdAt: Date
  participants: DbParticipant[]
}

export function toMessageReplyDTO(r: DbMessageReplySlim): MessageReplyDTO {
  return {
    id: r.id,
    senderId: r.senderId,
    type: r.type,
    content: r.content,
    mediaUrl: r.mediaUrl,
  }
}

// reactions are Phase 6; for now always return an empty list so the
// MessageDTO contract is satisfied without reading from a (yet) non-existent
// reactions table.
export function toMessageDTO(m: DbMessage): MessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    type: m.type,
    content: m.content,
    mediaUrl: m.mediaUrl,
    thumbUrl: m.thumbUrl,
    replyTo: m.replyTo ? toMessageReplyDTO(m.replyTo) : null,
    reactions: [],
    isDeleted: m.isDeleted,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}

export function toParticipantDTO(p: DbParticipant, viewerId: string): ParticipantDTO {
  return {
    userId: p.userId,
    user: toUserDTO(p.user, viewerId),
    role: p.role,
    joinedAt: p.joinedAt.toISOString(),
  }
}

export function toConversationDTO(
  c: DbConversation,
  viewerId: string,
  lastMessage: DbMessage | null,
  unreadCount: number,
): ConversationDTO {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    avatarUrl: c.avatarUrl,
    description: c.description,
    lastMessage: lastMessage ? toMessageDTO(lastMessage) : null,
    unreadCount,
    participants: c.participants.map((p) => toParticipantDTO(p, viewerId)),
    createdAt: c.createdAt.toISOString(),
  }
}
