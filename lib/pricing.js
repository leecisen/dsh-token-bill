/**
 * Price tables, billing tiers, and the priced client view.
 *
 * Pure module with no Harness imports, so the same code runs inside the Host
 * and under plain `node --test`. Every price is per one million tokens.
 *
 * A model's price entry holds one schedule per currency it is officially
 * priced in. A schedule is a list of periods (a price that changes on a known
 * date), each period a list of prompt-size tiers (long-context pricing), and
 * each tier a rate card plus an optional off-peak card (DeepSeek).
 */

/** Date the built-in tables were last checked against the official price pages. */
export const PRICES_AS_OF = '2026-11-08'

/** Official price pages the built-in tables mirror, by vendor. */
export const PRICE_SOURCES = Object.freeze({
  deepseek: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing',
  openai: 'https://developers.openai.com/api/docs/pricing',
  google: 'https://ai.google.dev/gemini-api/docs/pricing',
  xai: 'https://docs.x.ai/docs/models',
  moonshot: 'https://platform.kimi.com/docs/pricing/chat',
  zhipu: 'https://bigmodel.cn/pricing',
  zai: 'https://docs.z.ai/guides/overview/pricing',
  minimax: 'https://platform.minimaxi.com/docs/guides/pricing',
  qwen: 'https://help.aliyun.com/zh/model-studio/model-pricing',
  doubao: 'https://www.volcengine.com/docs/82379/1544106',
  hunyuan: 'https://cloud.tencent.com/product/tokenhub',
  ernie: 'https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya',
  mimo: 'https://platform.xiaomimimo.com/docs/pricing',
  stepfun: 'https://platform.stepfun.com/docs/zh/guides/pricing/details',
  ling: 'https://developer.ant-ling.com/zh-CN/docs/models/price/',
  longcat: 'https://longcat.chat/platform/docs/zh/pricing/longcat-2.5',
})

/** The DeepSeek page, kept for callers of v2. */
export const PRICE_SOURCE = PRICE_SOURCES.deepseek

/** Currencies the panel offers by default: where DeepSeek is used most. */
export const DEFAULT_CURRENCIES = Object.freeze(['CNY', 'USD', 'EUR', 'RUB', 'INR', 'IDR', 'BRL', 'HKD'])

// ---- table builders ---------------------------------------------------------

/** One rate card. Cache writes cost the input price unless the vendor lists their own. */
function c(input, cacheRead, output, cacheWrite = input) {
  return Object.freeze({ input, cacheRead, cacheWrite, output })
}

/** Prompt-size tiers: `[[0, card], [above, card], ...]`; a tier applies once the prompt exceeds `above` tokens. */
function tiers(...steps) {
  return { tiers: steps }
}

/** A DeepSeek-style day and night pair. */
function timed(peak, offPeak) {
  return { timed: [peak, offPeak] }
}

/** Prices that change on a known Beijing date: `[['', plan], ['2026-12-01', plan], ...]`. */
function dated(...periods) {
  return { periods }
}

const FREE = c(0, 0, 0, 0)

/**
 * Built-in prices, checked against the official pages on {@link PRICES_AS_OF}.
 * Keys are the vendors' model ids. CNY rows are mainland-China list prices and
 * USD rows international ones; a model priced in both shows the matching
 * table when either currency is displayed. Where a vendor runs an open-ended
 * discount, the price charged today is listed.
 */
