import { unwrap } from '@households/api-client'
import { storageFileName, type ChatThread, type MessageInput } from '@households/shared'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'

import { api } from '../../lib/api'
import { cleanImage } from '../../lib/images'
import { supabase } from '../../lib/supabase'
import { liveInterval } from '../live/live-status'
import { notificationKeys } from '../notifications/queries'

export const chatKeys = {
  all: (householdId: string) => ['chat', householdId] as const,
  inbox: (householdId: string) => [...chatKeys.all(householdId), 'inbox'] as const,
  thread: (householdId: string, conversationId: string) =>
    [...chatKeys.all(householdId), 'thread', conversationId] as const,
}

/** Longest side of a chat photo after it's cleaned. */
const PHOTO_SIDE = 2048

export function useChatInbox(householdId: string) {
  return useQuery({
    queryKey: chatKeys.inbox(householdId),
    queryFn: () => unwrap(api.v1.households[':id'].chat.$get({ param: { id: householdId } })),
    refetchInterval: liveInterval(20_000),
  })
}

/**
 * One conversation, newest page first; older pages load on request. Photo
 * links last an hour, so the thread refreshes well before they run out.
 */
export function useChatThread(householdId: string, conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: chatKeys.thread(householdId, conversationId ?? ''),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.v1.households[':id'].chat[':conversationId'].$get({
          param: { id: householdId, conversationId: conversationId ?? '' },
          query: pageParam ? { before: pageParam } : {},
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page: ChatThread) =>
      page.hasMore ? (page.messages[0]?.createdAt ?? null) : null,
    enabled: conversationId !== null,
    refetchInterval: liveInterval(15_000),
  })
}

export type ThreadData = InfiniteData<ChatThread, string | null>

export function useChatActions(householdId: string) {
  const queryClient = useQueryClient()
  const chat = api.v1.households[':id'].chat
  const param = { id: householdId }
  const settle = () => queryClient.invalidateQueries({ queryKey: chatKeys.all(householdId) })

  return {
    send: useMutation({
      mutationFn: async ({
        conversationId,
        input,
        photo,
      }: {
        conversationId: string
        input: Omit<MessageInput, 'imagePath'>
        photo: File | null
      }) => {
        let imagePath: string | null = null
        if (photo) {
          const clean = await cleanImage(photo, PHOTO_SIDE)
          imagePath = `${householdId}/chat/${conversationId}/${storageFileName(crypto.randomUUID(), clean.name)}`
          const upload = await supabase.storage
            .from('household-media')
            .upload(imagePath, clean, { contentType: clean.type, upsert: false })
          if (upload.error) throw new Error('The photo didn’t upload. Please try again.')
        }
        try {
          return await unwrap(
            chat[':conversationId'].messages.$post({
              param: { ...param, conversationId },
              json: { ...input, imagePath },
            }),
          )
        } catch (error) {
          if (imagePath) await supabase.storage.from('household-media').remove([imagePath])
          throw error
        }
      },
      onSettled: settle,
    }),
    edit: useMutation({
      mutationFn: ({
        conversationId,
        messageId,
        body,
      }: {
        conversationId: string
        messageId: string
        body: string
      }) =>
        unwrap(
          chat[':conversationId'].messages[':messageId'].$patch({
            param: { ...param, conversationId, messageId },
            json: { body },
          }),
        ),
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
        unwrap(
          chat[':conversationId'].messages[':messageId'].$delete({
            param: { ...param, conversationId, messageId },
          }),
        ),
      onSettled: settle,
    }),
    markRead: useMutation({
      mutationFn: (conversationId: string) =>
        unwrap(chat[':conversationId'].read.$post({ param: { ...param, conversationId } })),
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: chatKeys.inbox(householdId) }),
          queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
        ]),
    }),
    mute: useMutation({
      mutationFn: ({ conversationId, muted }: { conversationId: string; muted: boolean }) =>
        unwrap(
          chat[':conversationId'].mute.$put({
            param: { ...param, conversationId },
            json: { muted },
          }),
        ),
      onSettled: settle,
    }),
    startGroup: useMutation({
      mutationFn: (json: { title: string; memberIds: string[] }) =>
        unwrap(chat.groups.$post({ param, json })),
      onSettled: settle,
    }),
    direct: useMutation({
      mutationFn: (profileId: string) => unwrap(chat.direct.$post({ param, json: { profileId } })),
      onSettled: settle,
    }),
    rename: useMutation({
      mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) =>
        unwrap(
          chat[':conversationId'].$patch({ param: { ...param, conversationId }, json: { title } }),
        ),
      onSettled: settle,
    }),
    leave: useMutation({
      mutationFn: (conversationId: string) =>
        unwrap(chat[':conversationId'].membership.$delete({ param: { ...param, conversationId } })),
      onSettled: settle,
    }),
  }
}

export type ChatActions = ReturnType<typeof useChatActions>
