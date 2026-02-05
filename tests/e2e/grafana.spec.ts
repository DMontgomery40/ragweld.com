import { test, expect } from '@playwright/test';

test('demo: Grafana tab loads embedded dashboard', async ({ page }) => {
  // Pick a corpus id if available (not strictly required for Grafana embed, but keeps config consistent).
  let corpusId = 'faxbot';
  try {
    const corporaRes = await page.request.get('/api/corpora');
    if (corporaRes.ok()) {
      const corpora = (await corporaRes.json()) as any[];
      const first = Array.isArray(corpora) && corpora.length ? corpora[0] : null;
      corpusId = String(first?.corpus_id || first?.id || corpusId);
    }
  } catch {
    // best-effort
  }

  await page.goto(`/demo/grafana?subtab=dashboard&corpus=${encodeURIComponent(corpusId)}`);
  await expect(page.locator('#tab-grafana')).toBeVisible();

  const iframe = page.locator('#grafana-iframe');
  await expect(iframe).toHaveAttribute('src', /\/demo\/d\//);
  await expect(iframe).toHaveAttribute('src', /embed=1/);

  const frame = page.frameLocator('#grafana-iframe');
  await expect(frame.getByText('Dashboards')).toBeVisible();
  await expect(frame.getByText('Index Snapshot', { exact: true })).toBeVisible();
});
