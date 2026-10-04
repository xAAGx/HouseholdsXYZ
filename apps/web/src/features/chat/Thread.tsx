import {
  CHAT_IMAGE_TYPES,
  localDate,
  MAX_CHAT_IMAGE_BYTES,
  MAX_MESSAGE_LENGTH,
  renameGroupInputSchema,
  type ChatMessage,
  type ChatThread,
  type HouseholdMember,
} from '@households/shared'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardTitle,
  ChatBubble,
  ConfirmButton,
  ErrorText,
  Muted,
  Row,
  Stack,
  Text,
  TextArea,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay, formatTime } from '../../lib/format'
import { conversationName } from './names'
import { useChatThread, type ChatActions } from './queries'

/** One conversation: its messages, newest at the bottom, and a box to write in. */
export function Thread({
  householdId,
  conversationId,
  chatPath,
  members,
  me,
  actions,
}: {
  householdId: string
  conversationId: string
  /** Where to go after leaving a group. */
  chatPath: string
  members: HouseholdMember[]
  me: string
  actions: ChatActions
}) {
  const thread = useChatThread(householdId, conversationId)

  if (thread.isPending) return <Muted>Loading…</Muted>
  if (thread.isError) {
    return (
      <Card $variant="plain" $padding="lg">
        <Text>This conversation isn’t available. {apiErrorMessage(thread.error)}</Text>
      </Card>
    )
  }
  const pages = thread.data.pages
  const first = pages[0]!
  const messages = [...pages].reverse().flatMap((page) => page.messages)

  return (
    <ThreadView
      key={conversationId}
      head={first}
      messages={messages}
      hasMore={thread.hasNextPage}
      loadingMore={thread.isFetchingNextPage}
      onLoadMore={() => void thread.fetchNextPage()}
      chatPath={chatPath}
      members={members}
      me={me}
      actions={actions}
    />
  )
}

