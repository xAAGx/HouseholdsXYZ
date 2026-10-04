import { addDays, chorePeriodStart, localDate } from '@households/shared'
import { useState } from 'react'
import styled from 'styled-components'

import { Icon } from '../components/icons'
import {
  Button,
  Card,
  CardTitle,
  ErrorText,
  Grid,
  Muted,
  Page,
  PageTitle,
  Row,
  Stack,
  Text,
} from '../components/ui'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import type { MemberView } from '../features/households/member-view'
import { useLists } from '../features/lists/queries'
import { useMealActions, useMealPlan } from '../features/meals/queries'
import { RecipeBox } from '../features/meals/RecipeBox'
import { ShoppingCard } from '../features/meals/ShoppingCard'
import { WeekPlan } from '../features/meals/WeekPlan'
import { apiErrorMessage } from '../lib/api-errors'
import { formatDay } from '../lib/format'

/** /…/meals: the week's meals, the recipe box, and shopping for it. */
export function MealsPage() {
  return (
    <MemberGate subPath="/meals">
      {(view, basePath) => <Meals view={view} basePath={basePath} />}
    </MemberGate>
  )
}

function Meals({ view, basePath }: { view: MemberView; basePath: string }) {
  const today = localDate()
  const thisMonday = chorePeriodStart('weekly', today, today)
  const [monday, setMonday] = useState(thisMonday)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const sunday = days[6]!
  const plan = useMealPlan(view.household.id, monday, sunday)
  const lists = useLists(view.household.id, false)
  const actions = useMealActions(view.household.id)
  const [copied, setCopied] = useState<string | null>(null)
  const goToWeek = (next: string) => {
    setMonday(next)
    setCopied(null)
  }

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page>
        <Stack $gap={6}>
          <Stack $gap={1}>
            <PageTitle>Meals</PageTitle>
            <Muted>{view.household.name}</Muted>
          </Stack>

          {plan.isPending && <Muted>Loading…</Muted>}
          {plan.isError && (
            <Text>We couldn’t load the meal plan. {apiErrorMessage(plan.error)}</Text>
          )}
          {plan.data && (
            <TopAligned $columns={2} $gap={5}>
              <Card $padding="lg">
                <Stack $gap={4}>
                  <Row $justify="between">
                    <CardTitle as="h2">
                      {monday === thisMonday ? 'This week' : `Week of ${formatDay(monday)}`}
                    </CardTitle>
                    <Row $gap={1}>
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        aria-label="Previous week"
                        onClick={() => goToWeek(addDays(monday, -7))}
                      >
                        <Icon name="chevronLeft" size={18} />
                      </Button>
                      {monday !== thisMonday && (
                        <Button
                          type="button"
                          $variant="ghost"
                          $size="sm"
                          onClick={() => goToWeek(thisMonday)}
                        >
                          This week
                        </Button>
                      )}
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        aria-label="Next week"
                        onClick={() => goToWeek(addDays(monday, 7))}
                      >
                        <Icon name="chevronRight" size={18} />
                      </Button>
                    </Row>
                  </Row>
                  {plan.data.canEdit && plan.data.entries.length === 0 && (
                    <Row>
                      <Button
                        type="button"
                        $variant="secondary"
                        $size="sm"
                        disabled={actions.copyWeek.isPending}
                        onClick={() =>
                          actions.copyWeek.mutate(
                            { from: addDays(monday, -7), to: monday },
                            {
                              onSuccess: ({ copied: count }) =>
                                setCopied(
                                  count === 0
                                    ? 'The week before had nothing planned.'
                                    : `Copied ${count} ${count === 1 ? 'meal' : 'meals'} from the week before.`,
                                ),
                            },
                          )
                        }
                      >
                        Copy the week before
                      </Button>
                    </Row>
                  )}
                  {copied && (
                    <Muted role="status" aria-live="polite">
                      {copied}
                    </Muted>
                  )}
                  {actions.copyWeek.isError && (
                    <ErrorText role="alert">{apiErrorMessage(actions.copyWeek.error)}</ErrorText>
                  )}
                  <WeekPlan
                    days={days}
                    today={today}
                    entries={plan.data.entries}
                    recipes={plan.data.recipes}
                    members={view.members}
                    canEdit={plan.data.canEdit}
                    actions={actions}
                  />
                </Stack>
              </Card>

              <Stack $gap={5}>
                {plan.data.canEdit && (
                  <ShoppingCard
                    from={monday}
                    to={sunday}
                    lists={lists.data ?? []}
                    basePath={basePath}
                    plannedRecipes={plan.data.entries.filter((entry) => entry.recipeId).length}
                    actions={actions}
                  />
                )}
                <Card $padding="lg">
                  <Stack $gap={4}>
                    <CardTitle as="h2">Recipe box</CardTitle>
                    <RecipeBox
                      recipes={plan.data.recipes}
                      lastPlanned={plan.data.lastPlanned}
                      canEdit={plan.data.canEdit}
                      basePath={basePath}
                      actions={actions}
                    />
                  </Stack>
                </Card>
              </Stack>
            </TopAligned>
          )}
        </Stack>
      </Page>
    </>
  )
}

const TopAligned = styled(Grid)`
  align-items: start;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`
