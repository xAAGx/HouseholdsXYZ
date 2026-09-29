import { HOUSEHOLD_PATH_PREFIX } from '@households/shared'
import { createBrowserRouter, type RouteObject } from 'react-router'

import { RequireAuth } from '../features/auth/RequireAuth'
import { HomePage } from '../features/marketing/HomePage'
import { HouseholdPage } from '../pages/HouseholdPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { AuthLayout, DashboardPage, DesignSystemPage, SignInPage } from './lazy-pages'
import { RootLayout, RouteError } from './RootLayout'

// Dev-only routes. `import.meta.env.DEV` is false in production builds, so
// these (and the chunks they import) are dropped from the bundle.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/design', element: <DesignSystemPage /> }]
  : []

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: `${HOUSEHOLD_PATH_PREFIX}/:slug`, element: <HouseholdPage /> },
      {
        element: <AuthLayout />,
        children: [
          { path: '/sign-in', element: <SignInPage /> },
          {
            path: '/app',
            element: (
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            ),
          },
        ],
      },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
