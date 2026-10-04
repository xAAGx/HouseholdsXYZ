import {
  ApiError,
  directChatInputSchema,
  editMessageInputSchema,
  messageInputSchema,
  messagesQuerySchema,
  muteInputSchema,
  renameGroupInputSchema,
  startGroupInputSchema,
  type ChatInbox,
  type ChatMessage,
  type ChatThread,
  type Conversation,
} from '@households/shared'
import type { Database, HouseholdsSupabaseClient } from '@households/db'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/households/:id/chat. Everything goes through RLS: the
// household chat is for its members, groups and direct chats only for the
// people in them (parents don't read their children's direct chats). Photos
// live in private storage and are handed out as short-lived links.

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const conversationParam = zValidator(
  'param',
  z.object({ id: z.uuid(), conversationId: z.uuid() }),
  validationHook,
)
const messageParam = zValidator(
  'param',
  z.object({ id: z.uuid(), conversationId: z.uuid(), messageId: z.uuid() }),
  validationHook,
)

const PAGE_SIZE = 50
const PHOTO_BUCKET = 'household-media'
/** How long a photo link works. Threads refetch well within it. */
const PHOTO_LINK_SECONDS = 60 * 60

const MESSAGE_FIELDS =
  'id, author_id, body, image_path, reply_to, created_at, edited_at, deleted_at'

const ok = { ok: true as const }
const notFound = () => new ApiError('NOT_FOUND')

type OverviewRow = Database['public']['Functions']['chat_overview']['Returns'][number]

function toConversation(row: OverviewRow): Conversation {
  return {
    id: row.conversation_id,
    kind: row.kind,
    title: row.title,
    memberIds: row.member_ids,
    lastMessage: row.last_at
      ? {
          authorId: row.last_author,
          body: row.last_deleted ? '' : row.last_body,
          hasImage: row.last_has_image,
          deleted: row.last_deleted,
          createdAt: row.last_at,
        }
      : null,
    unread: Number(row.unread),
    muted: row.muted,
  }
}

async function overview(db: HouseholdsSupabaseClient, householdId: string) {
  const { data, error } = await db.rpc('chat_overview', { p_household_id: householdId })
  if (error) throw toApiError(error)
  // Members always see the household chat; nothing at all means "not yours".
  if (data.length === 0) throw notFound()
  return data
}

/** Short-lived links for the photos people can still see. */
async function photoLinks(db: HouseholdsSupabaseClient, paths: string[]) {
  const links = new Map<string, string>()
  if (paths.length === 0) return links
  const { data, error } = await db.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, PHOTO_LINK_SECONDS)
  if (error) return links
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) links.set(item.path, item.signedUrl)
  }
  return links
}

// What the chat migration's checks raise, written for people. Anything else
// gets the generic message, so database wording never leaks.
const CHECK_MESSAGES = new Set([
  'Give the group a name.',
  'Choose who’s in it.',
  'Only members of this household can be in it.',
  'You can only reply in the same conversation.',
  'That photo belongs somewhere else.',
  'This message was deleted.',
])

function rpcError(error: Parameters<typeof toApiError>[0]): ApiError {
  if (error.code === '54000' && error.message === 'Slow down a little.') {
    return new ApiError('RATE_LIMITED', 'Slow down a little.', undefined, { cause: error })
  }
  const message = error.message.replace("'", '’')
  if (error.code === '22023' && CHECK_MESSAGES.has(message)) {
    return new ApiError('VALIDATION_FAILED', message, undefined, { cause: error })
  }
  return toApiError(error)
}

