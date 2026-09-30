import {
  ApiError,
  createListInputSchema,
  createListItemInputSchema,
  reorderListItemsInputSchema,
  updateListInputSchema,
  updateListItemInputSchema,
  type ListDetail,
  type ListItem,
  type ListSummary,
  type ListVisibility,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/households/:id/lists. Every query runs as the user, so RLS
// decides which lists and items exist for them.

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const listParam = zValidator('param', z.object({ id: z.uuid(), listId: z.uuid() }), validationHook)
const itemParam = zValidator(
  'param',
  z.object({ id: z.uuid(), listId: z.uuid(), itemId: z.uuid() }),
  validationHook,
)

const ITEM_FIELDS =
  'id, text, quantity, note, assigned_to, due_on, done_at, done_by, position, created_by'

interface ItemRow {
  id: string
  text: string
  quantity: string | null
  note: string | null
  assigned_to: string | null
  due_on: string | null
  done_at: string | null
  done_by: string | null
  position: number
  created_by: string | null
}

const toItem = (row: ItemRow): ListItem => ({
  id: row.id,
  text: row.text,
  quantity: row.quantity,
  note: row.note,
  assignedTo: row.assigned_to,
  dueOn: row.due_on,
  doneAt: row.done_at,
  doneBy: row.done_by,
  position: row.position,
  createdBy: row.created_by,
})

export const listRoutes = new Hono<AppEnv>()
  .get(
    '/',
    householdParam,
    zValidator(
      'query',
      z.object({ archived: z.enum(['true', 'false']).optional() }),
      validationHook,
    ),
    async (c) => {
      const { id } = c.req.valid('param')
      const archived = c.req.valid('query').archived === 'true'
      let query = c.var.supabase
        .from('lists')
        .select(
          'id, title, kind, visibility, created_by, archived_at, updated_at, items:list_items(count), done:list_items(count)',
        )
        .eq('household_id', id)
        .not('done.done_at', 'is', null)
        .order('updated_at', { ascending: false })
      query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
      const { data, error } = await query
      if (error) throw toApiError(error)

      const lists: ListSummary[] = data.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        visibility: row.visibility as ListVisibility,
        createdBy: row.created_by,
        archived: row.archived_at !== null,
        itemCount: row.items[0]?.count ?? 0,
        doneCount: row.done[0]?.count ?? 0,
        updatedAt: row.updated_at,
      }))
      return c.json({ lists })
    },
  )

  .post(
    '/',
    householdParam,
    zValidator('json', createListInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('lists')
        .insert({
          household_id: id,
          title: input.title,
          kind: input.kind,
          visibility: input.visibility,
        })
        .select('id')
        .single()
      if (error) throw toApiError(error)

      if (input.visibility === 'selected_members') {
        const { error: membersError } = await c.var.supabase.rpc('set_list_members', {
          p_list_id: data.id,
          p_profile_ids: input.memberIds,
        })
        if (membersError) {
          // Don't leave a half-shared list behind.
          await c.var.supabase.from('lists').delete().eq('id', data.id)
          throw toApiError(membersError)
        }
      }
      return c.json({ list: { id: data.id } }, 201)
    },
  )

  .get('/:listId', listParam, async (c) => {
    const { id, listId } = c.req.valid('param')
    const [list, permissions] = await Promise.all([
      c.var.supabase
        .from('lists')
        .select(
          `id, title, kind, visibility, created_by, archived_at, updated_at,
           members:list_members(profile_id), items:list_items(${ITEM_FIELDS})`,
        )
        .eq('household_id', id)
        .eq('id', listId)
        .order('position', { referencedTable: 'items', ascending: true })
        .maybeSingle(),
      c.var.supabase.rpc('my_household_permissions', { p_household_id: id }),
    ])
    if (list.error) throw toApiError(list.error)
    if (permissions.error) throw toApiError(permissions.error)
    if (!list.data) throw new ApiError('NOT_FOUND')

    const row = list.data
    const me = c.var.auth.userId
    const archived = row.archived_at !== null
    const items = row.items.map(toItem).sort((a, b) => a.position - b.position)
    const detail: ListDetail = {
      id: row.id,
      title: row.title,
      kind: row.kind,
      visibility: row.visibility as ListVisibility,
      createdBy: row.created_by,
      archived,
      itemCount: items.length,
      doneCount: items.filter((item) => item.doneAt !== null).length,
      updatedAt: row.updated_at,
      memberIds: row.members.map((m) => m.profile_id),
      items,
      canEditItems: !archived && permissions.data.includes('create_posts'),
      canManage:
        row.created_by === me ||
        (row.visibility === 'household' && permissions.data.includes('moderate_content')),
      canChangeAudience: row.created_by === me,
    }
    return c.json({ list: detail })
  })

  .patch(
    '/:listId',
    listParam,
    zValidator('json', updateListInputSchema, validationHook),
    async (c) => {
      const { id, listId } = c.req.valid('param')
      const input = c.req.valid('json')
      const changes = {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.visibility !== undefined && { visibility: input.visibility }),
        ...(input.archived !== undefined && {
          archived_at: input.archived ? new Date().toISOString() : null,
        }),
      }
      if (Object.keys(changes).length > 0) {
        const { data, error } = await c.var.supabase
          .from('lists')
          .update(changes)
          .eq('household_id', id)
          .eq('id', listId)
          .select('id')
          .maybeSingle()
        if (error) throw toApiError(error)
        if (!data) throw new ApiError('FORBIDDEN')
      }
      if (input.memberIds !== undefined) {
        const { error } = await c.var.supabase.rpc('set_list_members', {
          p_list_id: listId,
          p_profile_ids: input.memberIds,
        })
        if (error) throw toApiError(error)
      }
      return c.json({ ok: true as const })
    },
  )

  .delete('/:listId', listParam, async (c) => {
    const { id, listId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('lists')
      .delete()
      .eq('household_id', id)
      .eq('id', listId)
      .select('id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN')
    return c.json({ ok: true as const })
  })

  // ── Items ────────────────────────────────────────────────────────────────

  .post(
    '/:listId/items',
    listParam,
    zValidator('json', createListItemInputSchema, validationHook),
    async (c) => {
      const { id, listId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('list_items')
        .insert({
          list_id: listId,
          // Both are set by the database; sent only because the types require them.
          household_id: id,
          position: 0,
          text: input.text,
          quantity: input.quantity ?? null,
          note: input.note ?? null,
          assigned_to: input.assignedTo ?? null,
          due_on: input.dueOn ?? null,
        })
        .select(ITEM_FIELDS)
        .single()
      if (error) throw toApiError(error)
      return c.json({ item: toItem(data) }, 201)
    },
  )

  .patch(
    '/:listId/items/:itemId',
    itemParam,
    zValidator('json', updateListItemInputSchema, validationHook),
    async (c) => {
      const { listId, itemId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('list_items')
        .update({
          ...(input.text !== undefined && { text: input.text }),
          ...(input.quantity !== undefined && { quantity: input.quantity }),
          ...(input.note !== undefined && { note: input.note }),
          ...(input.assignedTo !== undefined && { assigned_to: input.assignedTo }),
          ...(input.dueOn !== undefined && { due_on: input.dueOn }),
          // The database records the real time and who did it.
          ...(input.done !== undefined && {
            done_at: input.done ? new Date().toISOString() : null,
          }),
        })
        .eq('list_id', listId)
        .eq('id', itemId)
        .select(ITEM_FIELDS)
        .maybeSingle()
      if (error) throw toApiError(error)
      if (!data) throw new ApiError('FORBIDDEN')
      return c.json({ item: toItem(data) })
    },
  )

  .delete('/:listId/items/:itemId', itemParam, async (c) => {
    const { listId, itemId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('list_items')
      .delete()
      .eq('list_id', listId)
      .eq('id', itemId)
      .select('id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN')
    return c.json({ ok: true as const })
  })

  .post('/:listId/items/clear-done', listParam, async (c) => {
    const { listId } = c.req.valid('param')
    const { error } = await c.var.supabase
      .from('list_items')
      .delete()
      .eq('list_id', listId)
      .not('done_at', 'is', null)
    if (error) throw toApiError(error)
    return c.json({ ok: true as const })
  })

  .put(
    '/:listId/items/order',
    listParam,
    zValidator('json', reorderListItemsInputSchema, validationHook),
    async (c) => {
      const { listId } = c.req.valid('param')
      const { error } = await c.var.supabase.rpc('reorder_list_items', {
        p_list_id: listId,
        p_item_ids: c.req.valid('json').itemIds,
      })
      if (error) throw toApiError(error)
      return c.json({ ok: true as const })
    },
  )
