import {
  addChildInputSchema,
  ApiError,
  transferOwnershipInputSchema,
  createHouseholdInputSchema,
  createInviteInputSchema,
  householdAddressSchema,
  householdPath,
  moveHouseholdInputSchema,
  setMemberRoleInputSchema,
  updateHouseholdInputSchema,
  type HouseholdInvite,
  type HouseholdSummary,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { loadHouseholdView } from '../lib/household-view'
import { CITY_EMBED, toPlace } from '../lib/places'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

const HOUSEHOLD_SUMMARY = `role, household:households!inner(
  id, slug, name, visibility, avatar_path, city:geo_cities(${CITY_EMBED})
)`

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const memberParam = zValidator(
  'param',
  z.object({ id: z.uuid(), profileId: z.uuid() }),
  validationHook,
)
const inviteParam = zValidator(
  'param',
  z.object({ id: z.uuid(), inviteId: z.uuid() }),
  validationHook,
)
const childParam = zValidator(
  'param',
  z.object({ id: z.uuid(), childId: z.uuid() }),
  validationHook,
)

/** Adults only: children are removed with their account (see /children). */
const ADULT_ROLES = ['admin', 'adult', 'caregiver', 'guest'] as const

export const householdRoutes = new Hono<AppEnv>()
  // Households the signed-in user is an active member of.
  .get('/', async (c) => {
    const { data, error } = await c.var.supabase
      .from('household_members')
      .select(HOUSEHOLD_SUMMARY)
      .eq('profile_id', c.var.auth.userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
    if (error) throw toApiError(error)

    const households: HouseholdSummary[] = data.map(({ role, household }) => ({
      id: household.id,
      slug: household.slug,
      name: household.name,
      visibility: household.visibility,
      avatarPath: household.avatar_path,
      myRole: role,
      place: toPlace(household.city),
    }))
    return c.json({ households })
  })

  // Creates a private household owned by the caller. Validation is repeated in
  // the database (create_household RPC), which is the final authority.
  .post('/', zValidator('json', createHouseholdInputSchema, validationHook), async (c) => {
    const input = c.req.valid('json')
    const { data: id, error } = await c.var.supabase.rpc('create_household', {
      p_name: input.name,
      p_slug: input.slug,
      p_city_id: input.cityId,
    })
    if (error) throw toApiError(error)

    const { data: city, error: cityError } = await c.var.supabase
      .from('geo_cities')
      .select(CITY_EMBED)
      .eq('id', input.cityId)
      .single()
    if (cityError) throw toApiError(cityError)

    return c.json(
      { household: { id, slug: input.slug, name: input.name, place: toPlace(city) } },
      201,
    )
  })

  // The household page: the member view, the public profile, or a redirect
  // from an old address. Private and missing households are the same 404.
  .get('/by-address', zValidator('query', householdAddressSchema, validationHook), async (c) => {
    const view = await loadHouseholdView(c.var.supabase, c.var.auth.userId, c.req.valid('query'))
    if (!view) throw new ApiError('NOT_FOUND')
    return c.json({ view })
  })

  // ── Settings ─────────────────────────────────────────────────────────────

  .patch(
    '/:id',
    householdParam,
    zValidator('json', updateHouseholdInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { name, bio, visibility } = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('households')
        .update({
          ...(name !== undefined && { name }),
          ...(bio !== undefined && { bio: bio || null }),
          ...(visibility !== undefined && { visibility }),
        })
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw toApiError(error)
      if (!data) throw new ApiError('FORBIDDEN')
      return c.json({ ok: true as const })
    },
  )

  // A new address (city and/or name). Members following the old one are redirected.
  .put(
    '/:id/address',
    householdParam,
    zValidator('json', moveHouseholdInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { cityId, slug } = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('households')
        .update({ city_id: cityId, slug })
        .eq('id', id)
        .select(`slug, city:geo_cities(${CITY_EMBED})`)
        .maybeSingle()
      if (error) throw toApiError(error)
      if (!data) throw new ApiError('FORBIDDEN')
      const place = toPlace(data.city)
      return c.json({ path: place ? householdPath(place, data.slug) : null })
    },
  )

  // Deletes the household, and with it the accounts of the children in it:
  // they exist only for this household.
  .delete('/:id', householdParam, async (c) => {
    const { id } = c.req.valid('param')
    const { data: children, error: childrenError } = await c.var.supabase
      .from('household_members')
      .select('profile_id, profile:profiles!household_members_profile_id_fkey!inner(account_type)')
      .eq('household_id', id)
      .eq('profile.account_type', 'child')
    if (childrenError) throw toApiError(childrenError)
    if (children.length > 0 && !c.var.adminAuth) {
      throw new ApiError('UNAVAILABLE', 'Remove the children’s accounts first, then try again.')
    }

    const { data, error } = await c.var.supabase
      .from('households')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN', 'Only the owner can delete a household.')

    // Only the owner gets this far (RLS), and these were this household's children.
    for (const child of children) await c.var.adminAuth?.removeChild(child.profile_id)
    return c.json({ ok: true as const })
  })

  // Hand the household to another adult member; the owner becomes an admin.
  .post(
    '/:id/owner',
    householdParam,
    zValidator('json', transferOwnershipInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { error } = await c.var.supabase.rpc('transfer_household_ownership', {
        p_household_id: id,
        p_new_owner_id: c.req.valid('json').profileId,
      })
      if (error) throw toApiError(error)
      return c.json({ ok: true as const })
    },
  )

  // ── Members ──────────────────────────────────────────────────────────────

  // Leave. Owners can't (they delete the household); children can't (parents manage them).
  .delete('/:id/membership', householdParam, async (c) => {
    const { id } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('household_members')
      .delete()
      .eq('household_id', id)
      .eq('profile_id', c.var.auth.userId)
      .select('profile_id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN')
    return c.json({ ok: true as const })
  })

  .patch(
    '/:id/members/:profileId',
    memberParam,
    zValidator('json', setMemberRoleInputSchema, validationHook),
    async (c) => {
      const { id, profileId } = c.req.valid('param')
      const { error } = await c.var.supabase.rpc('set_household_member_role', {
        p_household_id: id,
        p_profile_id: profileId,
        p_role: c.req.valid('json').role,
      })
      if (error) throw toApiError(error)
      return c.json({ ok: true as const })
    },
  )

  .delete('/:id/members/:profileId', memberParam, async (c) => {
    const { id, profileId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('household_members')
      .delete()
      .eq('household_id', id)
      .eq('profile_id', profileId)
      .in('role', [...ADULT_ROLES])
      .select('profile_id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN')
    return c.json({ ok: true as const })
  })

  // ── Invite links ─────────────────────────────────────────────────────────

  .get('/:id/invites', householdParam, async (c) => {
    const { id } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('household_invites')
      .select(
        'id, role, expires_at, creator:profiles!household_invites_created_by_fkey(display_name)',
      )
      .eq('household_id', id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) throw toApiError(error)

    const invites: HouseholdInvite[] = data.map((row) => ({
      id: row.id,
      role: row.role,
      expiresAt: row.expires_at,
      createdByName: row.creator?.display_name ?? null,
    }))
    return c.json({ invites })
  })

  // Returns the token once. The web app puts it after '#' in the link, so it
  // never reaches a server log; only its hash is stored.
  .post(
    '/:id/invites',
    householdParam,
    zValidator('json', createInviteInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { data, error } = await c.var.supabase.rpc('create_household_invite', {
        p_household_id: id,
        p_role: c.req.valid('json').role,
      })
      if (error) throw toApiError(error)
      const created = data[0]
      if (!created) throw new ApiError('INTERNAL')
      return c.json(
        {
          invite: {
            id: created.invite_id,
            token: created.invite_token,
            expiresAt: created.invite_expires_at,
          },
        },
        201,
      )
    },
  )

  .delete('/:id/invites/:inviteId', inviteParam, async (c) => {
    const { id, inviteId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('household_invites')
      .delete()
      .eq('household_id', id)
      .eq('id', inviteId)
      .select('id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('NOT_FOUND')
    return c.json({ ok: true as const })
  })

  // ── Child accounts ───────────────────────────────────────────────────────

  // Creates the child's login and a first sign-in code for them.
  .post(
    '/:id/children',
    householdParam,
    zValidator('json', addChildInputSchema, validationHook),
    async (c) => {
      const adminAuth = c.var.adminAuth
      if (!adminAuth) throw new ApiError('UNAVAILABLE', 'Child accounts aren’t set up yet.')
      const { id } = c.req.valid('param')
      const { displayName } = c.req.valid('json')

      const childId = await adminAuth.createChild({
        parentId: c.var.auth.userId,
        householdId: id,
        displayName,
      })

      const { data, error } = await c.var.supabase.rpc('create_child_sign_in_code', {
        p_household_id: id,
        p_child_id: childId,
      })
      if (error) throw toApiError(error)
      const code = data[0]
      if (!code) throw new ApiError('INTERNAL')
      return c.json(
        {
          child: { profileId: childId, displayName },
          signIn: { code: code.sign_in_code, expiresAt: code.code_expires_at },
        },
        201,
      )
    },
  )

  // A fresh code, e.g. for a new tablet. Earlier codes stop working.
  .post('/:id/children/:childId/sign-in-code', childParam, async (c) => {
    const { id, childId } = c.req.valid('param')
    const { data, error } = await c.var.supabase.rpc('create_child_sign_in_code', {
      p_household_id: id,
      p_child_id: childId,
    })
    if (error) throw toApiError(error)
    const code = data[0]
    if (!code) throw new ApiError('INTERNAL')
    return c.json({ signIn: { code: code.sign_in_code, expiresAt: code.code_expires_at } })
  })

  .delete('/:id/children/:childId', childParam, async (c) => {
    const adminAuth = c.var.adminAuth
    if (!adminAuth) throw new ApiError('UNAVAILABLE', 'Child accounts aren’t set up yet.')
    const { id, childId } = c.req.valid('param')

    // Authorize as the parent, under RLS, before using the secret key.
    const { data: allowed, error } = await c.var.supabase.rpc('can_manage_child', {
      p_household_id: id,
      p_child_id: childId,
    })
    if (error) throw toApiError(error)
    if (!allowed) throw new ApiError('FORBIDDEN')

    await adminAuth.removeChild(childId)
    return c.json({ ok: true as const })
  })
