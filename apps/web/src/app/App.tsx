import { lightTheme } from '@households/theme'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from 'styled-components'

import { queryClient } from '../lib/query-client'
import { GlobalStyle } from '../styles/GlobalStyle'
import { router } from './router'

// Light theme only for now. Dark tokens exist in @households/theme but stay
// off until every screen has been designed and checked in both (DESIGN.md → Dark mode).
export function App() {
  return (
    <ThemeProvider theme={lightTheme}>
      <GlobalStyle />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
