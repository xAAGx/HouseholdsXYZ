import {
  DOCUMENT_FILE_TYPES,
  LIST_VISIBILITY_LABELS,
  localDate,
  type DocumentInput,
  type HouseholdMember,
  type VaultDocument,
} from '@households/shared'
import { useRef, useState } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ConfirmButton,
  ErrorText,
  Grid,
  Muted,
  Page,
  PageTitle,
  Row,
  Stack,
  StatusText,
  Text,
  TextField,
} from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { DocumentForm } from '../features/documents/DocumentForm'
import {
  useVault,
  useVaultActions,
  vaultErrorMessage,
  type VaultActions,
} from '../features/documents/queries'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import type { MemberView } from '../features/households/member-view'
import { daysBetween } from '../features/money/money-format'
import { apiErrorMessage } from '../lib/api-errors'
import { formatFullDay } from '../lib/format'

/** Expiring within this many days shows under "Coming up". */
const SOON_DAYS = 90

/**
 * /…/documents: the household's document vault. Passports, policies and
 * certificates with their numbers, files and expiry dates; reminders before
 * they run out. Private storage, links that last a minute.
 */
export function DocumentsPage() {
  return (
    <MemberGate subPath="/documents">
      {(view, basePath) => <Documents view={view} basePath={basePath} />}
    </MemberGate>
  )
}

function Documents({ view, basePath }: { view: MemberView; basePath: string }) {
  const { session } = useAuth()
  const me = session?.user.id ?? ''
  const vault = useVault(view.household.id)
  const actions = useVaultActions(view.household.id)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const today = localDate()

  const query = search.trim().toLowerCase()
  const documents = (vault.data?.documents ?? []).filter(
    (document) =>
      !query ||
      [document.title, document.category, document.reference ?? '', document.notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query),
  )
  const categories = [...new Set(documents.map((document) => document.category))].sort()
  const soon = (vault.data?.documents ?? [])
    .filter((document) => document.expiresOn && daysBetween(today, document.expiresOn) <= SOON_DAYS)
    .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''))

  async function create(input: DocumentInput, files: File[]) {
    const { id } = await actions.create.mutateAsync(input)
    setAdding(false)
    for (const file of files) {
      try {
        await actions.addFile.mutateAsync({ documentId: id, file })
      } catch (error) {
        setUploadError(`${file.name}: ${vaultErrorMessage(error)}`)
      }
    }
  }

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page>
        <Stack $gap={6}>
          <Row $justify="between">
            <Stack $gap={1}>
              <PageTitle>Documents</PageTitle>
              <Muted>{view.household.name}</Muted>
            </Stack>
            {vault.data?.canAdd && !adding && (
              <Button type="button" onClick={() => setAdding(true)}>
                Add a document
              </Button>
            )}
          </Row>

          {vault.isPending && <Muted>Loading…</Muted>}
          {vault.isError && <Text>We couldn’t open the vault. {apiErrorMessage(vault.error)}</Text>}
          {uploadError && <ErrorText role="alert">{uploadError}</ErrorText>}

          {adding && (
            <Card $padding="lg">
              <Stack $gap={4}>
                <CardTitle as="h2">New document</CardTitle>
                <DocumentForm
                  document={null}
                  members={view.members}
                  me={me}
                  busy={actions.create.isPending || actions.addFile.isPending}
                  error={actions.create.error}
                  onSave={create}
                  onCancel={() => {
                    actions.create.reset()
                    setAdding(false)
                  }}
                />
              </Stack>
            </Card>
          )}

          {vault.data && (
            <TopAligned $gap={5}>
              <Stack $gap={5}>
                {vault.data.documents.length > 6 && (
                  <TextField
                    label="Find a document"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                )}
                {vault.data.documents.length === 0 ? (
                  <Card $variant="plain" $padding="lg">
                    <Muted>
                      {vault.data.canAdd
                        ? 'Nothing here yet. Add passports, insurance policies, school letters or the boiler warranty, and get a reminder before anything expires.'
                        : 'Nothing has been shared with you yet.'}
                    </Muted>
                  </Card>
                ) : documents.length === 0 ? (
                  <Muted>No documents match “{search}”.</Muted>
                ) : (
                  categories.map((category) => (
                    <Card key={category} $variant="plain" $padding="lg">
                      <Stack $gap={3}>
                        <CardTitle as="h2">{category}</CardTitle>
                        <List>
                          {documents
                            .filter((document) => document.category === category)
                            .map((document) => (
                              <DocumentItem
                                key={document.id}
                                document={document}
                                members={view.members}
                                me={me}
                                today={today}
                                actions={actions}
                              />
                            ))}
                        </List>
                      </Stack>
                    </Card>
                  ))
                )}
              </Stack>

              <Stack $gap={5}>
                <Card $variant="soft" $tone="grape" $padding="lg">
                  <Stack $gap={3}>
                    <CardTitle as="h2">Coming up</CardTitle>
                    {soon.length === 0 ? (
                      <Muted>Nothing expires in the next three months.</Muted>
                    ) : (
                      <SoonList>
                        {soon.map((document) => (
                          <li key={document.id}>
                            <Row $justify="between">
                              <Text>{document.title}</Text>
                              <ExpiryStatus today={today} expiresOn={document.expiresOn!} />
                            </Row>
                          </li>
                        ))}
                      </SoonList>
                    )}
                  </Stack>
                </Card>
                <Muted>
                  Files are stored privately. Opening one makes a link that works for one minute,
                  only for people who can see the document.
                </Muted>
              </Stack>
            </TopAligned>
          )}
        </Stack>
      </Page>
    </>
  )
}

