import { unwrap } from '@households/api-client'
import {
  DOCUMENT_FILE_TYPES,
  MAX_DOCUMENT_FILE_BYTES,
  storageFileName,
  type DocumentFileType,
  type DocumentInput,
} from '@households/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { apiErrorMessage } from '../../lib/api-errors'
import { cleanImage, UnreadableImageError } from '../../lib/images'
import { supabase } from '../../lib/supabase'
import { liveInterval } from '../live/live-status'

export const documentKeys = {
  all: (householdId: string) => ['documents', householdId] as const,
}

const BUCKET = 'household-documents'
/** Scans stay readable at this size. */
const SCAN_SIDE = 3000

export class FileProblem extends Error {}

/** A file problem in plain words, or the API's message. */
export function vaultErrorMessage(error: unknown): string {
  return error instanceof FileProblem ? error.message : apiErrorMessage(error)
}

export function useVault(householdId: string) {
  return useQuery({
    queryKey: documentKeys.all(householdId),
    queryFn: () => unwrap(api.v1.households[':id'].documents.$get({ param: { id: householdId } })),
    refetchInterval: liveInterval(60_000),
  })
}

/**
 * Photos are redrawn first to drop hidden details like location; a format
 * this browser can't redraw (HEIC outside Safari) goes up as it is, private
 * like everything in the vault.
 */
async function prepare(file: File): Promise<File> {
  if (!(DOCUMENT_FILE_TYPES as readonly string[]).includes(file.type)) {
    throw new FileProblem('Choose a PDF or a photo (JPEG, PNG, WebP or HEIC).')
  }
  let ready = file
  if (file.type.startsWith('image/')) {
    try {
      ready = await cleanImage(file, SCAN_SIDE)
    } catch (error) {
      if (!(error instanceof UnreadableImageError)) throw error
    }
  }
  if (ready.size > MAX_DOCUMENT_FILE_BYTES) {
    throw new FileProblem('That file is too big: the limit is 20 MB.')
  }
  return ready
}

export function useVaultActions(householdId: string) {
  const queryClient = useQueryClient()
  const documents = api.v1.households[':id'].documents
  const param = { id: householdId }
  const settle = () => queryClient.invalidateQueries({ queryKey: documentKeys.all(householdId) })

  return {
    create: useMutation({
      mutationFn: (json: DocumentInput) => unwrap(documents.$post({ param, json })),
      onSettled: settle,
    }),
    update: useMutation({
      mutationFn: ({ documentId, json }: { documentId: string; json: DocumentInput }) =>
        unwrap(documents[':documentId'].$put({ param: { ...param, documentId }, json })),
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (documentId: string) =>
        unwrap(documents[':documentId'].$delete({ param: { ...param, documentId } })),
      onSettled: settle,
    }),
    /** Uploads straight to private storage as you, then records the file. */
    addFile: useMutation({
      mutationFn: async ({ documentId, file }: { documentId: string; file: File }) => {
        const ready = await prepare(file)
        const storagePath = `${householdId}/documents/${documentId}/${storageFileName(crypto.randomUUID(), ready.name)}`
        const upload = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, ready, { contentType: ready.type, upsert: false })
        if (upload.error) throw new FileProblem('The file didn’t upload. Please try again.')
        try {
          return await unwrap(
            documents[':documentId'].files.$post({
              param: { ...param, documentId },
              json: {
                storagePath,
                fileName: ready.name.slice(0, 200),
                mimeType: ready.type as DocumentFileType,
                sizeBytes: ready.size,
              },
            }),
          )
        } catch (error) {
          await supabase.storage.from(BUCKET).remove([storagePath])
          throw error
        }
      },
      onSettled: settle,
    }),
    removeFile: useMutation({
      mutationFn: ({ documentId, fileId }: { documentId: string; fileId: string }) =>
        unwrap(
          documents[':documentId'].files[':fileId'].$delete({
            param: { ...param, documentId, fileId },
          }),
        ),
      onSettled: settle,
    }),
    /** A link that works for a minute. */
    link: useMutation({
      mutationFn: ({
        documentId,
        fileId,
        download,
      }: {
        documentId: string
        fileId: string
        download: boolean
      }) =>
        unwrap(
          documents[':documentId'].files[':fileId'].link.$post({
            param: { ...param, documentId, fileId },
            json: { download },
          }),
        ),
    }),
  }
}

export type VaultActions = ReturnType<typeof useVaultActions>