export const BUILTIN_PRICES = Object.freeze({
  // DeepSeek: off-peak (see tierAt) is half price; cache writes bill as input.
  'deepseek-flash': {
    CNY: timed(c(2, 0.04, 8), c(1, 0.02, 4)),
    USD: timed(c(0.3, 0.006, 1.2), c(0.15, 0.003, 0.6)),
  },
  'deepseek-v4-pro': {
    CNY: timed(c(9, 0.3, 27), c(4.5, 0.15, 13.5)),
    USD: timed(c(1.32, 0.044, 3.96), c(0.66, 0.022, 1.98)),
  },

  // Anthropic Claude: cache writes at the 5-minute price.
  'claude-fable-5-1': { USD: c(10, 0.25, 50, 12.5) },
  'claude-mythos-5-1': { USD: c(10, 0.25, 50, 12.5) },
  'claude-fable-5': { USD: c(10, 1, 50, 12.5) },
  'claude-mythos-5': { USD: c(10, 1, 50, 12.5) },
  'claude-opus-5-5': { USD: c(4, 0.2, 20, 5) },
  'claude-opus-5': { USD: c(5, 0.5, 25, 6.25) },
  'claude-opus-4-8': { USD: c(5, 0.5, 25, 6.25) },
  'claude-opus-4-7': { USD: c(5, 0.5, 25, 6.25) },
  'claude-opus-4-6': { USD: c(5, 0.5, 25, 6.25) },
  'claude-opus-4-5': { USD: c(5, 0.5, 25, 6.25) },
  'claude-sonnet-5-5': { USD: c(2, 0.1, 10, 2.5) },
  'claude-sonnet-5': { USD: c(2, 0.2, 10, 2.5) },
  'claude-sonnet-4-6': { USD: c(3, 0.3, 15, 3.75) },
  'claude-sonnet-4-5': { USD: c(3, 0.3, 15, 3.75) },
  'claude-haiku-5-5': { USD: tiers([0, c(0.1, 0.01, 0.5, 0.125)], [100_000, c(0.5, 0.05, 2.5, 0.625)]) },
  'claude-haiku-4-5': { USD: c(1, 0.1, 5, 1.25) },

  // OpenAI: Standard tier; cache writes at the 30-minute price where listed.
  'gpt-6-astra': { USD: tiers([0, c(10, 1, 50, 12.5)], [272_000, c(20, 2, 75, 25)]) },
  'gpt-6.1-sol': { USD: tiers([0, c(2, 0.1, 10, 2.5)], [272_000, c(4, 0.2, 15, 5)]) },
  'gpt-6.1-terra': { USD: tiers([0, c(1, 0.05, 5, 1.25)], [272_000, c(2, 0.1, 7.5, 2.5)]) },
  'gpt-6-sol': { USD: tiers([0, c(2, 0.2, 10, 2.5)], [272_000, c(4, 0.4, 15, 5)]) },
  'gpt-6-luna': { USD: tiers([0, c(0.1, 0.01, 0.5, 0.125)], [272_000, c(0.2, 0.02, 0.75, 0.25)]) },
  'gpt-5.6-sol': { USD: tiers([0, c(4, 0.4, 20, 5)], [272_000, c(8, 0.8, 30, 10)]) },
  'gpt-5.6-terra': { USD: tiers([0, c(2, 0.2, 12, 2.5)], [272_000, c(4, 0.4, 18, 5)]) },
  'gpt-5.6-luna': { USD: tiers([0, c(0.2, 0.02, 1.2, 0.25)], [272_000, c(0.4, 0.04, 1.8, 0.5)]) },
  'gpt-5.5': { USD: tiers([0, c(5, 0.5, 30)], [272_000, c(10, 1, 45)]) },
  'gpt-5.5-pro': { USD: tiers([0, c(30, 30, 180)], [272_000, c(60, 60, 270)]) },
  'gpt-5.4': { USD: tiers([0, c(2.5, 0.25, 15)], [272_000, c(5, 0.5, 22.5)]) },
  'gpt-5.4-pro': { USD: tiers([0, c(30, 30, 180)], [272_000, c(60, 60, 270)]) },
  'gpt-5.4-mini': { USD: c(0.75, 0.075, 4.5) },
  'gpt-5.4-nano': { USD: c(0.2, 0.02, 1.25) },
  'gpt-5.3-codex': { USD: c(1.75, 0.175, 14) },
  'gpt-5.2': { USD: c(1.75, 0.175, 14) },
  'gpt-5.2-pro': { USD: c(21, 21, 168) },
  'gpt-5.1': { USD: c(1.25, 0.125, 10) },
  'gpt-5': { USD: c(1.25, 0.125, 10) },
  'gpt-5-mini': { USD: c(0.25, 0.025, 2) },
  'gpt-5-nano': { USD: c(0.05, 0.005, 0.4) },
  'gpt-5-pro': { USD: c(15, 15, 120) },
  'gpt-4.1': { USD: c(2, 0.5, 8) },
  'gpt-4.1-mini': { USD: c(0.4, 0.1, 1.6) },
  'gpt-4o': { USD: c(2.5, 1.25, 10) },
  'gpt-4o-mini': { USD: c(0.15, 0.075, 0.6) },
  'o3': { USD: c(2, 0.5, 8) },
  'o3-pro': { USD: c(20, 20, 80) },
  'chat-latest': { USD: c(5, 0.5, 30) },

  // Google Gemini: paid tier; promotional prices end on the dates Google lists.
  'gemini-4-argon': { USD: dated(['', c(2, 0.1, 10)], ['2026-12-01', c(4, 0.2, 20)]) },
  'gemini-3.8-flash': { USD: dated(['', c(0.75, 0.075, 3.75)], ['2027-01-01', c(1.5, 0.15, 7.5)]) },
  'gemini-3.5-flash-lite': { USD: c(0.3, 0.03, 2.5) },
  'gemini-3.1-flash-lite': { USD: c(0.25, 0.025, 1.5) },
  'gemini-3.1-pro-preview': { USD: tiers([0, c(2, 0.2, 12)], [200_000, c(4, 0.4, 18)]) },
  'gemini-3-flash-preview': { USD: c(0.5, 0.05, 3) },
  // Routed to gemini-3.8-flash from 2026-12-01.
  'gemini-2.5-pro': {
    USD: dated(
      ['', tiers([0, c(1.25, 0.125, 10)], [200_000, c(2.5, 0.25, 15)])],
      ['2026-12-01', c(0.75, 0.075, 3.75)],
    ),
  },
  'gemini-2.5-flash': { USD: c(0.3, 0.03, 2.5) },
  'gemini-2.5-flash-lite': { USD: c(0.1, 0.01, 0.4) },

  // xAI Grok: the long-context rate applies once a prompt reaches 200k tokens.
  'grok-4.7': { USD: tiers([0, c(2, 0.5, 6)], [200_000, c(4, 1, 12)]) },
  'grok-4.6': { USD: tiers([0, c(2, 0.5, 6)], [200_000, c(4, 1, 12)]) },
  'grok-4.5': { USD: tiers([0, c(2, 0.3, 6)], [200_000, c(4, 0.6, 12)]) },
  'grok-4.3': { USD: tiers([0, c(1.25, 0.2, 2.5)], [200_000, c(2.5, 0.4, 5)]) },
  'grok-4.20-0309-reasoning': { USD: tiers([0, c(1.25, 0.2, 2.5)], [200_000, c(2.5, 0.4, 5)]) },
  'grok-4.20-0309-non-reasoning': { USD: tiers([0, c(1.25, 0.2, 2.5)], [200_000, c(2.5, 0.4, 5)]) },
  'grok-4.20-multi-agent-0309': { USD: tiers([0, c(1.25, 0.2, 2.5)], [200_000, c(2.5, 0.4, 5)]) },
  'grok-build-0.1': { USD: tiers([0, c(1, 0.2, 2)], [200_000, c(2, 0.4, 4)]) },

  // Moonshot Kimi: K3 cache writes at the 5-minute price.
  'kimi-k3.1-pro': { CNY: c(13, 1.3, 68, 13) },
  'kimi-k3.1-pro-highspeed': { CNY: c(26, 1.3, 136, 26) },
  'kimi-k3': { CNY: c(20, 2, 100, 20), USD: c(3, 0.3, 15, 3) },
  'kimi-k2.7-code': { CNY: c(6.5, 1.3, 27) },
  'kimi-k2.7-code-highspeed': { CNY: c(13, 2.6, 54) },
  'kimi-k2.6': { CNY: c(6.5, 1.1, 27) },

  // Zhipu GLM: CNY from bigmodel.cn, USD from z.ai.
  'glm-5.3': { CNY: c(8, 2, 28), USD: c(1.4, 0.26, 4.4) },
  'glm-5.3-flash': { CNY: c(0.8, 0.23, 2.8), USD: c(0.15, 0.03, 0.5) },
  'glm-5.3-flashx': { CNY: c(2, 0.57, 7), USD: c(0.37, 0.075, 1.25) },
  'glm-5.2': { CNY: c(8, 2, 28), USD: c(1.4, 0.26, 4.4) },
  'glm-5.1': { CNY: tiers([0, c(6, 1.3, 24)], [32_000, c(8, 2, 28)]), USD: c(1.4, 0.26, 4.4) },
  'glm-5': { USD: c(1, 0.2, 3.2) },
  'glm-4.7': { USD: c(0.6, 0.11, 2.2) },
  'glm-4.6': { USD: c(0.6, 0.11, 2.2) },
  'glm-4.5': { USD: c(0.6, 0.11, 2.2) },
  'glm-4.5-air': { USD: c(0.2, 0.03, 1.1) },
  'glm-4.7-flash': { CNY: FREE, USD: FREE },
  'glm-4.5-flash': { CNY: FREE, USD: FREE },

  // MiniMax: the standing 50% discount is the price charged.
  'minimax-m3': {
    CNY: tiers([0, c(2.1, 0.42, 8.4)], [512_000, c(4.2, 0.84, 16.8)]),
    USD: tiers([0, c(0.3, 0.06, 1.2)], [512_000, c(0.6, 0.12, 2.4)]),
  },
  'minimax-m3.1-flash': { CNY: c(1, 0.1, 4), USD: c(0.15, 0.015, 0.6) },

  // Alibaba Qwen (Bailian, Beijing): implicit cache hits bill at 20% of input.
  'qwen3.8-max': { CNY: c(12, 2.4, 36) },
  'qwen3.7-max': { CNY: c(12, 2.4, 36) },
  // 20% off for a limited time, no end date given.
  'qwen3.7-plus': { CNY: tiers([0, c(1.6, 0.32, 6.4)], [256_000, c(4.8, 0.96, 19.2)]) },
  'qwen3.6-plus': { CNY: tiers([0, c(2, 0.4, 12)], [256_000, c(8, 1.6, 48)]) },
  'qwen3.8-flash': { CNY: c(0.8, 0.16, 2.7) },
  'qwen3.6-flash': { CNY: tiers([0, c(1.2, 0.24, 7.2)], [256_000, c(4.8, 0.96, 28.8)]) },
  'qwen-max': { CNY: c(2.4, 0.48, 9.6) },
  'qwen-flash': { CNY: tiers([0, c(0.15, 0.03, 1.5)], [128_000, c(0.6, 0.12, 6)], [256_000, c(1.2, 0.24, 12)]) },

  // ByteDance Doubao (Volcengine, online inference).
  'doubao-seed-2.1-pro': { CNY: c(6, 1.2, 30) },
  'doubao-seed-2.1-turbo': { CNY: c(3, 0.6, 15) },
  'doubao-seed-2.1-lite': { CNY: c(0.8, 0.16, 2.7) },
  'doubao-seed-evolving': { CNY: c(6, 1.2, 30) },
  'doubao-seed-2.0-pro': { CNY: tiers([0, c(3.2, 0.64, 16)], [32_000, c(4.8, 0.96, 24)], [128_000, c(9.6, 1.92, 48)]) },
  'doubao-seed-2.0-code': { CNY: tiers([0, c(3.2, 0.64, 16)], [32_000, c(4.8, 0.96, 24)], [128_000, c(9.6, 1.92, 48)]) },
  'doubao-seed-2.0-lite': { CNY: tiers([0, c(0.6, 0.12, 3.6)], [32_000, c(0.9, 0.18, 5.4)], [128_000, c(1.8, 0.36, 10.8)]) },
  'doubao-seed-2.0-mini': { CNY: tiers([0, c(0.2, 0.04, 2)], [32_000, c(0.4, 0.08, 4)], [128_000, c(0.8, 0.16, 8)]) },

  // Tencent Hunyuan (TokenHub, Guangzhou).
  'hy4': { CNY: c(6, 0.3, 18) },
  'hy3': { CNY: c(1, 0.25, 4) },

  // Baidu ERNIE (Qianfan, pay as you go; no cache price listed).
  'ernie-5.1': { CNY: tiers([0, c(4, 4, 18)], [32_000, c(6, 6, 22)]) },

  // Xiaomi MiMo.
  'mimo-v2.6-pro': { CNY: c(3, 0.025, 6), USD: c(0.435, 0.0036, 0.87) },
  'mimo-v2.6-flash': { CNY: c(1, 0.02, 2), USD: c(0.14, 0.0028, 0.28) },
  'mimo-v2.6-pro-ultraspeed': { CNY: c(30, 0.25, 60), USD: c(4.35, 0.036, 8.7) },

  // StepFun: Step 5 Preview cache hits doubled on 2026-10-14.
  'step-5-preview': { CNY: dated(['', c(7, 0.35, 20)], ['2026-10-14', c(7, 0.7, 20)]) },
  'step-3.7-flash': { CNY: c(1.35, 0.27, 8.1) },
  'step-3.5-flash': { CNY: c(0.7, 0.14, 2.1) },

  // Ant Group Ling: launch discounts, no end date given.
  'ling-3.1-flash': { CNY: c(0.5, 0.1, 1.5) },
  'ling-3.0-flash': { CNY: c(0.14, 0.028, 0.42) },
  'ling-3.0-flash-vl': { CNY: c(0.14, 0.028, 0.42) },

  // Meituan LongCat: launch discount, no end date given.
  'longcat-2.5': { CNY: c(2, 0.04, 8), USD: c(0.3, 0.006, 1.2) },
})

