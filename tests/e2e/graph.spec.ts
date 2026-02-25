import { test, expect } from '@playwright/test';

test('graph explorer auto-loads entities and can render visualization canvas', async ({ page }) => {
  await page.goto('/demo/rag?subtab=graph&corpus=epstein-files-1&mock=1');

  await expect(page.getByTestId('graph-subtab')).toBeVisible();

  await expect.poll(async () => {
    const txt = (await page.getByTestId('graph-entity-count').textContent()) || '';
    return Number((txt.match(/(\d+)/)?.[1] || '0'));
  }).toBeGreaterThan(0);

  // Visualizer should be the default view.
  await expect(page.getByTestId('graph-viz-canvas')).toBeVisible();
  await expect(page.getByTestId('graph-viz-canvas').locator('canvas')).toBeVisible();
});

test('graph explorer loads entities and shows neighbors', async ({ page }) => {
  await page.goto('/demo/rag?subtab=graph&corpus=epstein-files-1&mock=1');

  await expect(page.getByTestId('graph-subtab')).toBeVisible();
  await page.getByTestId('graph-view-table').click();

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
