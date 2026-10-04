import { lazy } from 'react'

// Everything behind AuthLayout loads on demand: it pulls in Supabase auth,
// which the marketing pages never need.

export const AuthLayout = lazy(() => import('../features/auth/AuthLayout'))

/** Members' view and public profiles. Needs the session to tell them apart. */
export const HouseholdPage = lazy(() =>
  import('../pages/HouseholdPage').then((m) => ({ default: m.HouseholdPage })),
)

export const HouseholdSettingsPage = lazy(() =>
  import('../pages/HouseholdSettingsPage').then((m) => ({ default: m.HouseholdSettingsPage })),
)

export const InvitePage = lazy(() =>
  import('../pages/InvitePage').then((m) => ({ default: m.InvitePage })),
)

export const ListsPage = lazy(() =>
  import('../pages/ListsPage').then((m) => ({ default: m.ListsPage })),
)

export const ListPage = lazy(() =>
  import('../pages/ListPage').then((m) => ({ default: m.ListPage })),
)

export const ChoresPage = lazy(() =>
  import('../pages/ChoresPage').then((m) => ({ default: m.ChoresPage })),
)

export const NotificationsPage = lazy(() =>
  import('../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)

export const HouseholdLinkPage = lazy(() =>
  import('../pages/HouseholdLinkPage').then((m) => ({ default: m.HouseholdLinkPage })),
)

export const CalendarPage = lazy(() =>
  import('../pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
)

export const RecipePage = lazy(() =>
  import('../pages/RecipePage').then((m) => ({ default: m.RecipePage })),
)

export const MealsPage = lazy(() =>
  import('../pages/MealsPage').then((m) => ({ default: m.MealsPage })),
)

export const MoneyPage = lazy(() =>
  import('../pages/MoneyPage').then((m) => ({ default: m.MoneyPage })),
)

export const ChatPage = lazy(() =>
  import('../pages/ChatPage').then((m) => ({ default: m.ChatPage })),
)

export const DocumentsPage = lazy(() =>
  import('../pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
)

export const AccountPage = lazy(() =>
  import('../pages/AccountPage').then((m) => ({ default: m.AccountPage })),
)

export const MfaVerifyPage = lazy(() =>
  import('../pages/MfaVerifyPage').then((m) => ({ default: m.MfaVerifyPage })),
)

export const ChildSignInPage = lazy(() =>
  import('../pages/ChildSignInPage').then((m) => ({ default: m.ChildSignInPage })),
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
