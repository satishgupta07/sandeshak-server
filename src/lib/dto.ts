import type { PrivacySettings, PrivacyVisibility, UserDTO } from '../types'

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
