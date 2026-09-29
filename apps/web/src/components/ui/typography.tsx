import styled from 'styled-components'

/**
 * Type roles. Bricolage Grotesque for titles, Figtree for everything you
 * read, Fredoka only through <Playful> and a few badge components. See
 * DESIGN.md → Typography.
 */

const displayFace = `
  text-wrap: balance;
`

/** Marketing hero title. One per page. */
export const HeroTitle = styled.h1`
  ${displayFace};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: clamp(
    ${({ theme }) => theme.fontSizes['4xl']}px,
    5.8vw,
    ${({ theme }) => theme.fontSizes['6xl']}px
  );
  line-height: ${({ theme }) => theme.lineHeights.tight};
  letter-spacing: ${({ theme }) => theme.letterSpacings.display};
`

/** Title of an app screen ("Your households"). One per page. */
export const PageTitle = styled.h1`
  ${displayFace};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: clamp(28px, 3.6vw, 40px);
  line-height: 1.1;
  letter-spacing: ${({ theme }) => theme.letterSpacings.heading};
`

/** Section heading (h2). */
export const SectionTitle = styled.h2<{ $onInverse?: boolean }>`
  ${displayFace};
  max-width: 16em;
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: clamp(
    ${({ theme }) => theme.fontSizes['3xl']}px,
    4.2vw,
    ${({ theme }) => theme.fontSizes['5xl']}px
  );
  line-height: 1.05;
  letter-spacing: ${({ theme }) => theme.letterSpacings.heading};
  color: ${({ theme, $onInverse }) => ($onInverse ? theme.colors.onInverse : theme.colors.text)};
`

/** Heading of a card, list item or form section (h3). */
export const CardTitle = styled.h3<{ $onInverse?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme }) => theme.fontSizes.xl}px;
  line-height: ${({ theme }) => theme.lineHeights.snug};
  letter-spacing: ${({ theme }) => theme.letterSpacings.snug};
  color: ${({ theme, $onInverse }) => ($onInverse ? theme.colors.onInverse : theme.colors.text)};
`

/** Small uppercase label above a section title. */
export const Eyebrow = styled.p<{ $onInverse?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: ${({ theme }) => theme.fontWeights.extrabold};
  font-size: 13px;
  letter-spacing: ${({ theme }) => theme.letterSpacings.label};
  text-transform: uppercase;
  color: ${({ theme, $onInverse }) => ($onInverse ? theme.colors.primary : theme.colors.eyebrow)};
`

/** Intro paragraph under a hero or page title. */
export const Lede = styled.p<{ $onInverse?: boolean }>`
  max-width: 32em;
  font-size: ${({ theme }) => theme.fontSizes.xl}px;
  line-height: ${({ theme }) => theme.lineHeights.normal};
  color: ${({ theme, $onInverse }) =>
    $onInverse ? theme.colors.onInverseMuted : theme.colors.textMuted};
`

/** Body copy. */
export const Text = styled.p<{ $onInverse?: boolean }>`
  font-size: ${({ theme }) => theme.fontSizes.md}px;
  line-height: ${({ theme }) => theme.lineHeights.normal};
  color: ${({ theme, $onInverse }) =>
    $onInverse ? theme.colors.onInverseMuted : theme.colors.textMuted};
`

/** Secondary details: timestamps, counts, helper lines. */
export const Muted = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
`

/** Yellow marker behind a few words. At most one per view. */
export const Highlight = styled.span`
  padding: 0 0.06em;
  background: linear-gradient(
    transparent 58%,
    ${({ theme }) => theme.colors.primary} 58%,
    ${({ theme }) => theme.colors.primary} 92%,
    transparent 92%
  );
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
`

/**
 * The playful face (Fredoka). For short labels only: sticker titles, points,
 * the logo. Never for headlines, body text, money, documents or errors.
 */
export const Playful = styled.span`
  font-family: ${({ theme }) => theme.fonts.playful};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`
