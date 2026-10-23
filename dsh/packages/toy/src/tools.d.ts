/**
 * Type face for `src/tools.js`: the model-facing tool registration, kept in
 * plain ESM so its existing tests keep exercising the JavaScript directly.
 */

import type { ToyService } from './host/service-api.ts'

/** Register the model-facing `toy_*` tools against the shared service. */
export function registerLaunchTools(ctx: unknown, service: ToyService): void
