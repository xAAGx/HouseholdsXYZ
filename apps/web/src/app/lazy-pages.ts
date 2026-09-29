import { lazy } from 'react'

// Signed-in areas load on demand: they pull in Supabase auth, which public
// pages (marketing, public household profiles) never need.

export const AuthLayout = lazy(() => import('../features/auth/AuthLayout'))

export const SignInPage = lazy(() =>
  import('../pages/SignInPage').then((m) => ({ default: m.SignInPage })),
)

export const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

/**
 * Living style guide. Development builds only: the `DEV` check is replaced at
 * build time, so production output doesn't even contain the chunk.
 */
export const DesignSystemPage = import.meta.env.DEV
  ? lazy(() =>
      import('../features/design-system/DesignSystemPage').then((m) => ({
        default: m.DesignSystemPage,
      })),
    )
  : () => null
