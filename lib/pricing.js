/**
 * Price tables, DeepSeek peak/off-peak tiers, and the priced client view.
 *
 * Pure module with no Harness imports, so the same code runs inside the Host
 * and under plain `node --test`. Every price is per one million tokens.
 */

/** Date the built-in DeepSeek table was last checked against the official page. */
export const PRICES_AS_OF = '2026-11-07'

/** Official price page the built-in table mirrors. */
export const PRICE_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing'

/** One rate card: per-1M-token prices for each billed bucket. */
function rate(input, cacheHit, output) {
  return Object.freeze({ input, cacheHit, cacheWrite: input, output })
}

/**
 * Official DeepSeek API prices. Off-peak is half of peak; see {@link tierAt}.
 * Cache writes are billed as ordinary (cache-miss) input.
 */
export const BUILTIN_PRICES = Object.freeze({
  'deepseek-flash': Object.freeze({
    CNY: Object.freeze({ peak: rate(2, 0.04, 8), offPeak: rate(1, 0.02, 4) }),
    USD: Object.freeze({ peak: rate(0.3, 0.006, 1.2), offPeak: rate(0.15, 0.003, 0.6) }),
  }),
  'deepseek-v4-pro': Object.freeze({
    CNY: Object.freeze({ peak: rate(9, 0.3, 27), offPeak: rate(4.5, 0.15, 13.5) }),
    USD: Object.freeze({ peak: rate(1.32, 0.044, 3.96), offPeak: rate(0.66, 0.022, 1.98) }),
  }),
})

/** Retired model ids the API still accepts and bills at another model's price. */
export const MODEL_ALIASES = Object.freeze({
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
})

/**
 * Days off under the State Council's 2026 holiday notice (2025-11-04), as
 * Beijing dates. Weekends are off-peak anyway; listing whole breaks keeps the
 * table easy to check against the notice. Make-up workdays on weekends stay
 * off-peak, because DeepSeek's rule counts every weekend as off-peak.
 */
export const CN_HOLIDAYS = Object.freeze([
  // New Year
  '2026-01-01', '2026-01-02', '2026-01-03',
  // Spring Festival
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  // Qingming
  '2026-04-04', '2026-04-05', '2026-04-06',
  // Labour Day
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  // Dragon Boat
  '2026-06-19', '2026-06-20', '2026-06-21',
  // Mid-Autumn
  '2026-09-25', '2026-09-26', '2026-09-27',
  // National Day
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
])

/** Peak windows in Beijing minutes after midnight, as [start, end). */
export const PEAK_WINDOWS = Object.freeze([[9 * 60, 12 * 60], [14 * 60, 18 * 60]])

/** Beijing has no daylight saving time, so a fixed offset is exact. */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** The two billing tiers every ledger entry keeps apart. */
export const TIERS = Object.freeze(['peak', 'offPeak'])

