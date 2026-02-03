import { test, expect } from '@playwright/test';

test('landing page demo iframe is large and popout works', async ({ page }) => {
  await page.goto('/');

  const iframe = page.locator('iframe[title="ragweld Demo"]');
  await expect(iframe).toBeVisible();

  const box = await iframe.boundingBox();
  expect(box?.height || 0).toBeGreaterThan(500);

  await page.getByRole('link', { name: /^faxbot$/i }).click();
  await expect(page).toHaveURL(/\/demo\/\?corpus=faxbot/);

  await expect(page.locator('.topbar .brand', { hasText: 'TriBrid RAG' })).toBeVisible();
});
