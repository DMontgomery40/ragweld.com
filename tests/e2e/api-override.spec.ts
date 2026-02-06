import { test, expect } from '@playwright/test';

test('chat settings ignore cross-origin api override by default', async ({ page }) => {
  const badApi = encodeURIComponent('https://example.invalid/api');
  await page.goto(`/demo/chat?subtab=settings&corpus=epstein-files-1&api=${badApi}`);

  await expect(page.locator('#tab-chat')).toBeVisible();
  await page.getByRole('button', { name: /^OpenRouter$/ }).click();
  await expect(page.getByRole('heading', { name: 'OpenRouter' }).first()).toBeVisible();
  await expect(page.getByText('Configure OpenRouter and verify your API key status.')).toBeVisible();

  // The override should be ignored; we should never surface the hostile cross-origin host.
  await expect(page.getByText(/example\.invalid/i)).toHaveCount(0);
});
