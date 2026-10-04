import type { Enums } from '@households/db'
import { z } from 'zod'

// Family chat. The database (chat migration) decides who's in a conversation;
// these give the apps and the API the same rules for what's sent.

export type ConversationKind = Enums<'conversation_kind'>

export const MAX_MESSAGE_LENGTH = 4000
export const CHAT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
] as const
export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024

export const messageInputSchema = z
  .strictObject({
    body: z.string().trim().max(MAX_MESSAGE_LENGTH, 'That message is too long.'),
    /** A photo already uploaded to the conversation's storage folder. */
    imagePath: z.string().max(300).nullable().optional(),
    replyTo: z.uuid().nullable().optional(),
  })
  .refine((input) => input.body.length > 0 || Boolean(input.imagePath), {
    path: ['body'],
    message: 'Write something.',
  })
export type MessageInput = z.input<typeof messageInputSchema>

export const editMessageInputSchema = z.strictObject({
  body: z.string().trim().min(1, 'Write something.').max(MAX_MESSAGE_LENGTH),
})

export const startGroupInputSchema = z.strictObject({
  title: z.string().trim().min(1, 'Give the group a name.').max(80),
  memberIds: z
    .array(z.uuid())
    .min(1, 'Choose who’s in it.')
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each person once.'),
})
export type StartGroupInput = z.input<typeof startGroupInputSchema>

export const directChatInputSchema = z.strictObject({ profileId: z.uuid() })
export const muteInputSchema = z.strictObject({ muted: z.boolean() })
export const renameGroupInputSchema = z.strictObject({
  title: z.string().trim().min(1, 'Give the group a name.').max(80),
})
export const messagesQuerySchema = z.object({ before: z.iso.datetime({ offset: true }).optional() })

export interface Conversation {
  id: string
  kind: ConversationKind
  /** The group's name; null for the household chat and direct ones (the app names them). */
  title: string | null
  /** Who's in it (group and direct). */
  memberIds: string[]
  lastMessage: {
    authorId: string | null
    body: string
    hasImage: boolean
    deleted: boolean
    createdAt: string
  } | null
  unread: number
  muted: boolean
}

export interface ChatMessage {
  id: string
  authorId: string | null
  body: string
  imagePath: string | null
  /** A short-lived link to the photo (null once deleted, or if it can't be read). */
  imageUrl: string | null
  replyTo: string | null
  createdAt: string
  editedAt: string | null
  deleted: boolean
}

export interface ChatInbox {
  conversations: Conversation[]
  canPost: boolean
}

export interface ChatThread {
  conversation: Conversation
  /** Oldest first. */
  messages: ChatMessage[]
  hasMore: boolean
  canPost: boolean
  /** Moderators may delete others' messages in the household chat. */
  canModerate: boolean
}