/** Other ids the APIs accept for a model above, billed at its price. */
export const MODEL_ALIASES = Object.freeze({
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
  'deepseek-v4.1-flash': 'deepseek-flash',
  'gemini-3.1-pro-preview-customtools': 'gemini-3.1-pro-preview',
  'step-3.5-flash-2603': 'step-3.5-flash',
})

// ---- Beijing calendar and DeepSeek tiers ------------------------------------

/**
 * Days off under the State Council's holiday notices for 2026 (2025-11-04) and
 * 2027 (2026-11-05), as Beijing dates. Weekends are off-peak anyway; listing
 * whole breaks keeps the table easy to check against the notices. Make-up
 * workdays on weekends stay off-peak, because DeepSeek's rule counts every
 * weekend as off-peak.
 */
export const CN_HOLIDAYS = Object.freeze([
  // 2026 New Year
  '2026-01-01', '2026-01-02', '2026-01-03',
  // 2026 Spring Festival
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  // 2026 Qingming
  '2026-04-04', '2026-04-05', '2026-04-06',
  // 2026 Labour Day
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  // 2026 Dragon Boat
  '2026-06-19', '2026-06-20', '2026-06-21',
  // 2026 Mid-Autumn
  '2026-09-25', '2026-09-26', '2026-09-27',
  // 2026 National Day
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
  // 2027 New Year
  '2027-01-01', '2027-01-02', '2027-01-03',
  // 2027 Spring Festival
  '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
  '2027-02-10', '2027-02-11', '2027-02-12', '2027-02-13',
  // 2027 Qingming
  '2027-04-03', '2027-04-04', '2027-04-05',
  // 2027 Labour Day
  '2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05',
  // 2027 Dragon Boat
  '2027-06-09',
  // 2027 Mid-Autumn
  '2027-09-15',
  // 2027 National Day
  '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04', '2027-10-05',
  '2027-10-06', '2027-10-07',
])

