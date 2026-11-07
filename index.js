/**
 * Host half of dsh-token-bill: registers the `dshTokenBill` session projection.
 *
 * The bundle has no runtime dependencies on purpose — config is read from the
 * Loader row as-is (no Config schema) — so it installs straight from a Git
 * URL or a linked folder without a registry round trip. See README.md for the
 * config fields; `lib/pricing.js` resolves them and never throws on bad input.
 */
import { createTokenCostProjection } from './lib/fold.js'
import { resolvePricing } from './lib/pricing.js'

export const name = 'dsh-token-bill'

export const inject = ['sessionProjections']

/**
 * Register the projection under this plugin's fiber; unloading the plugin
 * releases it. A config edit restarts the plugin, which re-prices every view.
 * @param {object} ctx - Cordis context with the `sessionProjections` service.
 * @param {unknown} config - raw row config from `cordis.patch.yml`.
 */
export async function apply(ctx, config) {
  const pricing = resolvePricing(config)
  await ctx.sessionProjections.register(createTokenCostProjection(pricing))
}
