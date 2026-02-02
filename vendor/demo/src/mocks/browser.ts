/**
 * MSW browser worker setup for ragweld demo
 *
 * This file configures the service worker for intercepting
 * API requests in the live demo.
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