/** Peak windows in Beijing minutes after midnight, as [start, end). */
export const PEAK_WINDOWS = Object.freeze([[9 * 60, 12 * 60], [14 * 60, 18 * 60]])

/** Beijing has no daylight saving time, so a fixed offset is exact. */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** The two time slots every ledger entry keeps apart. */
export const TIERS = Object.freeze(['peak', 'offPeak'])

const NO_HOLIDAYS = new Set()

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

function readableTime(time) {
  return typeof time === 'number' && Number.isFinite(time)
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
  if (!readableTime(time)) return 'peak'
  const { date, weekday, minute } = beijingParts(time)
  if (weekday === 0 || weekday === 6 || holidays.has(date)) return 'offPeak'
  for (const [start, end] of PEAK_WINDOWS) {
    if (minute >= start && minute < end) return 'peak'
  }
  return 'offPeak'
}

/**
 * The time slot the fold records: {@link tierAt} without holidays. Holidays
 * are applied when the view prices the entry's date, so a holiday added in the
 * config re-prices old Sessions too.
 * @param {number} time - epoch milliseconds.
 * @returns {'peak' | 'offPeak'} the slot.
 */
export function slotAt(time) {
  return tierAt(time, NO_HOLIDAYS)
}

/**
 * Beijing date of one instant, or '' when the time cannot be read.
 * @param {number} time - epoch milliseconds.
 * @returns {string} YYYY-MM-DD or ''.
 */
