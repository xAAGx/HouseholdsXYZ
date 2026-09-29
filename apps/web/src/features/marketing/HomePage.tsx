import { createGlobalStyle } from 'styled-components'

import { MarketingFooter } from './MarketingFooter'
import { MarketingNav } from './MarketingNav'
import { ClosingSection } from './sections/ClosingSection'
import { FeaturesSection } from './sections/FeaturesSection'
import { GenerationsSection } from './sections/GenerationsSection'
import { HeroSection } from './sections/HeroSection'
import { PricingSection } from './sections/PricingSection'
import { PrivacySection } from './sections/PrivacySection'
import { StepsSection } from './sections/StepsSection'
import { TogetherSection } from './sections/TogetherSection'

/**
 * households.xyz: the marketing homepage and the reference implementation
 * of the design system. When in doubt about how something should look, check
 * how it's done here and in DESIGN.md.
 */
export function HomePage() {
  return (
    <>
      <SmoothScroll />
      <MarketingNav />
      <main>
        <HeroSection />
        <GenerationsSection />
        <FeaturesSection />
        <PrivacySection />
        <TogetherSection />
        <StepsSection />
        <PricingSection />
        <ClosingSection />
      </main>
      <MarketingFooter />
    </>
  )
}

const SmoothScroll = createGlobalStyle`
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`
