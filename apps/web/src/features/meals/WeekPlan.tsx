import {
  createMealInputSchema,
  MEAL_SHORTCUTS,
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  type HouseholdMember,
  type MealPlanEntry,
  type MealSlot,
  type Recipe,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import {
  Button,
  ChipButton,
  ChipGroup,
  ErrorText,
  Grid,
  Muted,
  Row,
  Select,
  Stack,
  TextField,
} from '../../components/ui'
import { visuallyHidden } from '../../components/ui/mixins'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay } from '../../lib/format'
import type { MealActions } from './queries'

const OTHER = 'other'

/** The week, a day at a time: what's planned, who's cooking, and adding more. */
export function WeekPlan({
  days,
  today,
  entries,
  recipes,
  members,
  canEdit,
  actions,
}: {
  days: string[]
  today: string
  entries: MealPlanEntry[]
  recipes: Recipe[]
  members: HouseholdMember[]
  canEdit: boolean
  actions: MealActions
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const names = new Map(members.map((member) => [member.profileId, member.displayName]))
  const failed = actions.removeMeal.error

  return (
    <Stack $gap={4}>
      <Days>
        {days.map((day) => {
          const planned = entries
            .filter((entry) => entry.onDate === day)
            .sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot))
          return (
            <li key={day}>
              <Stack $gap={2}>
                <Row $justify="between">
                  <DayName>
                    {formatDay(day)}
                    {day === today && <Muted as="span"> · today</Muted>}
                  </DayName>
                  {canEdit && adding !== day && (
                    <Button
                      type="button"
                      $variant="ghost"
                      $size="sm"
                      onClick={() => setAdding(day)}
                    >
                      Add<Hidden> a meal on {formatDay(day)}</Hidden>
                    </Button>
                  )}
                </Row>
                {planned.length === 0 && adding !== day && <Muted>Nothing planned</Muted>}
                {planned.map((entry) => (
                  <Meal key={entry.id}>
                    <Stack $gap={1}>
                      <Muted as="span">{MEAL_SLOT_LABELS[entry.slot]}</Muted>
                      <Name>{entry.name}</Name>
                      {(entry.cookId || entry.note || entry.servings) && (
                        <Muted>
                          {[
                            entry.servings && `for ${entry.servings}`,
                            entry.cookId && `${names.get(entry.cookId) ?? 'Someone'} is cooking`,
                            entry.note,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Muted>
                      )}
                    </Stack>
                    {canEdit && (
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        disabled={actions.removeMeal.isPending}
                        onClick={() => actions.removeMeal.mutate(entry.id)}
                      >
                        Remove<Hidden>: {entry.name}</Hidden>
                      </Button>
                    )}
                  </Meal>
                ))}
                {adding === day && (
                  <AddMeal
                    day={day}
                    recipes={recipes}
                    members={members}
                    actions={actions}
                    onDone={() => setAdding(null)}
                  />
                )}
              </Stack>
            </li>
          )
        })}
      </Days>
      {failed && <ErrorText role="alert">{apiErrorMessage(failed)}</ErrorText>}
    </Stack>
  )
}

function AddMeal({
  day,
  recipes,
  members,
  actions,
  onDone,
}: {
  day: string
  recipes: Recipe[]
  members: HouseholdMember[]
  actions: MealActions
  onDone: () => void
}) {
  const active = recipes.filter((recipe) => !recipe.archived)
  const [slot, setSlot] = useState<MealSlot>('dinner')
  const [choice, setChoice] = useState(active[0]?.id ?? OTHER)
  const [title, setTitle] = useState('')
  const [cookId, setCookId] = useState('')
  const [servings, setServings] = useState('')
  const [error, setError] = useState<string | undefined>()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const input = {
      onDate: day,
      slot,
      recipeId: choice === OTHER ? null : choice,
      title: choice === OTHER ? title : null,
      cookId: cookId || null,
      servings: servings ? Number(servings) : null,
    }
    const parsed = createMealInputSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }
    setError(undefined)
    try {
      await actions.addMeal.mutateAsync(input)
      onDone()
    } catch {
      // Shown below.
    }
  }

  return (
    <Form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <Grid $columns={2} $gap={3}>
          <Select label="Meal" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
            {MEAL_SLOTS.map((value) => (
              <option key={value} value={value}>
                {MEAL_SLOT_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select label="What" value={choice} onChange={(e) => setChoice(e.target.value)}>
            {active.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.title}
              </option>
            ))}
            <option value={OTHER}>Something else…</option>
          </Select>
        </Grid>
        {choice === OTHER && (
          <>
            <TextField
              label="Name it"
              placeholder="Pizza night"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              error={error}
            />
            <ChipGroup label="Or pick one">
              {MEAL_SHORTCUTS.map((shortcut) => (
                <ChipButton
                  key={shortcut}
                  pressed={title === shortcut}
                  onClick={() => setTitle(shortcut)}
                >
                  {shortcut}
                </ChipButton>
              ))}
            </ChipGroup>
          </>
        )}
        <Grid $columns={2} $gap={3}>
          <Select
            label="Who’s cooking (optional)"
            placeholder="Not decided"
            value={cookId}
            onChange={(e) => setCookId(e.target.value)}
          >
            {members.map((member) => (
              <option key={member.profileId} value={member.profileId}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <TextField
            label="For how many (optional)"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={servings}
            hint={
              choice !== OTHER && active.find((recipe) => recipe.id === choice)?.servings
                ? `The recipe serves ${active.find((recipe) => recipe.id === choice)?.servings}; amounts scale to match.`
                : undefined
            }
            onChange={(e) => setServings(e.target.value)}
          />
        </Grid>
        {choice !== OTHER && error && <ErrorText role="alert">{error}</ErrorText>}
        {actions.addMeal.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.addMeal.error)}</ErrorText>
        )}
        <Row>
          <Button
            type="submit"
            $variant="secondary"
            $size="sm"
            disabled={actions.addMeal.isPending}
          >
            Add to {formatDay(day)}
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </Form>
  )
}

const Days = styled.ol`
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    padding: ${({ theme }) => theme.space[4]}px 0;
    border-top: ${({ theme }) => theme.borderWidths.hairline}px solid
      ${({ theme }) => theme.colors.hairline};
  }

  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`

const DayName = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.md}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Meal = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.surfaceMuted};
`

const Name = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`

const Form = styled.form`
  padding: ${({ theme }) => theme.space[4]}px;
  border: ${({ theme }) => theme.borderWidths.hairline}px solid
    ${({ theme }) => theme.colors.hairline};
  border-radius: ${({ theme }) => theme.radii.md}px;
`

const Hidden = styled.span`
  ${visuallyHidden};
`
