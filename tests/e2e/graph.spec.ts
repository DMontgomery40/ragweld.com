import { test, expect } from '@playwright/test';

test('graph explorer loads entities and shows neighbors', async ({ page }) => {
  await page.goto('/demo/rag?subtab=graph&corpus=faxbot&mock=1');

  await expect(page.getByTestId('graph-subtab')).toBeVisible();

  // Trigger an entity load (empty query => top entities).
  await page.getByTestId('graph-search-btn').click();

  // Wait for non-zero entity count.
  await expect(page.getByTestId('graph-entity-count')).not.toHaveText(/^0 shown$/);

  const relCount = page.getByTestId('graph-relationship-count');

  // Click the first entity in the list. The backend sorts by degree so this should have neighbors.
  const firstEntity = page.getByTestId('graph-entities').locator('button').first();
  await expect(firstEntity).toBeVisible();
  await firstEntity.click();

  await expect(relCount).toBeVisible();
  await expect.poll(async () => {
    const txt = (await relCount.textContent()) || '';
    return Number((txt.match(/(\d+)/)?.[1] || '0'));
  }).toBeGreaterThan(0);
});
