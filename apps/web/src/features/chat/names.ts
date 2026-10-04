import type { Conversation, HouseholdMember } from '@households/shared'

/** What a conversation is called: "Everyone", the group's name, or the other person. */
export function conversationName(
  conversation: Pick<Conversation, 'kind' | 'title' | 'memberIds'>,
  members: HouseholdMember[],
  me: string,
): string {
  if (conversation.kind === 'household') return 'Everyone'
  if (conversation.kind === 'group') return conversation.title ?? 'Group'
  const other = conversation.memberIds.find((id) => id !== me)
  return members.find((member) => member.profileId === other)?.displayName ?? 'A former member'
}

/** "Mona: See you at 5", "You: Photo", "Message deleted". */
export function lastMessageText(
  conversation: Conversation,
  members: HouseholdMember[],
  me: string,
): string {
  const last = conversation.lastMessage
  if (!last) return 'No messages yet'
  if (last.deleted) return 'Message deleted'
  const text = last.body || (last.hasImage ? 'Photo' : '')
  if (conversation.kind === 'direct' && last.authorId !== me) return text
  const author =
    last.authorId === me
      ? 'You'
      : (members.find((member) => member.profileId === last.authorId)?.displayName ?? 'Someone')
  return `${author}: ${text}`
}
