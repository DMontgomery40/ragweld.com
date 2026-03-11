import { describe, expect, it } from 'vitest'
import { INPUT_PANEL_HELP, type CrucibleHelpCard } from './inputPanelHelp'

function collectHelpCards(value: unknown): CrucibleHelpCard[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectHelpCards(entry))
  }

  if (typeof value !== 'object' || value === null) {
    return []
  }

  if ('id' in value && 'title' in value && 'short' in value) {
    return [value as CrucibleHelpCard]
  }

  return Object.values(value).flatMap((entry) => collectHelpCards(entry))
}

describe('INPUT_PANEL_HELP', () => {
  it('keeps every help card on the rich tooltip format', () => {
    const cards = collectHelpCards(INPUT_PANEL_HELP)

    expect(cards.length).toBe(57)

    for (const card of cards) {
      expect(card.sections?.length ?? 0, `${card.id} should include structured sections`).toBeGreaterThanOrEqual(2)
      expect(card.sources?.length ?? 0, `${card.id} should include source links`).toBeGreaterThanOrEqual(2)
    }
  })
})