export function dateAt(time) {
  return readableTime(time) ? beijingParts(time).date : ''
}

// ---- prompt-size bands --------------------------------------------------------

/**
 * Prompt sizes (tokens) where a vendor switches to a long-context price. The
 * fold records which band each call's prompt fell in, so a tier above any of
 * these sizes prices exactly; a custom threshold in between rounds up to the
 * next listed size.
 */
export const CONTEXT_BOUNDS = Object.freeze([32_000, 100_000, 128_000, 200_000, 256_000, 272_000, 512_000])

/**
 * Band of one prompt: how many {@link CONTEXT_BOUNDS} it exceeds.
 * @param {number} promptTokens - input + cache reads + cache writes of one call.
 * @returns {number} 0 for a short prompt, up to the number of bounds.
 */
export function bandOf(promptTokens) {
  let band = 0
  for (const bound of CONTEXT_BOUNDS) {
    if (promptTokens > bound) band += 1
  }
  return band
}

/** Smallest prompt a band can hold, so a tier above that size covers the whole band. */
function bandFloor(band) {
  if (!(band > 0)) return 0
  return CONTEXT_BOUNDS[Math.min(band, CONTEXT_BOUNDS.length) - 1]
}

// ---- compiled entries ---------------------------------------------------------

function compilePlan(plan) {
  if (plan.timed) return Object.freeze([Object.freeze({ above: 0, peak: plan.timed[0], offPeak: plan.timed[1] })])
  if (plan.tiers) {
    const steps = plan.tiers.map(([above, peak]) => Object.freeze({ above, peak })).sort((a, b) => a.above - b.above)
    return Object.freeze(steps)
  }
  return Object.freeze([Object.freeze({ above: 0, peak: plan })])
}

