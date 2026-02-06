import { test, expect } from '@playwright/test';

test('blog index lists the latest post and post page renders', async ({ page }) => {
  await page.goto('/blog/');

  await expect(page.getByRole('heading', { name: 'Blog' })).toBeVisible();

  const postLink = page.getByRole('link', {
    name: /qwen3 lora learning reranker on apple silicon/i,
  });
  await expect(postLink).toBeVisible();

  await postLink.click();
  await expect(page).toHaveURL(/\/blog\/posts\/learning-reranker-qwen3-mlx\/?/);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Qwen3 LoRA Learning Reranker on Apple Silicon'
  );
});
