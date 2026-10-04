import {
  OTHER_SECTION,
  STORE_SECTIONS,
  type ListSummary,
  type MealShoppingPreview,
  type MealShoppingResult,
  type ShoppingPreviewItem,
} from '@households/shared'
import { useState } from 'react'
import { Link } from 'react-router'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  ErrorText,
  Eyebrow,
  Muted,
  Row,
  Select,
  Stack,
  StatusText,
  Text,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import type { MealActions } from './queries'

const ORDER = [...STORE_SECTIONS, OTHER_SECTION] as string[]

/** Items under their store sections, in the order you walk a shop. */
function bySection(items: ShoppingPreviewItem[]): [string, ShoppingPreviewItem[]][] {
  const groups = new Map<string, ShoppingPreviewItem[]>()
  for (const item of items) {
    const section = item.category ?? OTHER_SECTION
    groups.set(section, [...(groups.get(section) ?? []), item])
  }
  return [...groups.entries()].sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
}

/**
 * The week's recipe ingredients onto a shopping list (AnyList, Plan to Eat):
 * first a list to check, with things already on the list and pantry staples
 * left unticked, then only the chosen ones are added.
 */
export function ShoppingCard({
  from,
  to,
  lists,
  basePath,
  plannedRecipes,
  actions,
}: {
  from: string
  to: string
  lists: ListSummary[]
  basePath: string
  /** How many planned meals this week come from a recipe. */
  plannedRecipes: number
  actions: MealActions
}) {
  const shopping = lists.filter((list) => list.kind === 'shopping')
  const [listId, setListId] = useState('')
  const [preview, setPreview] = useState<MealShoppingPreview | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<string | null>(null)
  const list = shopping.find((item) => item.id === listId) ?? shopping[0]

  function review() {
    if (!list) return
    setResult(null)
    actions.previewShopping.mutate(
      { listId: list.id, from, to },
      {
        onSuccess: (next) => {
          setPreview(next)
          setChosen(
            new Set(next.items.filter((item) => !item.onList && !item.staple).map((i) => i.text)),
          )
        },
      },
    )
  }

  function add() {
    if (!list || !preview) return
    const items = preview.items
      .filter((item) => chosen.has(item.text))
      .map((item) => ({ text: item.text, quantity: item.quantity }))
    actions.shop.mutate(
      { listId: list.id, items },
      {
        onSuccess: (outcome: MealShoppingResult) => {
          setPreview(null)
          setResult(
            outcome.added === 0
              ? `Everything is already on ${preview.listTitle}.`
              : `Added ${outcome.added} to ${preview.listTitle}.`,
          )
        },
      },
    )
  }

  const toggle = (text: string) =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(text)) next.delete(text)
      else next.add(text)
      return next
    })

  return (
    <Card $variant="soft" $tone="grass" $padding="lg">
      <Stack $gap={4}>
        <CardTitle as="h2">Shop for this week</CardTitle>
        {shopping.length === 0 ? (
          <Text>
            Start a <Link to={`${basePath}/lists`}>shopping list</Link> first, then the week’s
            ingredients can go straight onto it.
          </Text>
        ) : plannedRecipes === 0 ? (
          <Muted>Plan meals from the recipe box, and their ingredients can go on a list.</Muted>
        ) : preview ? (
          <Stack $gap={4}>
            {preview.items.length === 0 ? (
              <Muted>These recipes have no ingredients written down yet.</Muted>
            ) : (
              <>
                <Muted>
                  Untick what you already have. Salt, oil and things already on {preview.listTitle}{' '}
                  start unticked.
                </Muted>
                {bySection(preview.items).map(([section, items]) => (
                  <Stack key={section} $gap={2}>
                    <Eyebrow as="h3">{section}</Eyebrow>
                    {items.map((item) => (
                      <Stack key={item.text} $gap={1}>
                        <Checkbox
                          checked={chosen.has(item.text)}
                          onChange={() => toggle(item.text)}
                        >
                          {item.quantity ? `${item.text} (${item.quantity})` : item.text}
                        </Checkbox>
                        <Note>
                          {[
                            item.onList ? `already on ${preview.listTitle}` : null,
                            item.staple && !item.onList ? 'you probably have it' : null,
                            item.recipes.join(', '),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Note>
                      </Stack>
                    ))}
                  </Stack>
                ))}
              </>
            )}
            <Row>
              <Button
                type="button"
                disabled={chosen.size === 0 || actions.shop.isPending}
                onClick={add}
              >
                {actions.shop.isPending ? 'Adding…' : `Add ${chosen.size} to ${preview.listTitle}`}
              </Button>
              <Button type="button" $variant="ghost" onClick={() => setPreview(null)}>
                Cancel
              </Button>
            </Row>
          </Stack>
        ) : (
          <>
            <Text>
              Everything this week’s {plannedRecipes} {plannedRecipes === 1 ? 'recipe' : 'recipes'}{' '}
              need, each thing once, scaled to how many you’re cooking for.
            </Text>
            <Select
              label="Shopping list"
              value={list?.id ?? ''}
              onChange={(e) => setListId(e.target.value)}
            >
              {shopping.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </Select>
            <Row>
              <Button
                type="button"
                $variant="secondary"
                disabled={!list || actions.previewShopping.isPending}
                onClick={review}
              >
                {actions.previewShopping.isPending ? 'Checking…' : 'Choose what to buy'}
              </Button>
            </Row>
          </>
        )}
        {result && (
          <StatusText $status="success" role="status">
            {result}
          </StatusText>
        )}
        {(actions.previewShopping.error ?? actions.shop.error) && (
          <ErrorText role="alert">
            {apiErrorMessage(actions.previewShopping.error ?? actions.shop.error)}
          </ErrorText>
        )}
      </Stack>
    </Card>
  )
}

const Note = styled.p`
  padding-left: 34px;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`
