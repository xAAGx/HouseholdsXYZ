import styled, { css, type DefaultTheme } from 'styled-components'

import { container } from './mixins'

/** A step on the theme's spacing scale. */
type Gap = Exclude<keyof DefaultTheme['space'], 0>

/** Centers content at the standard max width with side gutters. */
export const Container = styled.div`
  ${container};
`

/**
 * A vertical band of the page. `inverse` is the dark band (use once or twice
 * per page, for weight); `tint` is the warm yellow band for closing CTAs.
 */
export const Section = styled.section<{ $tone?: 'default' | 'inverse' | 'tint' }>`
  padding-top: ${({ theme }) => theme.layout.sectionGap}px;

  ${({ $tone, theme }) =>
    $tone === 'inverse' &&
    css`
      margin-top: ${theme.layout.sectionGap}px;
      padding-bottom: ${theme.layout.sectionGap}px;
      background: ${theme.colors.inverse};
      color: ${theme.colors.onInverse};
    `}

  ${({ $tone, theme }) =>
    $tone === 'tint' &&
    css`
      margin-top: ${theme.layout.sectionGap}px;
      padding-bottom: ${theme.layout.sectionGap}px;
      background: ${theme.colors.accents.yellow.tint};
      border-top: ${theme.borderWidths.outline}px solid ${theme.colors.outline};
      border-bottom: ${theme.borderWidths.outline}px solid ${theme.colors.outline};
    `}
`

/** Title block at the top of a section. */
export const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  margin-bottom: 40px;
`

export const Stack = styled.div<{ $gap?: Gap; $align?: 'start' | 'center' | 'stretch' }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $gap = 4 }) => theme.space[$gap]}px;
  align-items: ${({ $align = 'stretch' }) =>
    $align === 'start' ? 'flex-start' : $align === 'center' ? 'center' : 'stretch'};
`

export const Row = styled.div<{ $gap?: Gap; $justify?: 'start' | 'between' | 'end' }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme, $gap = 3 }) => theme.space[$gap]}px;
  justify-content: ${({ $justify = 'start' }) =>
    $justify === 'between' ? 'space-between' : $justify === 'end' ? 'flex-end' : 'flex-start'};
`

/**
 * Responsive grid. Columns collapse at the tablet and phone breakpoints, so
 * pages never need their own media queries for simple card grids.
 */
export const Grid = styled.div<{ $columns?: 2 | 3 | 4; $gap?: Gap }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns = 3 }) => $columns}, minmax(0, 1fr));
  gap: ${({ theme, $gap = 5 }) => theme.space[$gap]}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: repeat(${({ $columns = 3 }) => Math.min($columns, 2)}, minmax(0, 1fr));
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

/** Page wrapper for app screens (signed-in areas, forms, errors). */
export const Page = styled.main<{ $narrow?: boolean }>`
  ${container};
  max-width: ${({ $narrow, theme }) => ($narrow ? 480 : theme.layout.containerMax)}px;
  padding-top: ${({ theme }) => theme.space[7]}px;
  padding-bottom: ${({ theme }) => theme.space[9]}px;
`
