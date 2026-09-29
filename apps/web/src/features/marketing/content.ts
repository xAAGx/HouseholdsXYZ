import {
  CONTENT_VISIBILITIES,
  CONTENT_VISIBILITY_LABELS,
  DEFAULT_CONTENT_VISIBILITY,
} from '@households/shared'
import type { Accent } from '@households/theme'

import type { IconName } from '../../components/icons'

/**
 * Homepage copy and illustrative data.
 *
 * Every product or privacy claim must stay true to what we actually build.
 * Don't add claims (encryption, "never sold", ad-free, …) without the feature
 * and the policy behind them. See DESIGN.md → Voice.
 */

export const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#together', label: 'Family & neighbors' },
  { href: '#pricing', label: 'Pricing' },
] as const

export interface Feature {
  icon: IconName
  tone: Accent
  title: string
  body: string
}

export const everydayFeatures: readonly Feature[] = [
  {
    icon: 'chores',
    tone: 'yellow',
    title: 'Chores & rewards',
    body: 'Recurring chores, fair rotations, reminders, and optional points for kids.',
  },
  {
    icon: 'lists',
    tone: 'sky',
    title: 'Lists',
    body: 'Shopping, packing and school lists that update for everyone as you go.',
  },
  {
    icon: 'calendar',
    tone: 'coral',
    title: 'Shared calendar',
    body: 'Birthdays, school events, appointments and trips, all in one place.',
  },
  {
    icon: 'chat',
    tone: 'grass',
    title: 'Family chat',
    body: 'A household group, direct messages, and small circles for surprises.',
  },
]

export const importantFeatures: readonly Feature[] = [
  {
    icon: 'money',
    tone: 'grass',
    title: 'Expenses & budgets',
    body: 'Log bills, split shared costs and see where the month went.',
  },
  {
    icon: 'vault',
    tone: 'grape',
    title: 'Document vault',
    body: 'Insurance, leases, manuals and warranties, visible only to the right people.',
  },
  {
    icon: 'home',
    tone: 'sky',
    title: 'Home inventory',
    body: 'Appliances, receipts, serial numbers and warranty reminders.',
  },
  {
    icon: 'memories',
    tone: 'coral',
    title: 'Memories',
    body: 'Albums, milestones and a yearly timeline of life at home.',
  },
]

export const generations: readonly { who: string; tone: Accent; body: string }[] = [
  { who: 'Kids', tone: 'yellow', body: 'Chores with points and a little friendly competition.' },
  {
    who: 'Teens',
    tone: 'sky',
    body: 'Their own lists and plans, with limits parents can loosen over time.',
  },
  {
    who: 'Parents',
    tone: 'grass',
    body: 'Bills, documents and the family calendar, finally in one place.',
  },
  {
    who: 'Grandparents',
    tone: 'grape',
    body: 'Photos, birthdays and plans, without the group-chat chaos.',
  },
]

export const privacyPoints = [
  {
    title: 'Private by default',
    body: 'Every household starts private. Nothing is public until you choose to publish it.',
  },
  {
    title: 'You choose the audience',
    body: 'Decide who sees each post, photo and event, from just you to the whole neighborhood.',
  },
  {
    title: 'Kids stay protected',
    body: 'Child accounts are managed by parents, never discoverable and never public.',
  },
  {
    title: 'Your data, your exit',
    body: 'Export your photos, documents and records, or delete your account, whenever you like.',
  },
] as const

/** Narrowest to widest, straight from the database enum. */
export const audiences = CONTENT_VISIBILITIES.map((id) => ({
  id,
  label: CONTENT_VISIBILITY_LABELS[id],
  isDefault: id === DEFAULT_CONTENT_VISIBILITY,
}))

export const togetherPoints = [
  {
    title: 'Every home you belong to',
    body: 'Your place, your parents’ place, the lake cabin, a shared flat. One account, separate spaces.',
  },
  {
    title: 'Households you trust',
    body: 'Connect with extended family and friends to plan get-togethers and share only what you choose.',
  },
  {
    title: 'Neighbors, if you want them',
    body: 'Borrow a ladder, find a good plumber, organize the street BBQ. Always opt-in.',
  },
] as const

export const steps = [
  {
    title: 'Claim your address',
    body: 'Create your household at households.xyz/house/YourName. It starts private.',
  },
  {
    title: 'Invite your people',
    body: 'Add partners, kids, grandparents or a caregiver, each with the right role.',
  },
  {
    title: 'Share on your terms',
    body: 'Keep everything in the family, or open a public page when you’re ready.',
  },
] as const

export const plans = [
  {
    name: 'Free',
    summary: 'For every household, for as long as you like.',
    items: [
      'Chores, lists & calendar',
      'Family chat & memories',
      'Members with roles',
      'Privacy controls',
    ],
    featured: false,
  },
  {
    name: 'Premium',
    summary: 'For households that want a little more help.',
    items: [
      'More photo & document storage',
      'Household AI assistant',
      'Advanced budgeting & inventory',
      'Backups & custom themes',
    ],
    featured: true,
  },
] as const

/** Illustrative data for the hero mockups. All names are fictional. */
export const sample = {
  chores: [
    { title: 'Take out recycling', who: 'Sam', done: true, points: 0 },
    { title: 'Water the plants', who: 'Maya', done: false, points: 5 },
    { title: 'Feed Biscuit', who: 'Leo', done: false, points: 3 },
  ],
  event: { day: 'Sat', date: '12', title: 'Grandma’s birthday' },
  bills: [
    { title: 'Electricity', amount: '$86.40', status: 'Due Fri', paidBy: null },
    { title: 'Internet', amount: '$55.00', status: 'Paid', paidBy: 'Sam' },
  ],
  document: { title: 'Home insurance 2026.pdf', audience: 'parents' },
} as const
