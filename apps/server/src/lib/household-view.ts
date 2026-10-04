import type { HouseholdsSupabaseClient } from '@households/db'
import {
  householdPath,
  type HouseholdAddress,
  type HouseholdMember,
  type HouseholdRole,
  type HouseholdView,
} from '@households/shared'

import { toApiError } from './errors'
import { CITY_EMBED, toPlace } from './places'

const ROLE_ORDER: HouseholdRole[] = [
  'owner',
  'admin',
  'adult',
  'caregiver',
  'guest',
  'teen',
  'child',
]

/**
 * The household page for whoever is asking. Every query runs through RLS, so a
 * private household the caller can't see resolves to null, exactly like an
 * address that doesn't exist.
 */
export async function loadHouseholdView(
  supabase: HouseholdsSupabaseClient,
  userId: string | null,
  address: HouseholdAddress,
): Promise<HouseholdView | null> {
  const { data: matches, error } = await supabase.rpc('resolve_household_address', {
    p_country: address.country,
    p_region: address.region,
    p_city: address.city,
    p_name: address.name,
  })
  if (error) throw toApiError(error)
  const match = matches[0]
  if (!match) return null

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select(
      `id, slug, name, bio, visibility, city_id, time_zone, currency, currency_digits, points_value_minor, city:geo_cities(${CITY_EMBED})`,
    )
    .eq('id', match.household_id)
    .single()
  if (householdError) throw toApiError(householdError)
  const place = toPlace(household.city)

  if (!match.is_current) {
    return place ? { kind: 'moved', path: householdPath(place, household.slug) } : null
  }

  const publicView: HouseholdView = {
    kind: 'public',
    household: { name: household.name, bio: household.bio, place },
  }
  if (!userId) return publicView

  const { data: rows, error: membersError } = await supabase
    .from('household_members')
    .select(
      'profile_id, role, joined_at, profile:profiles!household_members_profile_id_fkey(display_name, account_type)',
    )
    .eq('household_id', household.id)
    .eq('status', 'active')
  if (membersError) throw toApiError(membersError)

  const me = rows.find((row) => row.profile_id === userId)
  // A signed-in outsider looking at a public household.
  if (!me) return publicView

  const { data: permissions, error: permissionsError } = await supabase.rpc(
    'my_household_permissions',
    { p_household_id: household.id },
  )
  if (permissionsError) throw toApiError(permissionsError)

  // A nudge for people who approve chores: what's waiting for them.
  let pendingApprovals = 0
  if (permissions.includes('manage_chores')) {
    const [chores, rewards] = await Promise.all([
      supabase
        .from('chore_completions')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', household.id)
        .eq('status', 'pending')
        .neq('completed_by', userId),
      supabase
        .from('reward_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', household.id)
        .eq('status', 'requested'),
    ])
    if (chores.error) throw toApiError(chores.error)
    if (rewards.error) throw toApiError(rewards.error)
    pendingApprovals = (chores.count ?? 0) + (rewards.count ?? 0)
  }

  const members: HouseholdMember[] = rows
    .map((row) => ({
      profileId: row.profile_id,
      displayName: row.profile.display_name,
      role: row.role,
      accountType: row.profile.account_type,
      joinedAt: row.joined_at,
      isMe: row.profile_id === userId,
    }))
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        a.displayName.localeCompare(b.displayName),
    )

  return {
    kind: 'member',
    household: {
      id: household.id,
      slug: household.slug,
      name: household.name,
      bio: household.bio,
      visibility: household.visibility,
      cityId: household.city_id,
      place,
      timeZone: household.time_zone,
      currency: household.currency,
      currencyDigits: household.currency_digits,
      pointsValueMinor: household.points_value_minor,
    },
    myRole: me.role,
    permissions,
    members,
    pendingApprovals,
  }
}
