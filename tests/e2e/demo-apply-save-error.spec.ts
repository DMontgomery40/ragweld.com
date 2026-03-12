import { test, expect, type Page } from '@playwright/test';

async function failFirstConfigSave(page: Page) {
  await page.addInitScript(() => {
    let failedOnce = false;

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function open(method: string, url: string | URL, ...rest: any[]) {
      (this as XMLHttpRequest & { __failNextConfigSave?: boolean }).__failNextConfigSave =
        String(method || '').toUpperCase() === 'PUT' && String(url || '').includes('/api/config');
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function send(...rest: any[]) {
      const xhr = this as XMLHttpRequest & { __failNextConfigSave?: boolean };
      if (xhr.__failNextConfigSave && !failedOnce) {
        failedOnce = true;
        xhr.setRequestHeader('x-ragweld-test-fail-save', '1');
      }
      return originalSend.apply(xhr, rest);
    };
  });
}

async function openDemoSettings(page: Page) {
  await page.goto('/demo/chat?subtab=settings&mock=1&corpus=epstein-files-1');

  await expect(page.locator('#tab-chat')).toBeVisible();
  await expect(page.locator('#chat-prompt-system_prompt_base')).toBeVisible();
}

test('demo apply footer clears stale save errors after the next dirty config edit', async ({ page }) => {
  await failFirstConfigSave(page);
  await openDemoSettings(page);

  const promptField = page.locator('#chat-prompt-system_prompt_base');
  const saveButton = page.locator('#save-btn');
  const saveError = page.locator('.save-error-text');

  await promptField.fill('First edit to make the config dirty.');
  await expect(saveButton).toBeEnabled();

  await saveButton.click();
  await expect(saveError).toContainText(/failed|500/i);

  await promptField.fill('Second edit should clear the stale footer error.');
  await expect(saveError).toHaveCount(0);
});

test('demo apply footer clears stale save errors after reverting back to the clean baseline', async ({ page }) => {
  await failFirstConfigSave(page);
  await openDemoSettings(page);

  const promptField = page.locator('#chat-prompt-system_prompt_base');
  const saveButton = page.locator('#save-btn');
  const saveError = page.locator('.save-error-text');
  const originalPrompt = await promptField.inputValue();

  await promptField.fill('First edit to make the config dirty.');
  await expect(saveButton).toBeEnabled();

  await saveButton.click();
  await expect(saveError).toContainText(/failed|500/i);

  await promptField.fill(originalPrompt);
  await expect(saveError).toHaveCount(0);
  await expect(saveButton).toBeDisabled();
});
