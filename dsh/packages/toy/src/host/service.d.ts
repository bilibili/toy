/**
 * Type face for `src/host/service.js` (plain ESM, so the existing unit tests and
 * the tool half share one implementation). The runtime module is bundled by
 * tsdown; TypeScript resolves this declaration for the Remote controller.
 */

import type { ToyLogger, ToyService, ToyServiceConfig } from './service-api.ts'

/** Create the shared Host operations for one plugin instance. */
export function createToyService(config: ToyServiceConfig, logger?: ToyLogger): ToyService
