import { test, expect } from '@playwright/test';

test('landing page demo iframe is large and popout works', async ({ page }) => {
  await page.goto('/');

  const docsLinkCount = await page.locator('a[href="https://dmontgomery40.github.io/ragweld/latest/configuration/"]').count();
  expect(docsLinkCount).toBeGreaterThan(0);

  const iframe = page.locator('iframe[title="ragweld Demo"]');
  await expect(iframe).toBeVisible();

  const box = await iframe.boundingBox();
  expect(box?.height || 0).toBeGreaterThan(500);

  await page.getByRole('link', { name: /^epstein files 1$/i }).click();
  await expect(page).toHaveURL(/\/demo\/\?corpus=epstein-files-1/);

  await expect(page.locator('.topbar .brand', { hasText: 'ragweld' })).toBeVisible();
});
