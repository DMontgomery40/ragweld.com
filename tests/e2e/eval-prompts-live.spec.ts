import { test, expect } from '@playwright/test';

test('live demo backend: eval prompts subtab shows prompt parity', async ({ page }) => {
  await page.goto('/demo/eval?subtab=prompts&corpus=epstein-files-1');

  await expect(page.getByRole('button', { name: 'Eval Analysis' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eval Dataset' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'System Prompts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trace Viewer' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'System Prompts' })).toBeVisible();
  await expect(
    page.getByText(/Edit LLM system prompts that affect RAG pipeline behavior\./)
  ).toBeVisible();

  await expect(page.locator('#prompt-card-main_rag_chat')).toContainText(
    'You are a helpful agentic RAG database assistant.'
  );
  await expect(page.locator('#prompt-card-system_prompt_rag')).toContainText(
    'You are a database assistant powered by TriBridRAG'
  );
  await expect(page.locator('#prompt-card-query_expansion')).toContainText(
    'You are a database search query expander'
  );
  await expect(page.locator('#prompt-card-semantic_kg_extraction')).toContainText(
    'You are a semantic knowledge graph extractor.'
  );
  await expect(page.locator('#prompt-card-eval_analysis')).toContainText(
    'You are an expert RAG (Retrieval-Augmented Generation) system analyst.'
  );
});