function compileSchedule(value) {
  const periods = value.periods ?? [['', value]]
  return Object.freeze(periods
    .map(([since, plan]) => Object.freeze({ since, tiers: compilePlan(plan) }))
    .sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0)))
}

/**
 * Compile one `{ CUR: plan }` price into the shape the view reads.
 * @param {object} prices - plan per currency code.
 * @returns {{ currencies: string[], sig: string, schedules: object }} the entry.
 */
function compileEntry(prices) {
  const currencies = Object.keys(prices).sort()
  const schedules = {}
  for (const currency of currencies) schedules[currency] = compileSchedule(prices[currency])
  return Object.freeze({ currencies: Object.freeze(currencies), sig: currencies.join('+'), schedules: Object.freeze(schedules) })
}

/**
 * The tier that prices one ledger entry.
 * @param {ReadonlyArray<object>} schedule - compiled periods of one currency.
 * @param {string} date - the entry's Beijing date, '' when unknown (today's price).
 * @param {number} band - the entry's prompt-size band.
 * @returns {{ above: number, peak: object, offPeak?: object }} the tier.
 */
export function tierFor(schedule, date, band) {
  // Periods are sorted by start date and the first one starts at ''.
  let period = schedule[0]
  if (date === '') period = schedule[schedule.length - 1]
  else for (const candidate of schedule) if (candidate.since <= date) period = candidate
  const floor = bandFloor(band)
  let chosen = period.tiers[0]
  for (const tier of period.tiers) {
    if (tier.above <= floor) chosen = tier
  }
  return chosen
}

// ---- model ids ----------------------------------------------------------------

/**
 * One spelling for every way a model id reaches the Harness: lower case, a
 * gateway's `vendor/` prefix dropped (OpenRouter), Bedrock and Vertex
 * decorations dropped, and dots written as dashes (`claude-opus-4.5` and
 * `claude-opus-4-5` are one model).
 * @param {unknown} id - model id.
 * @returns {string} canonical id.
 */
export function canonicalModel(id) {
  let model = String(id ?? '').trim().toLowerCase()
  const slash = model.lastIndexOf('/')
  if (slash >= 0) model = model.slice(slash + 1)
  // Vertex: `claude-opus-4-5@20251101`.
  model = model.replace(/@.*$/, '')
  // Bedrock: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`.
  if (BEDROCK_PREFIX.test(model)) model = model.replace(BEDROCK_PREFIX, '').replace(/-v\d+(?::\d+)?$/, '')
  return model.replace(/\./g, '-')
}

const BEDROCK_PREFIX = /^(?:[a-z]{2,6}\.)?anthropic\./

/** A dated snapshot id without its date: `-20251001`, `-2024-08-06`, or Volcengine's `-260215`. */
function undated(model) {
  return model.replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2}|\d{6})$/, '')
}

const BUILTIN = new Map()
for (const [id, prices] of Object.entries(BUILTIN_PRICES)) BUILTIN.set(canonicalModel(id), compileEntry(prices))
for (const [alias, id] of Object.entries(MODEL_ALIASES)) BUILTIN.set(canonicalModel(alias), BUILTIN.get(canonicalModel(id)))

const FREE_ENTRY = compileEntry({ USD: FREE })

/**
 * Built-in price entry of one model id, or undefined when the table has none.
 * OpenRouter's `:free` variants cost nothing.
 * @param {unknown} model - model id as the Harness reports it.
 * @returns {object | undefined} compiled entry.
 */
export function builtinPrice(model) {
  const canonical = canonicalModel(model)
  if (canonical.endsWith(':free')) return FREE_ENTRY
  return BUILTIN.get(canonical) ?? BUILTIN.get(undated(canonical))
}

// ---- config -----------------------------------------------------------------

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A non-negative finite price; numeric strings are accepted because YAML authors quote numbers. */
function price(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : undefined
}

/** An ISO 4217-shaped code, upper-cased, or undefined. */
export function currencyCode(value) {
  if (typeof value !== 'string') return undefined
  const code = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : undefined
}

