import styled from 'styled-components'

import { Icon } from '../../components/icons'
import { Card, IconChip, Muted, Playful, PointsBadge, StatusText } from '../../components/ui'
import { sample } from './content'

/**
 * The hero's sticker board: product mockups that show kids' stuff (points)
 * right next to grown-up stuff (bills, documents). Decorative only.
 *
 * Tilted stickers are a marketing-only device (DESIGN.md → Shape): keep them
 * within ±2°, and never tilt anything inside the app.
 */
export function HeroBoard() {
  return (
    <Board aria-hidden="true">
      <Star viewBox="0 0 24 24">
        <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" />
      </Star>

      <TodaySticker $padding="sm">
        <StickerHead>
          <Playful>Today</Playful>
          <Muted as="span">3 chores</Muted>
        </StickerHead>
        {sample.chores.map((chore) => (
          <ChoreLine key={chore.title} $done={chore.done}>
            <Tick $done={chore.done} />
            <span>{chore.title}</span>
            {chore.points > 0 ? (
              <PointsBadge>+{chore.points}</PointsBadge>
            ) : (
              <Muted as="span">{chore.who}</Muted>
            )}
          </ChoreLine>
        ))}
      </TodaySticker>

      <BillsSticker $padding="sm">
        <StickerHead>
          <Playful>Bills</Playful>
          <Muted as="span">September</Muted>
        </StickerHead>
        {sample.bills.map((bill) => (
          <BillLine key={bill.title}>
            <span>{bill.title}</span>
            <strong>{bill.amount}</strong>
            <StatusText $status={bill.paidBy ? 'success' : 'danger'}>
              {bill.paidBy ? `Paid by ${bill.paidBy}` : bill.status}
            </StatusText>
          </BillLine>
        ))}
      </BillsSticker>

      <EventSticker $padding="sm">
        <small>{sample.event.day}</small>
        <strong>{sample.event.date}</strong>
        <span>{sample.event.title}</span>
      </EventSticker>

      <VaultSticker $padding="sm">
        <IconChip $tone="grape" $size={32}>
          <Icon name="vault" size={16} />
        </IconChip>
        <div>
          <p>{sample.document.title}</p>
          <Muted>Only {sample.document.audience} can see this</Muted>
        </div>
      </VaultSticker>
    </Board>
  )
}

const Board = styled.div`
  position: relative;
  min-height: 540px;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    width: 100%;
    max-width: 540px;
    margin: 0 auto;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    min-height: 530px;
  }
`

const Star = styled.svg`
  position: absolute;
  z-index: 4;
  top: -12px;
  right: 30%;
  width: 46px;
  height: 46px;
  transform: rotate(12deg);

  path {
    fill: ${({ theme }) => theme.colors.primary};
    stroke: ${({ theme }) => theme.colors.outline};
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
`

const Sticker = styled(Card)`
  position: absolute;
`

const StickerHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
  font-size: 19px;
`

const TodaySticker = styled(Sticker)`
  z-index: 2;
  top: 8px;
  left: 0;
  width: 62%;
  transform: rotate(-1.5deg);

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    width: 86%;
  }
`

const ChoreLine = styled.div<{ $done: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.hairline};
  font-size: 15px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};

  > span:first-of-type {
    flex: 1;
    text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
    color: ${({ theme, $done }) => ($done ? theme.colors.textMuted : theme.colors.text)};
  }
`

const Tick = styled.i<{ $done: boolean }>`
  flex: none;
  width: 20px;
  height: 20px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: 50%;
  background: ${({ theme, $done }) => ($done ? theme.colors.accents.grass.base : theme.colors.surface)};
`

const BillsSticker = styled(Sticker)`
  z-index: 3;
  top: 222px;
  right: 0;
  width: 58%;
  transform: rotate(1.5deg);

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    top: 236px;
    width: 84%;
  }
`

const BillLine = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 12px;
  padding: 8px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.hairline};
  font-size: 15px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};

  strong {
    font-variant-numeric: tabular-nums;
  }

  small {
    grid-column: 1 / -1;
  }
`

const EventSticker = styled(Sticker)`
  left: 4%;
  bottom: 24px;
  width: 150px;
  text-align: center;
  background: ${({ theme }) => theme.colors.accents.coral.tint};
  transform: rotate(-2deg);

  small {
    font-size: 12px;
    font-weight: ${({ theme }) => theme.fontWeights.extrabold};
    letter-spacing: ${({ theme }) => theme.letterSpacings.label};
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.accents.coral.deep};
  }

  strong {
    display: block;
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 48px;
    line-height: 1.05;
  }

  span {
    font-size: 14px;
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    display: none;
  }
`

const VaultSticker = styled(Sticker)`
  right: 4%;
  bottom: 0;
  width: 56%;
  display: flex;
  align-items: center;
  gap: 12px;
  background: ${({ theme }) => theme.colors.accents.grape.tint};
  transform: rotate(-1deg);

  p:first-child {
    font-size: 14.5px;
    font-weight: ${({ theme }) => theme.fontWeights.bold};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    left: 4%;
    right: auto;
    width: 84%;
  }
`
