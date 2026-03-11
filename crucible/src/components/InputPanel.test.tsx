// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeEstimateRequest } from '../engine/__tests__/helpers'
import { InputPanel } from './InputPanel'

describe('InputPanel help tooltips', () => {
  it('opens and closes help content on click', async () => {
    const user = userEvent.setup()

    render(
      <InputPanel
        value={makeEstimateRequest()}
        onChange={vi.fn()}
        estimate={null}
        pricing={[]}
        pricingLoading={false}
        onResolveModel={async () => {}}
        modelResolveLoading={false}
        modelResolveError={null}
        modelResolveMessage={null}
      />,
    )

    const tooltipButton = screen.getByRole('button', { name: 'Model preset help' })

    expect(tooltipButton.getAttribute('aria-expanded')).toBe('false')

    await user.click(tooltipButton)
    expect(tooltipButton.getAttribute('aria-expanded')).toBe('true')

    await user.click(tooltipButton)
    expect(tooltipButton.getAttribute('aria-expanded')).toBe('false')
  })

  it('filters QAT schemes to the selected target precision and hides fixed-profile quantization controls', () => {
    render(
      <InputPanel
        value={makeEstimateRequest({
          method: 'LoRA',
          quantization_bits: 8,
          quantization_profile: 'int8',
          use_qat: true,
          qat_scheme: 'fp8-fp8',
        })}
        onChange={vi.fn()}
        estimate={null}
        pricing={[]}
        pricingLoading={false}
        onResolveModel={async () => {}}
        modelResolveLoading={false}
        modelResolveError={null}
        modelResolveMessage={null}
      />,
    )

    expect(screen.queryByRole('combobox', { name: 'Quantization profile' })).toBeNull()

    expect(screen.getAllByText('QAT scheme').length).toBeGreaterThan(0)

    const qatScheme = screen.getByDisplayValue('FP8 -> FP8')
    expect(within(qatScheme).getByRole('option', { name: 'FP8 -> FP8' })).toBeTruthy()
    expect(within(qatScheme).queryByRole('option', { name: 'INT4' })).toBeNull()
  })

  it('frames MoE active params as per-token compute rather than total model size', () => {
    render(
      <InputPanel
        value={makeEstimateRequest({
          architecture: 'MoE',
          model_params_billions: 32.76,
          model_active_params_billions: 6,
        })}
        onChange={vi.fn()}
        estimate={null}
        pricing={[]}
        pricingLoading={false}
        onResolveModel={async () => {}}
        modelResolveLoading={false}
        modelResolveError={null}
        modelResolveMessage={null}
      />,
    )

    expect(screen.getAllByText('Active params / token (B)').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        /This changes compute\/time only; total params still drive VRAM and model capacity\./,
      ).length,
    ).toBeGreaterThan(0)
  })
})
