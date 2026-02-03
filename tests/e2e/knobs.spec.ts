import { test, expect } from '@playwright/test';

test('knobs registry loads and lists config paths', async ({ page }) => {
  await page.goto('/knobs');

  await expect(page.getByRole('heading', { name: /knob registry/i })).toBeVisible();
  await expect(page.locator('#knob-search')).toBeVisible();

  // Spot-check a known knob.
  await expect(page.getByText('retrieval.final_k', { exact: false })).toBeVisible();
});

