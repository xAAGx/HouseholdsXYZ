import { Outlet } from 'react-router'

import { LiveUpdates } from '../live/LiveUpdates'
import { AuthProvider } from './AuthProvider'

/**
 * Wraps only the routes that need a session. Loaded lazily, so public pages
 * (marketing, public household profiles) never download or initialise the
 * Supabase auth client.
 */
export default function AuthLayout() {
  return (
    <AuthProvider>
      <LiveUpdates />
      <Outlet />
    </AuthProvider>
  )
}
