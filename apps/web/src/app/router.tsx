import type { ReactNode } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'

import { RequireAuth } from '../features/auth/RequireAuth'
import { HomePage } from '../features/marketing/HomePage'
import { LegalPage } from '../pages/LegalPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import {
  AuthConfirmPage,
  AuthLayout,
  ChildSignInPage,
  DashboardPage,
  DesignSystemPage,
  ForgotPasswordPage,
  HouseholdPage,
  HouseholdSettingsPage,
  InvitePage,
  NewHouseholdPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
} from './lazy-pages'
import { RootLayout, RouteError } from './RootLayout'

// Dev-only routes. `import.meta.env.DEV` is false in production builds, so
// these (and the chunks they import) are dropped from the bundle.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/design', element: <DesignSystemPage /> }]
  : []

const signedIn = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/terms', element: <LegalPage title="Terms of Service" /> },
      { path: '/privacy', element: <LegalPage title="Privacy Policy" /> },
      {
        element: <AuthLayout />,
        children: [
          // Household addresses: /us/california/san-francisco/TheSmiths
          { path: '/:country/:region/:city/:name', element: <HouseholdPage /> },
          {
            path: '/:country/:region/:city/:name/settings',
            element: signedIn(<HouseholdSettingsPage />),
          },
          { path: '/invite', element: <InvitePage /> },
          { path: '/sign-in', element: <SignInPage /> },
          { path: '/sign-in/child', element: <ChildSignInPage /> },
          { path: '/sign-up', element: <SignUpPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
          { path: '/auth/confirm', element: <AuthConfirmPage /> },
          { path: '/app', element: signedIn(<DashboardPage />) },
          { path: '/households/new', element: signedIn(<NewHouseholdPage />) },
        ],
      },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
