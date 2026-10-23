/**
 * @bilibili/dsh-toy — the Toy publisher bundle for dsh.
 *
 * Host half: registers the model-facing `toy_*` tools, the `toyPublisher`
 * Remote service behind the browser page, and the package precheck. It wraps
 * the official `toy` CLI (https://github.com/bilibili/toy) with two hard rules:
 *
 *   1. an upload only ever produces a preview; submitting for review is an
 *      explicit, user-confirmed second step;
 *   2. an upload is refused while the local content precheck reports an ERROR.
 */

import type { Context } from '@deepseek-ai/cordis'

import { resolveConfig } from './host/config.ts'
import type { Config } from './host/config.ts'
import { ToyController } from './host/controller.ts'
import { createToyService } from './host/service.js'
import type { ToyLogger } from './host/service-api.ts'
import { registerLaunchTools } from './tools.js'

/** Plugin name; also the bundle row's module name. */
export const name = 'toy'

/** The tool registry is the only mandatory service. */
export const inject = ['tools']

/**
 * Apply the bundle.
 * @param rawCtx - cordis context.
 * @param rawConfig - loader configuration from `cordis.patch.yml`.
 */
export function apply(rawCtx: unknown, rawConfig?: Config): void {
  const ctx = rawCtx as Context & { logger?: ToyLogger }
  const config = resolveConfig(rawConfig)
  const logger = ctx.logger ?? {}
  const service = createToyService(config, logger)

  registerLaunchTools(ctx, service)

  // Constructing the Remote service registers `ctx.toyPublisher` for the
  // browser half; the generated `./typert` artifact makes it gateway-visible.
  const controller = new ToyController(ctx, service)
  void controller

  logger.info?.(
    `toy ready: binary=${config.binary === '' ? 'auto' : config.binary}, precheck=${config.precheck}, submit gate=question/approval`,
  )
}

export { resolveConfig } from './host/config.ts'
export type { Config, ResolvedConfig } from './host/config.ts'
export { createToyService } from './host/service.js'
export { ToyController } from './host/controller.ts'
export type { ToyService } from './host/service-api.ts'
export { registerLaunchTools } from './tools.js'
export type * from './shared/types.ts'
