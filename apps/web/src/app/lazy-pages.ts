import { lazy } from 'react'

// Signed-in areas load on demand: they pull in Supabase auth, which public
// pages (marketing, public household profiles) never need.

export const AuthLayout = lazy(() => import('../features/auth/AuthLayout'))

/** Public, but loaded on demand so the homepage doesn't carry its validation code. */
export const HouseholdPage = lazy(() =>
  import('../pages/HouseholdPage').then((m) => ({ default: m.HouseholdPage })),
)

export const SignInPage = lazy(() =>
  import('../pages/SignInPage').then((m) => ({ default: m.SignInPage })),
)

export const SignUpPage = lazy(() =>
  import('../pages/SignUpPage').then((m) => ({ default: m.SignUpPage })),
)

export const ForgotPasswordPage = lazy(() =>
  import('../pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)

export const ResetPasswordPage = lazy(() =>
  import('../pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)

export const AuthConfirmPage = lazy(() =>
  import('../pages/AuthConfirmPage').then((m) => ({ default: m.AuthConfirmPage })),
)

export const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

export const NewHouseholdPage = lazy(() =>
  import('../pages/NewHouseholdPage').then((m) => ({ default: m.NewHouseholdPage })),
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
