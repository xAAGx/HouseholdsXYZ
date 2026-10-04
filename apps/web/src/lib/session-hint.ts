import { useEffect, useState } from 'react'

// The homepage doesn't load the Supabase auth client (it stays light), so it
// can't ask whether someone is signed in. This looks for the session Supabase
// keeps in this browser instead. It's only a hint for which buttons to show:
// the app itself still checks the session properly.

function storageKey(): string | null {
  try {
    const ref = new URL(String(import.meta.env.VITE_SUPABASE_URL)).hostname.split('.')[0]
    return ref ? `sb-${ref}-auth-token` : null
  } catch {
    return null
  }
}

export function looksSignedIn(): boolean {
  const key = storageKey()
  if (!key) return false
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return false
    const session = JSON.parse(raw) as { refresh_token?: unknown }
    return typeof session.refresh_token === 'string' && session.refresh_token.length > 0
  } catch {
    return false
  }
}

/** Whether this browser looks signed in; follows sign-ins and sign-outs in other tabs. */
export function useLooksSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(looksSignedIn)
  useEffect(() => {
    const key = storageKey()
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) setSignedIn(looksSignedIn())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return signedIn
}