export const chatRoutes = new Hono<AppEnv>()
  // Every conversation you're in, newest first, with unread counts.
  .get('/', householdParam, async (c) => {
    const { id } = c.req.valid('param')
    const db = c.var.supabase
    const [rows, permissions] = await Promise.all([
      overview(db, id),
      db.rpc('my_household_permissions', { p_household_id: id }),
    ])
    if (permissions.error) throw toApiError(permissions.error)
    const inbox: ChatInbox = {
      conversations: rows.map(toConversation),
      canPost: permissions.data.includes('create_posts'),
    }
    return c.json(inbox)
  })

  // Starts a named group with the people chosen (and you).
  .post(
    '/groups',
    householdParam,
    zValidator('json', startGroupInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase.rpc('start_group_chat', {
        p_household_id: id,
        p_title: input.title,
        p_member_ids: input.memberIds,
      })
      if (error) throw rpcError(error)
      return c.json({ id: data }, 201)
    },
  )

  // The conversation between you and one other member (made the first time).
  .post(
    '/direct',
    householdParam,
    zValidator('json', directChatInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { profileId } = c.req.valid('json')
      const { data, error } = await c.var.supabase.rpc('direct_chat', {
        p_household_id: id,
        p_profile_id: profileId,
      })
      if (error) throw rpcError(error)
      return c.json({ id: data })
    },
  )

  // A page of messages (oldest first), ending before `before` if given.
  .get(
    '/:conversationId',
    conversationParam,
    zValidator('query', messagesQuerySchema, validationHook),
    async (c) => {
      const { id, conversationId } = c.req.valid('param')
      const { before } = c.req.valid('query')
      const db = c.var.supabase

      let query = db
        .from('messages')
        .select(MESSAGE_FIELDS)
        .eq('conversation_id', conversationId)
        .eq('household_id', id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE + 1)
      if (before) query = query.lt('created_at', before)

      const [rows, messages, permissions] = await Promise.all([
        overview(db, id),
        query,
        db.rpc('my_household_permissions', { p_household_id: id }),
      ])
      if (messages.error) throw toApiError(messages.error)
      if (permissions.error) throw toApiError(permissions.error)
      const row = rows.find((candidate) => candidate.conversation_id === conversationId)
      if (!row) throw notFound()

      const page = messages.data.slice(0, PAGE_SIZE).reverse()
      const links = await photoLinks(
        db,
        page.flatMap((message) => (message.image_path ? [message.image_path] : [])),
      )
      const thread: ChatThread = {
        conversation: toConversation(row),
        messages: page.map((message): ChatMessage => ({
          id: message.id,
          authorId: message.author_id,
          body: message.body,
          imagePath: message.image_path,
          imageUrl: message.image_path ? (links.get(message.image_path) ?? null) : null,
          replyTo: message.reply_to,
          createdAt: message.created_at,
          editedAt: message.edited_at,
          deleted: message.deleted_at !== null,
        })),
        hasMore: messages.data.length > PAGE_SIZE,
        canPost: permissions.data.includes('create_posts'),
        canModerate: row.kind === 'household' && permissions.data.includes('moderate_content'),
      }
      return c.json(thread)
    },
  )

  .post(
    '/:conversationId/messages',
    conversationParam,
    zValidator('json', messageInputSchema, validationHook),
    async (c) => {
      const { id, conversationId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          household_id: id,
          body: input.body,
          image_path: input.imagePath ?? null,
          reply_to: input.replyTo ?? null,
        })
        .select('id')
        .single()
      if (error) throw rpcError(error)
      return c.json({ id: data.id }, 201)
    },
  )

  .patch(
    '/:conversationId/messages/:messageId',
    messageParam,
    zValidator('json', editMessageInputSchema, validationHook),
    async (c) => {
      const { id, conversationId, messageId } = c.req.valid('param')
      const { body } = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('messages')
        .update({ body })
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .eq('household_id', id)
        .eq('author_id', c.var.auth.userId)
        .is('deleted_at', null)
        .select('id')
      if (error) throw rpcError(error)
      if (data.length === 0) throw notFound()
      return c.json(ok)
    },
  )

  // Deletes a message for everyone: a "deleted" line stays, the text and
  // photo go. Your own photo is removed from storage too; a moderator's
  // delete hides it (storage only shows photos a message still uses).
  .delete('/:conversationId/messages/:messageId', messageParam, async (c) => {
    const { id, conversationId, messageId } = c.req.valid('param')
    const db = c.var.supabase
    const before = await db
      .from('messages')
      .select('author_id, image_path')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('household_id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (before.error) throw toApiError(before.error)
    if (!before.data) throw notFound()

    const { data, error } = await db
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .is('deleted_at', null)
      .select('id')
    if (error) throw rpcError(error)
    if (data.length === 0) throw notFound()

    const photo = before.data.image_path
    if (photo && before.data.author_id === c.var.auth.userId) {
      // Best effort: the message is already gone, and the photo with it.
      await db.storage.from(PHOTO_BUCKET).remove([photo])
    }
    return c.json(ok)
  })

  .post('/:conversationId/read', conversationParam, async (c) => {
    const { conversationId } = c.req.valid('param')
    const { error } = await c.var.supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    })
    if (error) throw error.code === '42501' ? notFound() : toApiError(error)
    return c.json(ok)
  })

  .put(
    '/:conversationId/mute',
    conversationParam,
    zValidator('json', muteInputSchema, validationHook),
    async (c) => {
      const { conversationId } = c.req.valid('param')
      const { muted } = c.req.valid('json')
      const { error } = await c.var.supabase.rpc('mute_conversation', {
        p_conversation_id: conversationId,
        p_muted: muted,
      })
      if (error) throw error.code === '42501' ? notFound() : toApiError(error)
      return c.json(ok)
    },
  )

  // Renames a group (anyone in it who can post).
  .patch(
    '/:conversationId',
    conversationParam,
    zValidator('json', renameGroupInputSchema, validationHook),
    async (c) => {
      const { id, conversationId } = c.req.valid('param')
      const { title } = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('conversations')
        .update({ title })
        .eq('id', conversationId)
        .eq('household_id', id)
        .eq('kind', 'group')
        .select('id')
      if (error) throw toApiError(error)
      if (data.length === 0) throw notFound()
      return c.json(ok)
    },
  )

  // Leaves a group.
  .delete('/:conversationId/membership', conversationParam, async (c) => {
    const { id, conversationId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('household_id', id)
      .eq('profile_id', c.var.auth.userId)
      .select('profile_id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json(ok)
  })
