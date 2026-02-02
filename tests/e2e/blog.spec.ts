import { test, expect } from '@playwright/test';

test('blog index lists the first post and post page renders', async ({ page }) => {
  await page.goto('/blog/');

  await expect(page.getByRole('heading', { name: 'Blog' })).toBeVisible();

  const postLink = page.getByRole('link', {
    name: /when to query chat memory vs\. your corpus/i,
  });
  await expect(postLink).toBeVisible();

  await postLink.click();
  await expect(page).toHaveURL(/\/blog\/posts\/when-to-query-chat-memory-vs-your-corpus\/?/);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'When to Query Chat Memory vs. Your Corpus (And When to Do Both)'
  );
});

