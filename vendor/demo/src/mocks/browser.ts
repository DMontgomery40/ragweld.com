/**
 * MSW browser worker setup for ragweld demo
 *
 * This file configures the service worker for intercepting
 * API requests in the live demo.
 */

import { setupWorker } from 'msw/browser';

// Handlers are registered dynamically at startup (supports partial mocks + ?mock=1 fallback).
export const worker = setupWorker();
