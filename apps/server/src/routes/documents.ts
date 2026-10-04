import {
  ApiError,
  documentFileInputSchema,
  documentInputSchema,
  type DocumentFile,
  type ListVisibility,
  type VaultDocument,
  type VaultView,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/households/:id/documents: the document vault. RLS decides
// who sees each document ("Only me" stays private, even from parents). Files
// sit in a private bucket; the app uploads them as the person, and opening
// one hands out a link that works for a minute.

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const documentParam = zValidator(
  'param',
  z.object({ id: z.uuid(), documentId: z.uuid() }),
  validationHook,
)
const fileParam = zValidator(
  'param',
  z.object({ id: z.uuid(), documentId: z.uuid(), fileId: z.uuid() }),
  validationHook,
)

const BUCKET = 'household-documents'
const LINK_SECONDS = 60

const DOCUMENT_FIELDS =
  'id, title, category, reference, notes, people, expires_on, remind_days, visibility, shared_with, created_by'
const FILE_FIELDS = 'id, document_id, storage_path, file_name, mime_type, size_bytes, created_at'

const linkSchema = z.strictObject({ download: z.boolean().default(false) })

const ok = { ok: true as const }
const notFound = () => new ApiError('NOT_FOUND')

function toRow(input: z.output<typeof documentInputSchema>) {
  return {
    title: input.title,
    category: input.category,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    people: input.people,
    expires_on: input.expiresOn,
    remind_days: input.remindDays,
    visibility: input.visibility,
    shared_with: input.visibility === 'selected_members' ? input.sharedWith : [],
  }
}

function guardError(error: Parameters<typeof toApiError>[0]): ApiError {
  if (error.code === '42501' && error.message.startsWith('Only the person who added it')) {
    return new ApiError(
      'FORBIDDEN',
      'Only the person who added it can change who sees it.',
      undefined,
      { cause: error },
    )
  }
  if (error.code === '22023' && error.message === 'Only members of this household can be on it.') {
    return new ApiError('VALIDATION_FAILED', error.message, undefined, { cause: error })
  }
  if (error.code === '54000' && error.message === 'A document can have up to 20 files.') {
    return new ApiError('CONFLICT', error.message, undefined, { cause: error })
  }
  return toApiError(error)
}

export const documentRoutes = new Hono<AppEnv>()
  .get('/', householdParam, async (c) => {
    const { id } = c.req.valid('param')
    const db = c.var.supabase
    const me = c.var.auth.userId
    const [membership, permissions, documents, files] = await Promise.all([
      db
        .from('household_members')
        .select('profile_id')
        .eq('household_id', id)
        .eq('profile_id', me)
        .eq('status', 'active')
        .maybeSingle(),
      db.rpc('my_household_permissions', { p_household_id: id }),
      db
        .from('documents')
        .select(DOCUMENT_FIELDS)
        .eq('household_id', id)
        .order('title', { ascending: true })
        .limit(2000),
      db
        .from('document_files')
        .select(FILE_FIELDS)
        .eq('household_id', id)
        .order('created_at', { ascending: true })
        .limit(10000),
    ])
    if (membership.error) throw toApiError(membership.error)
    if (permissions.error) throw toApiError(permissions.error)
    if (documents.error) throw toApiError(documents.error)
    if (files.error) throw toApiError(files.error)
    // Outsiders get the same answer as for a household that doesn't exist.
    if (!membership.data) throw notFound()

    const canManage = permissions.data.includes('manage_documents')
    const filesOf = new Map<string, DocumentFile[]>()
    for (const row of files.data) {
      const list = filesOf.get(row.document_id) ?? []
      list.push({
        id: row.id,
        storagePath: row.storage_path,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
      })
      filesOf.set(row.document_id, list)
    }
    const view: VaultView = {
      canAdd: permissions.data.includes('view_documents'),
      documents: documents.data.map((row): VaultDocument => ({
        id: row.id,
        title: row.title,
        category: row.category,
        reference: row.reference,
        notes: row.notes,
        people: row.people,
        expiresOn: row.expires_on,
        remindDays: row.remind_days,
        visibility: row.visibility as ListVisibility,
        sharedWith: row.shared_with,
        createdBy: row.created_by,
        canEdit: row.created_by === me || (row.visibility === 'household' && canManage),
        files: filesOf.get(row.id) ?? [],
      })),
    }
    return c.json(view)
  })

  .post('/', householdParam, zValidator('json', documentInputSchema, validationHook), async (c) => {
    const { id } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('documents')
      .insert({ household_id: id, ...toRow(c.req.valid('json')) })
      .select('id')
      .single()
    if (error) throw guardError(error)
    return c.json({ id: data.id }, 201)
  })

  .put(
    '/:documentId',
    documentParam,
    zValidator('json', documentInputSchema, validationHook),
    async (c) => {
      const { id, documentId } = c.req.valid('param')
      const { data, error } = await c.var.supabase
        .from('documents')
        .update(toRow(c.req.valid('json')))
        .eq('id', documentId)
        .eq('household_id', id)
        .select('id')
      if (error) throw guardError(error)
      if (data.length === 0) throw notFound()
      return c.json(ok)
    },
  )

  // Removes the files from storage first (only possible while the document
  // exists), then the document.
  .delete('/:documentId', documentParam, async (c) => {
    const { id, documentId } = c.req.valid('param')
    const db = c.var.supabase
    const files = await db
      .from('document_files')
      .select('storage_path')
      .eq('document_id', documentId)
      .eq('household_id', id)
    if (files.error) throw toApiError(files.error)
    if (files.data.length > 0) {
      const removed = await db.storage
        .from(BUCKET)
        .remove(files.data.map((file) => file.storage_path))
      if (removed.error)
        throw new ApiError('INTERNAL', undefined, undefined, { cause: removed.error })
    }
    const { data, error } = await db
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('household_id', id)
      .select('id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json(ok)
  })

  // Records a file the app has just uploaded to the document's folder.
  .post(
    '/:documentId/files',
    documentParam,
    zValidator('json', documentFileInputSchema, validationHook),
    async (c) => {
      const { id, documentId } = c.req.valid('param')
      const input = c.req.valid('json')
      if (!input.storagePath.startsWith(`${id}/documents/${documentId}/`)) {
        throw new ApiError('VALIDATION_FAILED', 'That file belongs somewhere else.')
      }
      const { data, error } = await c.var.supabase
        .from('document_files')
        .insert({
          document_id: documentId,
          household_id: id,
          storage_path: input.storagePath,
          file_name: input.fileName,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
        })
        .select('id')
        .single()
      if (error) throw guardError(error)
      return c.json({ id: data.id }, 201)
    },
  )

  .delete('/:documentId/files/:fileId', fileParam, async (c) => {
    const { id, documentId, fileId } = c.req.valid('param')
    const db = c.var.supabase
    const file = await db
      .from('document_files')
      .select('storage_path')
      .eq('id', fileId)
      .eq('document_id', documentId)
      .eq('household_id', id)
      .maybeSingle()
    if (file.error) throw toApiError(file.error)
    if (!file.data) throw notFound()
    // The file itself first: if that fails, it stays listed and can be retried.
    const removed = await db.storage.from(BUCKET).remove([file.data.storage_path])
    if (removed.error)
      throw new ApiError('INTERNAL', undefined, undefined, { cause: removed.error })
    const { data, error } = await db.from('document_files').delete().eq('id', fileId).select('id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json(ok)
  })

  // A link to the file that works for a minute (to view it, or download it).
  .post(
    '/:documentId/files/:fileId/link',
    fileParam,
    zValidator('json', linkSchema, validationHook),
    async (c) => {
      const { id, documentId, fileId } = c.req.valid('param')
      const { download } = c.req.valid('json')
      const db = c.var.supabase
      const file = await db
        .from('document_files')
        .select('storage_path, file_name')
        .eq('id', fileId)
        .eq('document_id', documentId)
        .eq('household_id', id)
        .maybeSingle()
      if (file.error) throw toApiError(file.error)
      if (!file.data) throw notFound()
      const { data, error } = await db.storage
        .from(BUCKET)
        .createSignedUrl(
          file.data.storage_path,
          LINK_SECONDS,
          download ? { download: file.data.file_name } : undefined,
        )
      if (error) throw notFound()
      return c.json({ url: data.signedUrl })
    },
  )
