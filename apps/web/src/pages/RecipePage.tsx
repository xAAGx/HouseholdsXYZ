import {
  addDays,
  chorePeriodStart,
  localDate,
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  scaleIngredient,
  type MealSlot,
  type Recipe,
} from '@households/shared'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import styled, { css } from 'styled-components'

import { Icon } from '../components/icons'
import {
  Button,
  ButtonLink,
  Card,
  CardTitle,
  Checkbox,
  Chip,
  ConfirmButton,
  ErrorText,
  Grid,
  Muted,
  Page,
  PageTitle,
  Row,
  Select,
  Stack,
  StatusText,
  Text,
  TextField,
} from '../components/ui'
import { focusRing } from '../components/ui/mixins'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import type { MemberView } from '../features/households/member-view'
import { useMealActions, useMealPlan, type MealActions } from '../features/meals/queries'
import { RecipeForm } from '../features/meals/RecipeForm'
import { apiErrorMessage } from '../lib/api-errors'
import { formatDay } from '../lib/format'

/** /…/meals/recipes/:recipeId: one recipe, ready to cook from. */
export function RecipePage() {
  const { recipeId = '' } = useParams()
  return (
    <MemberGate subPath={`/meals/recipes/${recipeId}`}>
      {(view, basePath) => <RecipeView view={view} basePath={basePath} recipeId={recipeId} />}
    </MemberGate>
  )
}