function ExpiryStatus({ today, expiresOn }: { today: string; expiresOn: string }) {
  const days = daysBetween(today, expiresOn)
  if (days < 0) return <StatusText $status="danger">Expired {formatFullDay(expiresOn)}</StatusText>
  if (days === 0) return <StatusText $status="danger">Expires today</StatusText>
  if (days <= SOON_DAYS) {
    return (
      <StatusText $status="warning">
        Expires in {days} {days === 1 ? 'day' : 'days'}
      </StatusText>
    )
  }
  return <Muted as="span">Expires {formatFullDay(expiresOn)}</Muted>
}

function DocumentItem({
  document,
  members,
  me,
  today,
  actions,
}: {
  document: VaultDocument
  members: HouseholdMember[]
  me: string
  today: string
  actions: VaultActions
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const names = document.people
    .map((id) => members.find((member) => member.profileId === id)?.displayName)
    .filter(Boolean)
  const busyFile =
    actions.addFile.isPending && actions.addFile.variables?.documentId === document.id

  async function openFile(fileId: string, download: boolean) {
    setProblem(null)
    // Open the tab now (popup blockers allow it on a click), then send it on.
    const tab = download ? null : window.open('', '_blank')
    if (tab) tab.opener = null
    try {
      const { url } = await actions.link.mutateAsync({
        documentId: document.id,
        fileId,
        download,
      })
      if (tab) tab.location.href = url
      else window.location.assign(url)
    } catch (error) {
      tab?.close()
      setProblem(vaultErrorMessage(error))
    }
  }

  if (editing) {
    return (
      <li>
        <DocumentForm
          document={document}
          members={members}
          me={me}
          busy={actions.update.isPending}
          error={actions.update.error}
          onSave={async (json) => {
            await actions.update.mutateAsync({ documentId: document.id, json })
            setEditing(false)
          }}
          onCancel={() => {
            actions.update.reset()
            setEditing(false)
          }}
        />
      </li>
    )
  }

  return (
    <li>
      <Stack $gap={3}>
        <Line>
          <Stack $gap={1}>
            <Title>{document.title}</Title>
            <Muted as="span">
              {[
                names.length > 0 && names.join(', '),
                document.files.length > 0 &&
                  `${document.files.length} ${document.files.length === 1 ? 'file' : 'files'}`,
                document.visibility !== 'household' && LIST_VISIBILITY_LABELS[document.visibility],
              ]
                .filter(Boolean)
                .join(' · ') || 'No files yet'}
            </Muted>
            {document.expiresOn && <ExpiryStatus today={today} expiresOn={document.expiresOn} />}
          </Stack>
          <Button
            type="button"
            $variant="ghost"
            $size="sm"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Hide' : 'Open'}
          </Button>
        </Line>

        {open && (
          <Details>
            {document.reference && (
              <Text>
                Number: <b>{document.reference}</b>
              </Text>
            )}
            {document.notes && <Text>{document.notes}</Text>}
            {document.files.length > 0 && (
              <Files>
                {document.files.map((file) => (
                  <li key={file.id}>
                    <Line>
                      <Muted as="span">
                        {file.fileName} · {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                      </Muted>
                      <Row $gap={1}>
                        <Button
                          type="button"
                          $variant="ghost"
                          $size="sm"
                          disabled={actions.link.isPending}
                          onClick={() => void openFile(file.id, false)}
                        >
                          View
                        </Button>
                        <Button
                          type="button"
                          $variant="ghost"
                          $size="sm"
                          disabled={actions.link.isPending}
                          onClick={() => void openFile(file.id, true)}
                        >
                          Download
                        </Button>
                        {document.canEdit && (
                          <ConfirmButton
                            message={`Remove ${file.fileName}? It’s deleted for good.`}
                            confirmLabel="Yes, remove it"
                            busy={actions.removeFile.isPending}
                            onConfirm={() =>
                              actions.removeFile.mutate({
                                documentId: document.id,
                                fileId: file.id,
                              })
                            }
                          >
                            Remove
                          </ConfirmButton>
                        )}
                      </Row>
                    </Line>
                  </li>
                ))}
              </Files>
            )}
            {problem && <ErrorText role="alert">{problem}</ErrorText>}
            {actions.addFile.isError && actions.addFile.variables?.documentId === document.id && (
              <ErrorText role="alert">{vaultErrorMessage(actions.addFile.error)}</ErrorText>
            )}
            {document.canEdit && (
              <Row $gap={2}>
                <input
                  ref={fileInput}
                  type="file"
                  accept={DOCUMENT_FILE_TYPES.join(',')}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) actions.addFile.mutate({ documentId: document.id, file })
                  }}
                />
                <Button
                  type="button"
                  $variant="secondary"
                  $size="sm"
                  disabled={busyFile || document.files.length >= 20}
                  onClick={() => fileInput.current?.click()}
                >
                  {busyFile ? 'Uploading…' : 'Add a file'}
                </Button>
                <Button type="button" $variant="ghost" $size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <ConfirmButton
                  message={`Delete “${document.title}” and its files? This can’t be undone.`}
                  confirmLabel="Yes, delete it"
                  busy={actions.remove.isPending}
                  onConfirm={() => actions.remove.mutate(document.id)}
                >
                  Delete
                </ConfirmButton>
              </Row>
            )}
            {actions.remove.isError && actions.remove.variables === document.id && (
              <ErrorText role="alert">{apiErrorMessage(actions.remove.error)}</ErrorText>
            )}
          </Details>
        )}
      </Stack>
    </li>
  )
}

const TopAligned = styled(Grid)`
  align-items: start;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

const List = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`

const SoonList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
`

const Files = styled(List)`
  > li {
    padding: ${({ theme }) => theme.space[2]}px 0;
  }
`

const Details = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[4]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.surfaceMuted};
`

const Line = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
`

const Title = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`