function ThreadView({
  head,
  messages,
  hasMore,
  loadingMore,
  onLoadMore,
  chatPath,
  members,
  me,
  actions,
}: {
  head: ChatThread
  messages: ChatMessage[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  chatPath: string
  members: HouseholdMember[]
  me: string
  actions: ChatActions
}) {
  const conversation = head.conversation
  const navigate = useNavigate()
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [options, setOptions] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  // Each refetch signs photo links afresh. Keep showing the link a photo
  // loaded with (so it doesn't reload), until that one stops working.
  const [photoLinks, setPhotoLinks] = useState<Record<string, string>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const lastId = messages.at(-1)?.id
  const name = (id: string | null) =>
    id === me
      ? 'You'
      : ((id && members.find((member) => member.profileId === id)?.displayName) ??
        'A former member')
  const byId = new Map(messages.map((message) => [message.id, message]))
  const { markRead } = actions

  // Newest at the bottom: follow new messages (not older pages loading).
  useLayoutEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [lastId])

  // Reading it marks it read (and its notification).
  useEffect(() => {
    if (conversation.unread > 0 && document.visibilityState === 'visible') {
      markRead.mutate(conversation.id)
    }
    // markRead is a stable mutation object; re-run only when there's news.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.unread, lastId])

  const photo = (message: ChatMessage) =>
    message.imagePath && message.imageUrl
      ? (photoLinks[message.imagePath] ?? message.imageUrl)
      : null
  const keepPhoto = (path: string, url: string) =>
    setPhotoLinks((links) => (links[path] ? links : { ...links, [path]: url }))
  const dropPhoto = (path: string) =>
    setPhotoLinks((links) => {
      if (!links[path]) return links
      const next = { ...links }
      delete next[path]
      return next
    })

  const people =
    conversation.kind === 'household'
      ? 'Everyone in the household'
      : conversation.memberIds.map(name).join(', ')

  return (
    <Card $variant="plain" $padding="sm">
      <Stack $gap={3}>
        <Header>
          <Stack $gap={1}>
            <CardTitle as="h2">{conversationName(conversation, members, me)}</CardTitle>
            <Muted>{people}</Muted>
          </Stack>
          <Row $gap={1}>
            <Button
              type="button"
              $variant="ghost"
              $size="sm"
              aria-pressed={conversation.muted}
              disabled={actions.mute.isPending}
              onClick={() =>
                actions.mute.mutate({ conversationId: conversation.id, muted: !conversation.muted })
              }
            >
              {conversation.muted ? 'Unmute' : 'Mute'}
            </Button>
            {conversation.kind === 'group' && head.canPost && !renaming && (
              <Button type="button" $variant="ghost" $size="sm" onClick={() => setRenaming(true)}>
                Rename
              </Button>
            )}
            {conversation.kind === 'group' && (
              <ConfirmButton
                message="Leave this group? You won’t see its messages any more."
                confirmLabel="Yes, leave"
                busy={actions.leave.isPending}
                onConfirm={() =>
                  actions.leave.mutate(conversation.id, {
                    onSuccess: () => void navigate(chatPath),
                  })
                }
              >
                Leave
              </ConfirmButton>
            )}
          </Row>
        </Header>
        {renaming && (
          <RenameForm
            conversationId={conversation.id}
            title={conversation.title ?? ''}
            actions={actions}
            onDone={() => setRenaming(false)}
          />
        )}

        <Messages ref={scroller} aria-label="Messages" tabIndex={0}>
          {hasMore && (
            <Row $justify="end">
              <Button
                type="button"
                $variant="ghost"
                $size="sm"
                disabled={loadingMore}
                onClick={onLoadMore}
              >
                {loadingMore ? 'Loading…' : 'Show earlier messages'}
              </Button>
            </Row>
          )}
          {messages.length === 0 && <Muted>No messages yet. Say hello.</Muted>}
          {messages.map((message, i) => {
            const day = localDate(new Date(message.createdAt))
            const previous = messages[i - 1]
            const newDay = !previous || localDate(new Date(previous.createdAt)) !== day
            const mine = message.authorId === me
            const quoted = message.replyTo ? byId.get(message.replyTo) : undefined
            const canDelete =
              !message.deleted && (mine || (head.canModerate && conversation.kind === 'household'))
            const url = photo(message)
            return (
              <Stack key={message.id} $gap={2}>
                {newDay && <DayLine>{formatDay(day)}</DayLine>}
                <ChatBubble
                  mine={mine}
                  author={
                    !mine && conversation.kind !== 'direct' ? name(message.authorId) : undefined
                  }
                  quote={
                    quoted
                      ? `${name(quoted.authorId)}: ${quoted.deleted ? 'Message deleted' : quoted.body || 'Photo'}`
                      : undefined
                  }
                  footer={
                    <>
                      <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                      {message.editedAt && !message.deleted && <span>edited</span>}
                      {!message.deleted && (
                        <Button
                          type="button"
                          $variant="ghost"
                          $size="sm"
                          aria-expanded={options === message.id}
                          aria-label="Message options"
                          onClick={() => setOptions(options === message.id ? null : message.id)}
                        >
                          …
                        </Button>
                      )}
                    </>
                  }
                >
                  {message.deleted ? (
                    <Muted as="span">Message deleted</Muted>
                  ) : editing === message.id ? (
                    <EditForm
                      message={message}
                      conversationId={conversation.id}
                      actions={actions}
                      onDone={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      {message.imagePath &&
                        (url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={url}
                              alt="Photo"
                              loading="lazy"
                              onLoad={() => keepPhoto(message.imagePath!, url)}
                              onError={() => dropPhoto(message.imagePath!)}
                            />
                          </a>
                        ) : (
                          <Muted as="span">Photo unavailable</Muted>
                        ))}
                      {message.body && <span>{message.body}</span>}
                    </>
                  )}
                </ChatBubble>
                {options === message.id && (
                  <Row $gap={1} $justify={mine ? 'end' : 'start'}>
                    {head.canPost && (
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        onClick={() => {
                          setReplyTo(message)
                          setOptions(null)
                        }}
                      >
                        Reply
                      </Button>
                    )}
                    {mine && message.body && (
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        onClick={() => {
                          setEditing(message.id)
                          setOptions(null)
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <ConfirmButton
                        message="Delete this message for everyone?"
                        confirmLabel="Yes, delete it"
                        busy={actions.remove.isPending}
                        onConfirm={() =>
                          actions.remove.mutate(
                            { conversationId: conversation.id, messageId: message.id },
                            { onSuccess: () => setOptions(null) },
                          )
                        }
                      >
                        Delete
                      </ConfirmButton>
                    )}
                  </Row>
                )}
              </Stack>
            )
          })}
        </Messages>

        {actions.remove.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.remove.error)}</ErrorText>
        )}
        {head.canPost ? (
          <Composer
            conversationId={conversation.id}
            replyTo={replyTo}
            replyName={replyTo ? name(replyTo.authorId) : ''}
            onClearReply={() => setReplyTo(null)}
            actions={actions}
          />
        ) : (
          <Muted>You can read this conversation but not write in it.</Muted>
        )}
      </Stack>
    </Card>
  )
}

function Composer({
  conversationId,
  replyTo,
  replyName,
  onClearReply,
  actions,
}: {
  conversationId: string
  replyTo: ChatMessage | null
  replyName: string
  onClearReply: () => void
  actions: ChatActions
}) {
  const [body, setBody] = useState('')
  const [photo, setPhotoState] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const sending = actions.send.isPending

  // The preview is a local object URL: freed when replaced and on leaving.
  const setPhoto = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = file ? URL.createObjectURL(file) : null
    setPreview(previewRef.current)
    setPhotoState(file)
  }
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  function choosePhoto(file: File | undefined) {
    if (!file) return
    if (!(CHAT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setProblem('Choose a photo (JPEG, PNG, WebP, GIF or HEIC).')
      return
    }
    if (file.size > MAX_CHAT_IMAGE_BYTES * 3) {
      setProblem('That photo is too big.')
      return
    }
    setProblem(null)
    setPhoto(file)
  }

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const text = body.trim()
    if (!text && !photo) return
    if (text.length > MAX_MESSAGE_LENGTH) {
      setProblem('That message is too long.')
      return
    }
    setProblem(null)
    try {
      await actions.send.mutateAsync({
        conversationId,
        input: { body: text, replyTo: replyTo?.id ?? null },
        photo,
      })
      setBody('')
      setPhoto(null)
      onClearReply()
    } catch (error) {
      setProblem(error instanceof Error && !('code' in error) ? error.message : null)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter starts a new line (not while typing in an IME).
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  return (
    <form onSubmit={(e) => void send(e)} noValidate>
      <Stack $gap={2}>
        {replyTo && (
          <Row $justify="between">
            <Muted as="span">
              Replying to {replyName}: {replyTo.body ? replyTo.body.slice(0, 80) : 'Photo'}
            </Muted>
            <Button type="button" $variant="ghost" $size="sm" onClick={onClearReply}>
              Cancel reply
            </Button>
          </Row>
        )}
        {preview && (
          <Row $gap={2}>
            <Thumb src={preview} alt="Photo to send" />
            <Button type="button" $variant="ghost" $size="sm" onClick={() => setPhoto(null)}>
              Remove photo
            </Button>
          </Row>
        )}
        <TextArea
          label="Message"
          rows={2}
          value={body}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <input
          ref={fileInput}
          type="file"
          accept={CHAT_IMAGE_TYPES.join(',')}
          hidden
          onChange={(e) => {
            choosePhoto(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {problem && <ErrorText role="alert">{problem}</ErrorText>}
        {actions.send.isError && !problem && (
          <ErrorText role="alert">{apiErrorMessage(actions.send.error)}</ErrorText>
        )}
        <Row $justify="between">
          <Button
            type="button"
            $variant="ghost"
            $size="sm"
            onClick={() => fileInput.current?.click()}
          >
            Add photo
          </Button>
          <Button type="submit" $size="sm" disabled={sending || (!body.trim() && !photo)}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

function EditForm({
  message,
  conversationId,
  actions,
  onDone,
}: {
  message: ChatMessage
  conversationId: string
  actions: ChatActions
  onDone: () => void
}) {
  const [body, setBody] = useState(message.body)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    try {
      await actions.edit.mutateAsync({ conversationId, messageId: message.id, body })
      onDone()
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={2}>
        <TextArea
          label="Edit message"
          rows={2}
          value={body}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setBody(e.target.value)}
        />
        {actions.edit.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.edit.error)}</ErrorText>
        )}
        <Row $gap={1}>
          <Button type="submit" $size="sm" disabled={actions.edit.isPending || !body.trim()}>
            Save
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

function RenameForm({
  conversationId,
  title,
  actions,
  onDone,
}: {
  conversationId: string
  title: string
  actions: ChatActions
  onDone: () => void
}) {
  const [value, setValue] = useState(title)
  const [problem, setProblem] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = renameGroupInputSchema.safeParse({ title: value })
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Give the group a name.')
      return
    }
    setProblem(null)
    try {
      await actions.rename.mutateAsync({ conversationId, title: parsed.data.title })
      onDone()
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={2}>
        <TextField
          label="Group name"
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          error={problem ?? undefined}
        />
        {actions.rename.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.rename.error)}</ErrorText>
        )}
        <Row $gap={1}>
          <Button type="submit" $size="sm" disabled={actions.rename.isPending}>
            Save name
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => theme.space[2]}px;
`

const Messages = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  height: min(60vh, 640px);
  overflow-y: auto;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.background};
  overscroll-behavior: contain;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.focusRing};
    outline-offset: 2px;
  }
`

const DayLine = styled.p`
  align-self: center;
  font-size: ${({ theme }) => theme.fontSizes.xs}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textMuted};
`

const Thumb = styled.img`
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: ${({ theme }) => theme.radii.md}px;
`
