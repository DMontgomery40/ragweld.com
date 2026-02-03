import { test, expect } from '@playwright/test';

test('knobs redirects to glossary and glossary renders', async ({ page }) => {
  await page.goto('/knobs');

  await expect(page).toHaveURL(/\/glossary\/?$/);
  await expect(page.getByRole('heading', { name: /parameter glossary/i })).toBeVisible();
  await expect(page.locator('#glossary-search')).toBeVisible();

  // Spot-check a known term.
  await expect(page.getByRole('heading', { name: /active repository/i })).toBeVisible();
  await expect(page.getByText('REPO', { exact: true }).first()).toBeVisible();
});

test('raw knob registry still loads and lists config paths', async ({ page }) => {
  await page.goto('/knobs/raw');

  await expect(page.getByRole('heading', { name: /knob registry/i })).toBeVisible();
  await expect(page.locator('#knob-search')).toBeVisible();

  // Spot-check a known knob.
  await expect(page.getByText('retrieval.final_k', { exact: false })).toBeVisible();
});