/** Keeps the screen on while cooking (Paprika's cook mode), where the browser can. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (cancelled) void lock.release()
          else sentinel = lock
        })
        .catch(() => undefined)
    void acquire()
    // The lock is dropped when the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [on])
}

function RecipeView({
  view,
  basePath,
  recipeId,
}: {
  view: MemberView
  basePath: string
  recipeId: string
}) {
  const today = localDate()
  const monday = chorePeriodStart('weekly', today, today)
  const plan = useMealPlan(view.household.id, monday, addDays(monday, 6))
  const actions = useMealActions(view.household.id)
  const recipe = plan.data?.recipes.find((item) => item.id === recipeId)

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page>
        <Stack $gap={6}>
          <Row>
            <ButtonLink to={`${basePath}/meals`} $variant="ghost" $size="sm">
              <Icon name="chevronLeft" size={18} />
              Meals
            </ButtonLink>
          </Row>
          {plan.isPending && <Muted>Loading…</Muted>}
          {plan.isError && <Text>We couldn’t load this recipe. {apiErrorMessage(plan.error)}</Text>}
          {plan.data && !recipe && <Text>This recipe isn’t in the recipe box any more.</Text>}
          {plan.data && recipe && (
            <Cook
              key={recipe.id}
              recipe={recipe}
              canEdit={plan.data.canEdit}
              basePath={basePath}
              actions={actions}
              knownTags={[...new Set(plan.data.recipes.flatMap((item) => item.tags))]}
            />
          )}
        </Stack>
      </Page>
    </>
  )
}

function Cook({
  recipe,
  canEdit,
  basePath,
  actions,
  knownTags,
}: {
  recipe: Recipe
  canEdit: boolean
  basePath: string
  actions: MealActions
  knownTags: string[]
}) {
  const navigate = useNavigate()
  const [count, setCount] = useState(recipe.servings ?? 1)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [step, setStep] = useState(0)
  const [awake, setAwake] = useState(false)
  const [editing, setEditing] = useState(false)
  useWakeLock(awake)

  const factor = recipe.servings ? count / recipe.servings : count
  const steps = (recipe.method ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const canStayAwake = 'wakeLock' in navigator

  if (editing) {
    return (
      <Card $padding="lg">
        <Stack $gap={4}>
          <CardTitle>Edit recipe</CardTitle>
          <RecipeForm
            recipe={recipe}
            knownTags={knownTags}
            busy={actions.updateRecipe.isPending}
            error={actions.updateRecipe.error}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSave={async (json) => {
              await actions.updateRecipe.mutateAsync({ recipeId: recipe.id, json })
              setEditing(false)
            }}
          />
        </Stack>
      </Card>
    )
  }

  return (
    <Stack $gap={6}>
      <Stack $gap={2}>
        <PageTitle>{recipe.title}</PageTitle>
        <Row $gap={2}>
          {recipe.servings && <Muted as="span">Serves {recipe.servings}</Muted>}
          {recipe.tags.map((tag) => (
            <Chip key={tag} $small>
              {tag}
            </Chip>
          ))}
          {recipe.sourceUrl && (
            <Muted as="span">
              <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                Where it’s from
              </a>
            </Muted>
          )}
        </Row>
        {canStayAwake && (
          <Checkbox checked={awake} onChange={(e) => setAwake(e.target.checked)}>
            Keep the screen on while I cook
          </Checkbox>
        )}
      </Stack>

      <TopAligned $columns={2} $gap={5}>
        <Card $padding="lg">
          <Stack $gap={4}>
            <Row $justify="between">
              <CardTitle as="h2">Ingredients</CardTitle>
              <Row $gap={1}>
                <Button
                  type="button"
                  $variant="secondary"
                  $size="sm"
                  aria-label="Fewer"
                  disabled={count <= 1}
                  onClick={() => setCount((value) => Math.max(1, value - 1))}
                >
                  −
                </Button>
                <Amount aria-live="polite">{recipe.servings ? `For ${count}` : `×${count}`}</Amount>
                <Button
                  type="button"
                  $variant="secondary"
                  $size="sm"
                  aria-label="More"
                  disabled={count >= 50}
                  onClick={() => setCount((value) => Math.min(50, value + 1))}
                >
                  +
                </Button>
              </Row>
            </Row>
            {recipe.ingredients.length === 0 ? (
              <Muted>No ingredients written down yet.</Muted>
            ) : (
              <Stack $gap={3}>
                {recipe.ingredients.map((ingredient, i) => (
                  <Checkbox
                    key={i}
                    large
                    checked={checked.has(i)}
                    onChange={() =>
                      setChecked((current) => {
                        const next = new Set(current)
                        if (next.has(i)) next.delete(i)
                        else next.add(i)
                        return next
                      })
                    }
                  >
                    {scaleIngredient(ingredient, factor)}
                  </Checkbox>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>

        <Card $padding="lg">
          <Stack $gap={4}>
            <CardTitle as="h2">Method</CardTitle>
            {steps.length === 0 ? (
              <Muted>No method written down yet.</Muted>
            ) : (
              <Steps>
                {steps.map((text, i) => (
                  <li key={i}>
                    <StepButton
                      type="button"
                      aria-current={i === step ? 'step' : undefined}
                      $current={i === step}
                      onClick={() => setStep(i)}
                    >
                      <StepNumber $current={i === step}>{i + 1}</StepNumber>
                      <span>{text}</span>
                    </StepButton>
                  </li>
                ))}
              </Steps>
            )}
            {steps.length > 1 && (
              <Row>
                <Button
                  type="button"
                  $variant="secondary"
                  $size="sm"
                  disabled={step >= steps.length - 1}
                  onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
                >
                  Next step
                </Button>
              </Row>
            )}
          </Stack>
        </Card>
      </TopAligned>

      {canEdit && (
        <Grid $columns={2} $gap={5}>
          <PlanIt recipe={recipe} count={count} basePath={basePath} actions={actions} />
          <Card $variant="plain" $padding="lg">
            <Stack $gap={3}>
              <CardTitle as="h2">This recipe</CardTitle>
              <Row $gap={1}>
                {!recipe.archived && (
                  <Button
                    type="button"
                    $variant="secondary"
                    $size="sm"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </Button>
                )}
                <Button
                  type="button"
                  $variant="ghost"
                  $size="sm"
                  disabled={actions.updateRecipe.isPending}
                  onClick={() =>
                    actions.updateRecipe.mutate({
                      recipeId: recipe.id,
                      json: { archived: !recipe.archived },
                    })
                  }
                >
                  {recipe.archived ? 'Restore' : 'Archive'}
                </Button>
                {recipe.canDelete && (
                  <ConfirmButton
                    message={`Delete “${recipe.title}”? Meals already planned keep its name.`}
                    confirmLabel="Yes, delete it"
                    busy={actions.deleteRecipe.isPending}
                    onConfirm={() =>
                      actions.deleteRecipe.mutate(recipe.id, {
                        onSuccess: () => void navigate(`${basePath}/meals`),
                      })
                    }
                  >
                    Delete
                  </ConfirmButton>
                )}
              </Row>
              {(actions.updateRecipe.error ?? actions.deleteRecipe.error) && (
                <ErrorText role="alert">
                  {apiErrorMessage(actions.updateRecipe.error ?? actions.deleteRecipe.error)}
                </ErrorText>
              )}
            </Stack>
          </Card>
        </Grid>
      )}
    </Stack>
  )
}

/** Puts this recipe on the plan, for the number of people chosen above. */
function PlanIt({
  recipe,
  count,
  basePath,
  actions,
}: {
  recipe: Recipe
  count: number
  basePath: string
  actions: MealActions
}) {
  const [day, setDay] = useState(localDate())
  const [slot, setSlot] = useState<MealSlot>('dinner')
  const [planned, setPlanned] = useState<string | null>(null)

  return (
    <Card $variant="soft" $tone="coral" $padding="lg">
      <Stack $gap={4}>
        <CardTitle as="h2">Plan it</CardTitle>
        <Grid $columns={2} $gap={3}>
          <TextField label="Day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <Select label="Meal" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
            {MEAL_SLOTS.map((value) => (
              <option key={value} value={value}>
                {MEAL_SLOT_LABELS[value]}
              </option>
            ))}
          </Select>
        </Grid>
        <Row>
          <Button
            type="button"
            disabled={!day || actions.addMeal.isPending}
            onClick={() =>
              actions.addMeal.mutate(
                {
                  onDate: day,
                  slot,
                  recipeId: recipe.id,
                  servings: recipe.servings && count !== recipe.servings ? count : null,
                },
                {
                  onSuccess: () =>
                    setPlanned(
                      `On the plan for ${formatDay(day)}, ${MEAL_SLOT_LABELS[slot].toLowerCase()}.`,
                    ),
                },
              )
            }
          >
            Add to the plan
          </Button>
          <ButtonLink to={`${basePath}/meals`} $variant="ghost">
            See the week
          </ButtonLink>
        </Row>
        {planned && (
          <StatusText $status="success" role="status">
            {planned}
          </StatusText>
        )}
        {actions.addMeal.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.addMeal.error)}</ErrorText>
        )}
      </Stack>
    </Card>
  )
}

const TopAligned = styled(Grid)`
  align-items: start;
`

const Amount = styled.span`
  min-width: 56px;
  text-align: center;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Steps = styled.ol`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const StepButton = styled.button<{ $current: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]}px;
  width: 100%;
  padding: ${({ theme }) => theme.space[3]}px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid transparent;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.lg}px;
  line-height: ${({ theme }) => theme.lineHeights.normal};
  text-align: left;
  cursor: pointer;

  ${({ $current, theme }) =>
    $current &&
    css`
      border-color: ${theme.colors.outline};
      background: ${theme.colors.accents.yellow.tint};
    `}

  &:focus-visible {
    ${focusRing};
  }
`

const StepNumber = styled.span<{ $current: boolean }>`
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: 50%;
  background: ${({ theme, $current }) => ($current ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $current }) => ($current ? theme.colors.onPrimary : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`
