import type { Recipe } from '@households/shared'
import { useState } from 'react'
import { Link } from 'react-router'
import styled from 'styled-components'

import {
  Button,
  CardList,
  Chip,
  ChipButton,
  ChipGroup,
  Muted,
  Row,
  Stack,
  TextField,
} from '../../components/ui'
import { formatDay } from '../../lib/format'
import type { MealActions } from './queries'
import { RecipeForm } from './RecipeForm'

/**
 * The household's recipes: search, filter by tag, open one to cook from it,
 * add new ones (by hand or from a link).
 */
export function RecipeBox({
  recipes,
  lastPlanned,
  canEdit,
  basePath,
  actions,
}: {
  recipes: Recipe[]
  lastPlanned: Record<string, string>
  canEdit: boolean
  basePath: string
  actions: MealActions
}) {
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const current = recipes.filter((recipe) => recipe.archived === showArchived)
  const tags = [...new Set(current.flatMap((recipe) => recipe.tags))].sort()
  const query = search.trim().toLowerCase()
  const shown = current.filter(
    (recipe) =>
      (!tag || recipe.tags.includes(tag)) &&
      (!query ||
        recipe.title.toLowerCase().includes(query) ||
        recipe.ingredients.some((item) => item.toLowerCase().includes(query)) ||
        recipe.tags.some((item) => item.toLowerCase().includes(query))),
  )

  if (adding) {
    return (
      <RecipeForm
        knownTags={tags}
        busy={actions.addRecipe.isPending}
        error={actions.addRecipe.error}
        submitLabel="Add recipe"
        onCancel={() => setAdding(false)}
        onImport={async (url) => (await actions.importRecipe.mutateAsync(url)).draft}
        onSave={async (input) => {
          await actions.addRecipe.mutateAsync(input)
          setAdding(false)
        }}
      />
    )
  }

  return (
    <Stack $gap={4}>
      {current.length > 4 && (
        <TextField
          label="Search recipes"
          type="search"
          placeholder="Chickpeas, quick, curry…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {tags.length > 0 && (
        <ChipGroup label="Tags">
          {tags.map((item) => (
            <ChipButton
              key={item}
              pressed={tag === item}
              onClick={() => setTag(tag === item ? null : item)}
            >
              {item}
            </ChipButton>
          ))}
        </ChipGroup>
      )}
      {shown.length === 0 && (
        <Muted>
          {current.length > 0
            ? 'No recipes match.'
            : showArchived
              ? 'Nothing archived.'
              : 'No recipes yet. Add the ones you make often, or paste a link to a recipe page.'}
        </Muted>
      )}
      {shown.length > 0 && (
        <List>
          {shown.map((recipe) => (
            <li key={recipe.id}>
              <Stack $gap={1}>
                <TitleLink to={`${basePath}/meals/recipes/${recipe.id}`}>{recipe.title}</TitleLink>
                <Muted>
                  {[
                    `${recipe.ingredients.length} ${recipe.ingredients.length === 1 ? 'ingredient' : 'ingredients'}`,
                    recipe.servings && `serves ${recipe.servings}`,
                    lastPlanned[recipe.id] && `last planned ${formatDay(lastPlanned[recipe.id]!)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Muted>
                {recipe.tags.length > 0 && (
                  <Tags>
                    {recipe.tags.map((item) => (
                      <Chip key={item} $small>
                        {item}
                      </Chip>
                    ))}
                  </Tags>
                )}
              </Stack>
            </li>
          ))}
        </List>
      )}
      <Row $justify="between">
        {canEdit && !showArchived ? (
          <Button type="button" $variant="secondary" $size="sm" onClick={() => setAdding(true)}>
            Add a recipe
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          $variant="ghost"
          $size="sm"
          onClick={() => {
            setShowArchived((value) => !value)
            setTag(null)
          }}
        >
          {showArchived ? 'Show current' : 'Show archived'}
        </Button>
      </Row>
    </Stack>
  )
}

const List = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`

const TitleLink = styled(Link)`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  text-decoration: none;
  overflow-wrap: anywhere;

  &:hover {
    text-decoration: underline;
  }
`

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[1]}px;
`