/**
 * Normalize one user rate card. `input` and `output` are required unless the
 * base supplies them; `cacheRead` and `cacheWrite` default to the input price.
 * `cacheHit` and the v1 names `inputPrice`, `cacheHitPrice`, and `outputPrice`
 * are accepted.
 * @param {unknown} raw - user value.
 * @param {object} [base] - rate card the missing fields inherit from.
 * @returns {object | undefined} a complete rate card, or undefined when unusable.
 */
export function normalizeRate(raw, base) {
  if (!isObject(raw)) return undefined
  const input = price(raw.input ?? raw.inputPrice) ?? base?.input
  const output = price(raw.output ?? raw.outputPrice) ?? base?.output
  if (input === undefined || output === undefined) return undefined
  const cacheRead = price(raw.cacheRead ?? raw.cacheHit ?? raw.cacheHitPrice) ?? base?.cacheRead ?? input
  const cacheWrite = price(raw.cacheWrite ?? raw.cacheWritePrice) ?? base?.cacheWrite ?? input
  return c(input, cacheRead, output, cacheWrite)
}

/**
 * Normalize one user price entry: a rate card, an optional `offPeak` card
 * whose missing fields inherit from the main one, and an optional `currency`.
 * @param {unknown} raw - user value.
 * @param {string} currency - currency of entries that name none.
 * @returns {object | undefined} compiled entry, or undefined when unusable.
 */
export function normalizeEntry(raw, currency) {
  const peak = normalizeRate(raw)
  if (peak === undefined) return undefined
  const offPeak = isObject(raw.offPeak) ? normalizeRate(raw.offPeak, peak) : undefined
  const code = currencyCode(raw.currency) ?? currency
  return compileEntry({ [code]: offPeak === undefined ? peak : timed(peak, offPeak) })
}

/**
 * Resolve the plugin's raw config into the pricing used by the view. Unknown
 * or malformed fields fall back to defaults instead of failing, so a typo
 * never takes the badge down.
 * @param {unknown} config - the Loader row's config object.
 * @returns {object} frozen pricing facts plus `priceFor(provider, model)`.
 */
export function resolvePricing(config) {
  const cfg = isObject(config) ? config : {}
  const currency = currencyCode(cfg.currency) ?? 'CNY'
  const symbol = typeof cfg.symbol === 'string' && cfg.symbol.trim() !== '' ? cfg.symbol : null
  const listed = Array.isArray(cfg.currencies)
    ? cfg.currencies.map(currencyCode).filter(code => code !== undefined)
    : [...DEFAULT_CURRENCIES]
  const currencies = [...new Set(listed.includes(currency) ? listed : [currency, ...listed])]
  const timeOfDay = cfg.timeOfDayPricing !== false
  const extraHolidays = Array.isArray(cfg.holidays)
    ? cfg.holidays.filter(day => typeof day === 'string' && DATE_PATTERN.test(day.trim())).map(day => day.trim())
    : []
  const holidays = new Set([...CN_HOLIDAYS, ...extraHolidays])

  // Keys are matched as written (lower case), and model-only keys also by
  // their canonical spelling, so `glm-5.3` prices `z-ai/glm-5.3` too.
  const models = new Map()
  const canonical = new Map()
  if (isObject(cfg.models)) {
    for (const [key, raw] of Object.entries(cfg.models)) {
      const entry = normalizeEntry(raw, currency)
      const name = key.trim().toLowerCase()
      if (entry === undefined || name === '') continue
      models.set(name, entry)
      if (!name.includes('/')) canonical.set(canonicalModel(name), entry)
    }
  }

  // `fallback` prices every model without its own entry. The v1 top-level
  // fields keep working as that fallback.
  const legacy = cfg.inputPrice !== undefined || cfg.outputPrice !== undefined
    ? normalizeEntry({ input: cfg.inputPrice, cacheHit: cfg.cacheHitPrice, output: cfg.outputPrice }, currency)
    : undefined
  const fallback = (isObject(cfg.fallback) ? normalizeEntry(cfg.fallback, currency) : undefined) ?? legacy

  /**
   * Price entry of one route: `provider/model` override, then `model`
   * override, then the built-in table, then the fallback.
   * @param {string} provider - provider id the message was routed through.
   * @param {string} model - model id.
   * @returns {object | undefined} compiled entry, or undefined when unpriced.
   */
  const priceFor = (provider, model) => {
    const m = String(model ?? '').trim().toLowerCase()
    const p = String(provider ?? '').trim().toLowerCase()
    return models.get(`${p}/${m}`) ?? models.get(m) ?? canonical.get(canonicalModel(m)) ?? builtinPrice(m) ?? fallback
  }

  return Object.freeze({
    currency,
    currencies: Object.freeze(currencies),
    symbol,
    liveRates: cfg.exchangeRates !== false,
    timeOfDay,
    holidays,
    showInSessionList: cfg.showInSessionList !== false,
    priceFor,
  })
}