const CURRENCY_SYMBOLS = Object.freeze({ CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$' })

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Beijing calendar facts of one instant.
 * @param {number} time - epoch milliseconds.
 * @returns {{ date: string, weekday: number, minute: number }} ISO date, 0 = Sunday, minutes after midnight.
 */
export function beijingParts(time) {
  const shifted = new Date(time + BEIJING_OFFSET_MS)
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

/**
 * DeepSeek billing tier of one instant: peak is Beijing time Monday to Friday,
 * 09:00-12:00 and 14:00-18:00, except Chinese public holidays; everything else
 * is off-peak. An instant that cannot be read counts as peak, the higher price.
 * @param {number} time - epoch milliseconds of the billed event.
 * @param {ReadonlySet<string>} holidays - Beijing dates (YYYY-MM-DD) that are off-peak all day.
 * @returns {'peak' | 'offPeak'} the tier.
 */
export function tierAt(time, holidays) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return 'peak'
  const { date, weekday, minute } = beijingParts(time)
  if (weekday === 0 || weekday === 6 || holidays.has(date)) return 'offPeak'
  for (const [start, end] of PEAK_WINDOWS) {
    if (minute >= start && minute < end) return 'peak'
  }
  return 'offPeak'
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A non-negative finite price; numeric strings are accepted because YAML authors quote numbers. */
function price(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : undefined
}

/**
 * Normalize one user rate card. `input` and `output` are required unless the
 * base supplies them; `cacheHit` and `cacheWrite` default to the input price.
 * The v1 names `inputPrice`, `cacheHitPrice`, and `outputPrice` are accepted.
 * @param {unknown} raw - user value.
 * @param {object} [base] - rate card the missing fields inherit from.
 * @returns {object | undefined} a complete rate card, or undefined when unusable.
 */
export function normalizeRate(raw, base) {
  if (!isObject(raw)) return undefined
  const input = price(raw.input ?? raw.inputPrice) ?? base?.input
  const output = price(raw.output ?? raw.outputPrice) ?? base?.output
  if (input === undefined || output === undefined) return undefined
  const cacheHit = price(raw.cacheHit ?? raw.cacheRead ?? raw.cacheHitPrice) ?? base?.cacheHit ?? input
  const cacheWrite = price(raw.cacheWrite ?? raw.cacheWritePrice) ?? base?.cacheWrite ?? input
  return Object.freeze({ input, cacheHit, cacheWrite, output })
}

/**
 * Normalize one user price entry: a rate card plus an optional `offPeak` card
 * whose missing fields inherit from the main one.
 * @param {unknown} raw - user value.
 * @returns {{ peak: object, offPeak?: object } | undefined} the entry, or undefined when unusable.
 */
export function normalizeEntry(raw) {
  const peak = normalizeRate(raw)
  if (peak === undefined) return undefined
  const offPeak = isObject(raw.offPeak) ? normalizeRate(raw.offPeak, peak) : undefined
  return Object.freeze(offPeak === undefined ? { peak } : { peak, offPeak })
}

/**
 * Resolve the plugin's raw config into the pricing used by the fold and view.
 * Unknown or malformed fields fall back to defaults instead of failing, so a
 * typo never takes the badge down.
 * @param {unknown} config - the Loader row's config object.
 * @returns {object} frozen pricing facts plus `priceFor(provider, model)`.
 */
export function resolvePricing(config) {
  const cfg = isObject(config) ? config : {}
  const currency = typeof cfg.currency === 'string' && cfg.currency.trim() !== ''
    ? cfg.currency.trim().toUpperCase()
    : 'CNY'
  const symbol = typeof cfg.symbol === 'string' ? cfg.symbol : CURRENCY_SYMBOLS[currency] ?? `${currency} `
  const timeOfDay = cfg.timeOfDayPricing !== false
  const extraHolidays = Array.isArray(cfg.holidays)
    ? cfg.holidays.filter(day => typeof day === 'string' && DATE_PATTERN.test(day.trim())).map(day => day.trim())
    : []
  const holidays = new Set([...CN_HOLIDAYS, ...extraHolidays])

  const models = new Map()
  if (isObject(cfg.models)) {
    for (const [key, raw] of Object.entries(cfg.models)) {
      const entry = normalizeEntry(raw)
      if (entry !== undefined && key.trim() !== '') models.set(key.trim().toLowerCase(), entry)
    }
  }

  // `fallback` prices every model without its own entry. The v1 top-level
  // fields keep working as that fallback.
  const legacy = cfg.inputPrice !== undefined || cfg.outputPrice !== undefined
    ? normalizeEntry({ input: cfg.inputPrice, cacheHit: cfg.cacheHitPrice, output: cfg.outputPrice })
    : undefined
  const fallback = (isObject(cfg.fallback) ? normalizeEntry(cfg.fallback) : undefined) ?? legacy

  const builtin = (model) => {
    const table = BUILTIN_PRICES[MODEL_ALIASES[model] ?? model]
    return table === undefined ? undefined : table[currency]
  }

  /**
   * Price entry of one route: `provider/model` override, then `model`
   * override, then the built-in table, then the fallback.
   * @param {string} provider - provider id the message was routed through.
   * @param {string} model - model id.
   * @returns {{ peak: object, offPeak?: object } | undefined} the entry, or undefined when unpriced.
   */
  const priceFor = (provider, model) => {
    const m = String(model ?? '').toLowerCase()
    const p = String(provider ?? '').toLowerCase()
    return models.get(`${p}/${m}`) ?? models.get(m) ?? builtin(m) ?? fallback
  }

  return Object.freeze({
    currency,
    symbol,
    timeOfDay,
    holidays,
    showInSessionList: cfg.showInSessionList !== false,
    priceFor,
  })
}

const PER_TOKENS = 1_000_000

/** Cost of one bucket set under one rate card, per bucket. */
function bucketCosts(buckets, card) {
  return {
    input: buckets.input * card.input / PER_TOKENS,
    cacheRead: buckets.cacheRead * card.cacheHit / PER_TOKENS,
    cacheWrite: buckets.cacheWrite * card.cacheWrite / PER_TOKENS,
    output: buckets.output * card.output / PER_TOKENS,
  }
}

function sumCosts(costs) {
  return costs.input + costs.cacheRead + costs.cacheWrite + costs.output
}

function hasTokens(buckets) {
  return buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output > 0
}

/** Drop float noise so equal ledgers produce equal views. */
function money(value) {
  return Number(value.toFixed(8))
}

/**
 * Price one ledger (route entries split into peak and off-peak buckets).
 * @param {ReadonlyArray<object>} ledger - fold ledger.
 * @param {object} pricing - result of {@link resolvePricing}.
 * @returns {object} totals, per-bucket costs, per-model rows, and off-peak savings.
 */
export function priceLedger(ledger, pricing) {
  const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }
  const costs = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
  let saved = 0
  let complete = true
  const models = []
  for (const entry of ledger) {
    const prices = pricing.priceFor(entry.provider, entry.model)
    let modelCost = prices === undefined ? null : 0
    let modelTokens = 0
    for (const tier of TIERS) {
      const buckets = entry[tier]
      tokens.input += buckets.input
      tokens.cacheRead += buckets.cacheRead
      tokens.cacheWrite += buckets.cacheWrite
      tokens.output += buckets.output
      tokens.reasoning += buckets.reasoning
      modelTokens += buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output
      if (prices === undefined) {
        if (hasTokens(buckets)) complete = false
        continue
      }
      const discounted = tier === 'offPeak' && pricing.timeOfDay && prices.offPeak !== undefined
      const tierCosts = bucketCosts(buckets, discounted ? prices.offPeak : prices.peak)
      costs.input += tierCosts.input
      costs.cacheRead += tierCosts.cacheRead
      costs.cacheWrite += tierCosts.cacheWrite
      costs.output += tierCosts.output
      modelCost += sumCosts(tierCosts)
      if (discounted) saved += sumCosts(bucketCosts(buckets, prices.peak)) - sumCosts(tierCosts)
    }
    models.push({
      provider: entry.provider,
      model: entry.model,
      tokens: modelTokens,
      cost: modelCost === null ? null : money(modelCost),
    })
  }
  models.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.tokens - a.tokens)
  return {
    cost: money(sumCosts(costs)),
    complete,
    tokens,
    costs: {
      input: money(costs.input),
      cacheRead: money(costs.cacheRead),
      cacheWrite: money(costs.cacheWrite),
      output: money(costs.output),
    },
    saved: money(saved),
    models,
  }
}

/**
 * The client view of one fold state: everything the badge, the detail panel,
 * and the session-list label render. Pricing is applied here, at read time,
 * so editing prices re-prices every session without re-folding its log.
 * @param {object} state - fold state from `lib/fold.js`.
 * @param {object} pricing - result of {@link resolvePricing}.
 * @returns {object} JSON view.
 */
export function buildView(state, pricing) {
  const total = priceLedger(state.total, pricing)
  const prompt = total.tokens.input + total.tokens.cacheRead + total.tokens.cacheWrite
  const turn = state.turn === null ? null : priceLedger(state.turn.ledger, pricing)
  const compaction = state.compactions > 0 ? priceLedger(state.compaction, pricing) : null
  return {
    v: 2,
    currency: pricing.currency,
    symbol: pricing.symbol,
    cost: total.cost,
    complete: total.complete,
    calls: state.calls,
    tokens: total.tokens,
    costs: total.costs,
    cacheHitRate: prompt > 0 ? Number((total.tokens.cacheRead / prompt).toFixed(4)) : null,
    tiered: pricing.timeOfDay,
    saved: total.saved,
    turn: turn === null ? null : { no: state.turn.no, cost: turn.cost, complete: turn.complete },
    compaction: compaction === null
      ? null
      : { calls: state.compactions, cost: compaction.cost, complete: compaction.complete },
    models: total.models,
    showInList: pricing.showInSessionList,
  }
}
