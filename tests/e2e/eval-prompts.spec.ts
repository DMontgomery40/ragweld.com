import { test, expect } from '@playwright/test';

test('eval prompts subtab shows expected prompt categories and cards', async ({ page }) => {
  await page.goto('/demo/eval?subtab=prompts&corpus=epstein-files-1&mock=1');

  await expect(page.getByRole('button', { name: 'Eval Analysis' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eval Dataset' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'System Prompts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trace Viewer' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'System Prompts' })).toBeVisible();
  await expect(
    page.getByText(/Edit LLM system prompts that affect RAG pipeline behavior\./)
  ).toBeVisible();

  const mainChatCard = page.locator('#prompt-card-main_rag_chat');
  await expect(mainChatCard).toBeVisible();
  await expect(mainChatCard.getByText('Main RAG Chat')).toBeVisible();
  await expect(mainChatCard.getByText('You are a helpful agentic RAG database assistant.')).toBeVisible();
  await expect(mainChatCard.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(mainChatCard.getByRole('button', { name: 'Reset' })).toBeVisible();

  const legacyBaseCard = page.locator('#prompt-card-system_prompt_base');
  await expect(legacyBaseCard).toBeVisible();
  await expect(legacyBaseCard.getByText('Base prompt (legacy)')).toBeVisible();
  await expect(legacyBaseCard.getByText('Chat prompt: system_prompt_base')).toBeVisible();
  await expect(legacyBaseCard.getByRole('button', { name: 'Open Chat Settings' })).toBeVisible();

  const retrievalCard = page.locator('#prompt-card-query_expansion');
  await expect(retrievalCard).toBeVisible();
  await expect(retrievalCard.getByText('Query Expansion')).toBeVisible();
  await expect(retrievalCard.getByText('You are a database search query expander')).toBeVisible();

  const indexingCard = page.locator('#prompt-card-semantic_chunk_summaries');
  await expect(indexingCard).toBeVisible();
  await expect(indexingCard.getByText('Semantic Chunk Summaries')).toBeVisible();
  await expect(indexingCard.getByText('Analyze this database chunk and create a comprehensive JSON summary')).toBeVisible();

  const evalCard = page.locator('#prompt-card-eval_analysis');
  await expect(evalCard).toBeVisible();
  await expect(evalCard.getByText('Eval Analysis')).toBeVisible();
  await expect(evalCard.getByText('You are an expert RAG (Retrieval-Augmented Generation) system analyst.')).toBeVisible();
});