// ---- pricing a ledger ---------------------------------------------------------

const PER_TOKENS = 1_000_000

const BUCKETS = Object.freeze(['input', 'cacheRead', 'cacheWrite', 'output'])

/** Cost of one bucket set under one rate card, per bucket. */
function bucketCosts(buckets, card) {
  return {
    input: buckets.input * card.input / PER_TOKENS,
    cacheRead: buckets.cacheRead * card.cacheRead / PER_TOKENS,
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

/**
 * Add to a money value: `{ [sig]: { [currency]: amount } }`. `sig` names the
 * currencies one group of models is priced in (`CNY+USD`), so the client can
 * show each group in its own table's currency and convert only the rest.
 */
function addMoney(money, sig, currency, amount) {
  const bag = money[sig] ?? (money[sig] = {})
  bag[currency] = (bag[currency] ?? 0) + amount
}

/** Drop float noise so equal ledgers produce equal views. */
function roundMoney(money) {
  const out = {}
  for (const [sig, bag] of Object.entries(money)) {
    out[sig] = {}
    for (const [currency, amount] of Object.entries(bag)) out[sig][currency] = Number(amount.toFixed(8))
  }
  return out
}

/**
 * Price one ledger: route entries split by Beijing date, prompt-size band,
 * and peak / off-peak slot.
 * @param {ReadonlyArray<object>} ledger - fold ledger.
 * @param {object} pricing - result of {@link resolvePricing}.
 * @returns {object} money totals, per-bucket money, per-model rows, and off-peak savings.
 */
export function priceLedger(ledger, pricing) {
  const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }
  const costs = { input: {}, cacheRead: {}, cacheWrite: {}, output: {} }
  const cost = {}
  const saved = {}
  let complete = true
  const rows = new Map()
  for (const entry of ledger) {
    const prices = pricing.priceFor(entry.provider, entry.model)
    const key = `${entry.provider}\n${entry.model}`
    let row = rows.get(key)
    if (row === undefined) {
      row = { provider: entry.provider, model: entry.model, tokens: 0, cost: prices === undefined ? null : {} }
      rows.set(key, row)
    }
    const holiday = pricing.holidays.has(entry.date)
    for (const slot of TIERS) {
      const buckets = entry[slot]
      tokens.input += buckets.input
      tokens.cacheRead += buckets.cacheRead
      tokens.cacheWrite += buckets.cacheWrite
      tokens.output += buckets.output
      tokens.reasoning += buckets.reasoning
      row.tokens += buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output
      if (!hasTokens(buckets)) continue
      if (prices === undefined) {
        complete = false
        continue
      }
      const offPeak = slot === 'offPeak' || holiday
      for (const currency of prices.currencies) {
        const tier = tierFor(prices.schedules[currency], entry.date, entry.band)
        const discounted = offPeak && pricing.timeOfDay && tier.offPeak !== undefined
        const parts = bucketCosts(buckets, discounted ? tier.offPeak : tier.peak)
        for (const bucket of BUCKETS) addMoney(costs[bucket], prices.sig, currency, parts[bucket])
        const total = sumCosts(parts)
        addMoney(cost, prices.sig, currency, total)
        addMoney(row.cost, prices.sig, currency, total)
        if (discounted) addMoney(saved, prices.sig, currency, sumCosts(bucketCosts(buckets, tier.peak)) - total)
      }
    }
  }
  const models = [...rows.values()]
    .map(row => ({ ...row, cost: row.cost === null ? null : roundMoney(row.cost) }))
    .sort((a, b) => b.tokens - a.tokens)
  return {
    cost: roundMoney(cost),
    complete,
    tokens,
    costs: {
      input: roundMoney(costs.input),
      cacheRead: roundMoney(costs.cacheRead),
      cacheWrite: roundMoney(costs.cacheWrite),
      output: roundMoney(costs.output),
    },
    saved: roundMoney(saved),
    models,
  }
}

/**
 * The client view of one fold state: everything the badge, the detail panel,
 * and the session-list label render. Pricing is applied here, at read time,
 * so editing prices re-prices every session without re-folding its log.
 * Amounts are money values (see {@link addMoney}); the client converts them
 * into the currency the user picked.
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
    v: 3,
    currency: pricing.currency,
    currencies: pricing.currencies,
    symbol: pricing.symbol,
    liveRates: pricing.liveRates,
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
