import { test, expect } from '@playwright/test';

test('blog index lists the latest post and post page renders', async ({ page }) => {
  await page.goto('/blog/');

  await expect(page.getByRole('heading', { name: 'Blog' })).toBeVisible();

  const postLink = page.getByRole('link', {
    name: /cross-encoders are dead\. we're scoring with yes\/no logits now\./i,
  });
  await expect(postLink).toBeVisible();

  await postLink.click();
  await expect(page).toHaveURL(/\/blog\/posts\/cross-encoder-paradigm-shift-qwen3-mlx\/?/);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    "Cross-Encoders Are Dead. We're Scoring With Yes/No Logits Now."
  );
});
