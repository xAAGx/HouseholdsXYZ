import { inviteTokenSchema } from '@households/shared'

// An invite link opened while signed out has to survive sign-up and email
// confirmation, which may happen in another tab. It stays in this browser.
const KEY = 'households.pendingInvite'

export function rememberInvite(token: string): void {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Storage blocked (private mode): the link still works if opened again.
  }
}

export function pendingInvite(): string | null {
  try {
    const token = localStorage.getItem(KEY)
    return token && inviteTokenSchema.safeParse(token).success ? token : null
  } catch {
    return null
  }
}

export function forgetInvite(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored, nothing to forget.
  }
}
