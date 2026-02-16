import { test, expect } from '@playwright/test';

function isLocalBaseURL(baseURL: string | undefined) {
  if (!baseURL) return true;
  return (
    baseURL.includes('127.0.0.1') ||
    baseURL.includes('localhost') ||
    baseURL.includes('0.0.0.0')
  );
}

test('prod demo: exercise every tab + subtab', async ({ page }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || '');
  test.skip(isLocalBaseURL(baseURL), 'Prod-only: set PLAYWRIGHT_BASE_URL to a deployed site.');
  test.setTimeout(8 * 60_000);

  const failures: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const health = await page.request.get('/api/health');
  expect(health.ok()).toBeTruthy();

  const corporaRes = await page.request.get('/api/corpora');
  expect(corporaRes.ok()).toBeTruthy();

  const corpora = (await corporaRes.json()) as any[];
  expect(Array.isArray(corpora)).toBeTruthy();
  expect(corpora.length).toBeGreaterThan(0);

  const corpusId = String(corpora?.[0]?.corpus_id || corpora?.[0]?.id || 'epstein-files-1');
  const lastIndexed = corpora?.[0]?.last_indexed ?? corpora?.[0]?.lastIndexed ?? null;
  if (!lastIndexed) {
    failures.push(`Corpus "${corpusId}" has no last_indexed (indexing may not have run).`);
  }

  // Visit demo with a selected corpus so RAG tabs have a default target.
  await page.goto(`/demo/?corpus=${encodeURIComponent(corpusId)}`);
  await expect(page.locator('.topbar .brand', { hasText: 'TriBrid RAG' })).toBeVisible();
  await expect(page.locator('[data-testid="tab-bar"]')).toBeVisible();

  // Smoke-check sparse search hits the real backend (verifies DB is populated beyond schema bootstrapping).
  const searchRes = await page.request.post('/api/search', {
    data: { query: 'auth', corpus_id: corpusId, top_k: 5 },
  });
  expect(searchRes.ok()).toBeTruthy();
  const searchJson = (await searchRes.json()) as any;
  expect(Array.isArray(searchJson?.matches)).toBeTruthy();
  if (searchJson.matches.length === 0) {
    failures.push(`Search returned 0 matches for corpus "${corpusId}" (DB likely missing chunks).`);
  }

  const demoRoutes: Array<{ path: string; subtabs?: string[] }> = [
    { path: '/demo/start' },
    { path: '/demo/dashboard', subtabs: ['system', 'monitoring', 'storage', 'help', 'glossary'] },
    { path: '/demo/chat', subtabs: ['ui', 'settings'] },
    { path: '/demo/grafana', subtabs: ['dashboard', 'config'] },
    { path: '/demo/benchmark' },
    {
      path: '/demo/rag',
      subtabs: ['data-quality', 'retrieval', 'graph', 'reranker-config', 'learning-ranker', 'indexing'],
    },
    { path: '/demo/eval', subtabs: ['analysis', 'dataset', 'prompts', 'trace'] },
    { path: '/demo/infrastructure', subtabs: ['services', 'docker', 'mcp', 'paths', 'monitoring'] },
    { path: '/demo/admin', subtabs: ['general', 'secrets', 'integrations'] },
  ];

  for (const route of demoRoutes) {
    const subtabs = route.subtabs?.length ? route.subtabs : [null];
    for (const subtab of subtabs) {
      const url = new URL(route.path, baseURL);
      url.searchParams.set('corpus', corpusId);
      if (subtab) url.searchParams.set('subtab', subtab);

      await page.goto(url.toString());
      await expect(page.locator('.topbar .brand', { hasText: 'TriBrid RAG' })).toBeVisible();
      await expect(page.locator('[data-testid="tab-bar"]')).toBeVisible();

      const retryBtn = page.locator('[aria-label="Retry rendering this section"]');
      if ((await retryBtn.count()) > 0) {
        const card = page.locator('div').filter({ has: retryBtn }).first();
        const title = ((await card.locator('p').first().textContent()) || '').trim();
        const message = ((await card.locator('div.font-mono').first().textContent()) || '').trim();
        const stack = ((await card.locator('pre').first().textContent()) || '').trim();
        failures.push(
          [
            `ErrorBoundary at ${url.pathname}${url.search}: ${title || '(missing title)'}`,
            message ? `message=${message}` : null,
            stack ? `stack=${stack.split('\n').slice(0, 6).join(' | ')}` : null,
          ]
            .filter(Boolean)
            .join(' — ')
        );
        continue;
      }

      if (subtab) {
        const activeStandard = page.locator(`.subtab-bar button.subtab-btn.active[data-subtab="${subtab}"]`);
        if ((await activeStandard.count()) > 0) {
          await expect(activeStandard).toBeVisible();
        } else if (route.path === '/demo/eval') {
          const labelById: Record<string, string> = {
            analysis: 'Eval Analysis',
            dataset: 'Eval Dataset',
            prompts: 'System Prompts',
            trace: 'Trace Viewer',
          };
          await expect(page.getByRole('button', { name: labelById[subtab] || subtab })).toBeVisible();
          await expect(page).toHaveURL(new RegExp(`[?&]subtab=${subtab}([&#]|$)`));
        } else {
          failures.push(`No active subtab indicator found for ${route.path}?subtab=${subtab}`);
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Prod verification failures:\n- ${failures.join('\n- ')}`);
  }
  expect(pageErrors, `pageerror events: ${pageErrors.join('\n')}`).toHaveLength(0);
  expect(consoleErrors, `console.error events: ${consoleErrors.join('\n')}`).toHaveLength(0);
});
