import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  BUILTIN_PRICES,
  DEFAULT_CURRENCIES,
  bandOf,
  buildView,
  builtinPrice,
  canonicalModel,
  dateAt,
  priceLedger,
  resolvePricing,
  slotAt,
  tierAt,
  tierFor,
} from '../lib/pricing.js'
import { initialState } from '../lib/fold.js'

/** Epoch ms of a Beijing wall-clock time. */
const beijing = (iso) => Date.parse(`${iso}+08:00`)

const NO_HOLIDAYS = new Set()

const buckets = (input = 0, cacheRead = 0, output = 0, cacheWrite = 0, reasoning = 0) =>
  ({ input, cacheRead, cacheWrite, output, reasoning })
const zero = () => buckets()

/** The rate card one currency of an entry applies on a date, band, and slot. */
function card(entry, currency, { date = '2026-11-09', band = 0, slot = 'peak' } = {}) {
  const tier = tierFor(entry.schedules[currency], date, band)
  return slot === 'offPeak' && tier.offPeak !== undefined ? tier.offPeak : tier.peak
}

/** One ledger entry. */
const row = (model, peak, offPeak = zero(), { provider = 'p', date = '2026-11-09', band = 0 } = {}) =>
  ({ provider, model, date, band, peak, offPeak })

describe('tierAt', () => {
  it('marks Beijing weekday 09:00-12:00 and 14:00-18:00 as peak', () => {
    // 2026-11-09 is a Monday.
    assert.equal(tierAt(beijing('2026-11-09T08:59:59'), NO_HOLIDAYS), 'offPeak')
    assert.equal(tierAt(beijing('2026-11-09T09:00:00'), NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(beijing('2026-11-09T11:59:59'), NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(beijing('2026-11-09T12:00:00'), NO_HOLIDAYS), 'offPeak')
    assert.equal(tierAt(beijing('2026-11-09T13:59:00'), NO_HOLIDAYS), 'offPeak')
    assert.equal(tierAt(beijing('2026-11-09T14:00:00'), NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(beijing('2026-11-09T17:59:59'), NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(beijing('2026-11-09T18:00:00'), NO_HOLIDAYS), 'offPeak')
  })

  it('matches the UTC wording of the English price page', () => {
    assert.equal(tierAt(Date.parse('2026-11-10T01:00:00Z'), NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(Date.parse('2026-11-10T04:00:00Z'), NO_HOLIDAYS), 'offPeak')
    assert.equal(tierAt(Date.parse('2026-11-10T06:00:00Z'), NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(Date.parse('2026-11-10T09:59:00Z'), NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(Date.parse('2026-11-10T10:00:00Z'), NO_HOLIDAYS), 'offPeak')
  })

  it('keeps weekends and listed holidays off-peak all day', () => {
    const { holidays } = resolvePricing({})
    assert.equal(tierAt(beijing('2026-11-07T10:00:00'), holidays), 'offPeak') // Saturday
    assert.equal(tierAt(beijing('2026-11-08T15:00:00'), holidays), 'offPeak') // Sunday
    assert.equal(tierAt(beijing('2026-10-01T10:00:00'), holidays), 'offPeak') // National Day, Thursday
    assert.equal(tierAt(beijing('2026-02-16T10:00:00'), holidays), 'offPeak') // Spring Festival, Monday
    assert.equal(tierAt(beijing('2026-10-10T10:00:00'), holidays), 'offPeak') // make-up workday, Saturday
    assert.equal(tierAt(beijing('2026-10-09T10:00:00'), holidays), 'peak') // ordinary Friday
    assert.equal(tierAt(beijing('2027-02-08T10:00:00'), holidays), 'offPeak') // 2027 Spring Festival, Monday
    assert.equal(tierAt(beijing('2027-06-09T10:00:00'), holidays), 'offPeak') // 2027 Dragon Boat, Wednesday
  })

  it('treats an unreadable time as peak, the higher price', () => {
    assert.equal(tierAt(undefined, NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(Number.NaN, NO_HOLIDAYS), 'peak')
  })

  it('leaves holidays to the view when the fold records a slot', () => {
    assert.equal(slotAt(beijing('2026-10-01T10:00:00')), 'peak')
    assert.equal(slotAt(beijing('2026-11-08T10:00:00')), 'offPeak')
    assert.equal(dateAt(Date.parse('2026-11-09T17:00:00Z')), '2026-11-10')
    assert.equal(dateAt(undefined), '')
  })
})

describe('bands and model ids', () => {
  it('counts the long-context sizes a prompt exceeds', () => {
    assert.equal(bandOf(0), 0)
    assert.equal(bandOf(32_000), 0)
    assert.equal(bandOf(32_001), 1)
    assert.equal(bandOf(100_001), 2)
    assert.equal(bandOf(272_001), 6)
    assert.equal(bandOf(2_000_000), 7)
  })

  it('spells gateway, Bedrock, Vertex, and dotted ids one way', () => {
    assert.equal(canonicalModel('anthropic/claude-opus-4.5'), 'claude-opus-4-5')
    assert.equal(canonicalModel('us.anthropic.claude-sonnet-4-5-20250929-v1:0'), 'claude-sonnet-4-5-20250929')
    assert.equal(canonicalModel('claude-opus-4-5@20251101'), 'claude-opus-4-5')
    assert.equal(canonicalModel(' MiniMax-M3 '), 'minimax-m3')
    assert.equal(canonicalModel('openai/gpt-5.4'), 'gpt-5-4')
    assert.equal(canonicalModel('something-v1'), 'something-v1')
  })

  it('finds built-in prices under every spelling, dated snapshots included', () => {
    for (const id of ['claude-opus-4-5', 'anthropic/claude-opus-4.5', 'claude-opus-4-5-20251101', 'us.anthropic.claude-opus-4-5-20251101-v1:0']) {
      assert.deepEqual(card(builtinPrice(id), 'USD'), { input: 5, cacheRead: 0.5, cacheWrite: 6.25, output: 25 }, id)
    }
    assert.equal(builtinPrice('doubao-seed-2-0-pro-260215'), builtinPrice('doubao-seed-2.0-pro'))
    assert.equal(builtinPrice('z-ai/glm-5.3').sig, 'CNY+USD')
    assert.equal(builtinPrice('deepseek-v4-flash'), builtinPrice('deepseek-flash'))
    assert.deepEqual(card(builtinPrice('deepseek/deepseek-v4-pro:free'), 'USD'), { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
    assert.equal(builtinPrice('hy4-unknown'), undefined)
  })

  it('lists every vendor the README promises', () => {
    const ids = Object.keys(BUILTIN_PRICES)
    for (const prefix of ['deepseek', 'claude', 'gpt', 'gemini', 'grok', 'kimi', 'glm', 'minimax', 'qwen', 'doubao', 'hy', 'ernie', 'mimo', 'step', 'ling', 'longcat']) {
      assert.ok(ids.some(id => id.startsWith(prefix)), prefix)
    }
    for (const [id, prices] of Object.entries(BUILTIN_PRICES)) {
      for (const currency of Object.keys(prices)) assert.match(currency, /^(CNY|USD)$/, id)
    }
  })
})

describe('tierFor', () => {
  it('switches to the long-context price once a prompt exceeds the threshold', () => {
    const haiku = builtinPrice('claude-haiku-5-5')
    assert.equal(card(haiku, 'USD', { band: bandOf(100_000) }).input, 0.1)
    assert.equal(card(haiku, 'USD', { band: bandOf(100_001) }).input, 0.5)
    const gpt = builtinPrice('gpt-5.5')
    assert.equal(card(gpt, 'USD', { band: bandOf(272_000) }).output, 30)
    assert.equal(card(gpt, 'USD', { band: bandOf(300_000) }).output, 45)
    const doubao = builtinPrice('doubao-seed-2.0-pro')
    assert.equal(card(doubao, 'CNY', { band: bandOf(20_000) }).input, 3.2)
    assert.equal(card(doubao, 'CNY', { band: bandOf(50_000) }).input, 4.8)
    assert.equal(card(doubao, 'CNY', { band: bandOf(129_000) }).input, 9.6)
  })

  it('applies a price change from its Beijing date, and today\'s price to undated calls', () => {
    const argon = builtinPrice('gemini-4-argon')
    assert.equal(card(argon, 'USD', { date: '2026-11-30' }).input, 2)
    assert.equal(card(argon, 'USD', { date: '2026-12-01' }).input, 4)
    assert.equal(card(argon, 'USD', { date: '' }).input, 4)
    const step = builtinPrice('step-5-preview')
    assert.equal(card(step, 'CNY', { date: '2026-10-13' }).cacheRead, 0.35)
    assert.equal(card(step, 'CNY', { date: '2026-10-14' }).cacheRead, 0.7)
  })
})

describe('resolvePricing', () => {
  it('defaults to CNY, the regional currency list, live rates, time-of-day pricing, and the list label', () => {
    const pricing = resolvePricing(undefined)
    assert.equal(pricing.currency, 'CNY')
    assert.deepEqual([...pricing.currencies], DEFAULT_CURRENCIES)
    assert.equal(pricing.symbol, null)
    assert.equal(pricing.liveRates, true)
    assert.equal(pricing.timeOfDay, true)
    assert.equal(pricing.showInSessionList, true)
  })

  it('reads the currency, the picker list, the symbol, and the rates switch', () => {
    const pricing = resolvePricing({ currency: 'usd', currencies: ['eur', 'EUR', 'nope!', 42, 'JPY'], symbol: 'US$', exchangeRates: false })
    assert.equal(pricing.currency, 'USD')
    assert.deepEqual([...pricing.currencies], ['USD', 'EUR', 'JPY'])
    assert.equal(pricing.symbol, 'US$')
    assert.equal(pricing.liveRates, false)
    assert.deepEqual([...resolvePricing({ currencies: ['USD', 'CNY'] }).currencies], ['USD', 'CNY'])
  })

  it('prices the official models from the built-in CNY and USD tables', () => {
    const pro = resolvePricing({}).priceFor('deepseek-account', 'deepseek-v4-pro')
    assert.deepEqual(pro.currencies, ['CNY', 'USD'])
    assert.deepEqual(card(pro, 'CNY'), { input: 9, cacheRead: 0.3, cacheWrite: 9, output: 27 })
    assert.deepEqual(card(pro, 'USD', { slot: 'offPeak' }), { input: 0.66, cacheRead: 0.022, cacheWrite: 0.66, output: 1.98 })
    assert.equal(resolvePricing({}).priceFor('x', 'DeepSeek-V4-Pro'), pro)
  })

  it('lets provider/model overrides beat model overrides and built-ins, in the config currency', () => {
    const pricing = resolvePricing({
      currency: 'CNY',
      models: {
        'deepseek-v4-pro': { input: 1, output: 2 },
        'deepseek-account/deepseek-v4-pro': { input: 0, cacheHit: 0, output: 0 },
        hy5: { input: '0.8', cacheHit: 0.2, output: 2, offPeak: { output: 1 } },
        'glm-5.3': { input: 1, output: 3, currency: 'usd' },
      },
    })
    assert.deepEqual(card(pricing.priceFor('deepseek-account', 'deepseek-v4-pro'), 'CNY'), { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
    assert.deepEqual(card(pricing.priceFor('deepseek-official', 'deepseek-v4-pro'), 'CNY'), { input: 1, cacheRead: 1, cacheWrite: 1, output: 2 })
    const hy = pricing.priceFor('hy', 'hy5')
    assert.deepEqual(hy.currencies, ['CNY'])
    assert.deepEqual(card(hy, 'CNY'), { input: 0.8, cacheRead: 0.2, cacheWrite: 0.8, output: 2 })
    assert.deepEqual(card(hy, 'CNY', { slot: 'offPeak' }), { input: 0.8, cacheRead: 0.2, cacheWrite: 0.8, output: 1 })
    // A model-only key also prices the gateway spelling of that model.
    const glm = pricing.priceFor('openrouter', 'z-ai/glm-5.3')
    assert.deepEqual(glm.currencies, ['USD'])
    assert.equal(card(glm, 'USD').output, 3)
  })

  it('uses the v1 top-level prices as the fallback for unknown models only', () => {
    const pricing = resolvePricing({ inputPrice: 2, cacheHitPrice: 0.5, outputPrice: 8 })
    assert.deepEqual(card(pricing.priceFor('hy', 'hy5'), 'CNY'), { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 })
    assert.equal(card(pricing.priceFor('', 'deepseek-v4-pro'), 'CNY').input, 9)
    assert.deepEqual(card(resolvePricing({ fallback: { input: 3, output: 6 } }).priceFor('a', 'b'), 'CNY'),
      { input: 3, cacheRead: 3, cacheWrite: 3, output: 6 })
  })

  it('leaves unknown models unpriced and ignores malformed entries', () => {
    const pricing = resolvePricing({
      models: { broken: { input: -1, output: 2 }, words: { input: 'cheap', output: 1 }, empty: {} },
      holidays: ['2028-01-01', 'not a date', 42],
      timeOfDayPricing: false,
      showInSessionList: false,
    })
    assert.equal(pricing.priceFor('', 'hy5'), undefined)
    assert.equal(pricing.priceFor('', 'broken'), undefined)
    assert.equal(pricing.priceFor('', 'words'), undefined)
    assert.equal(pricing.priceFor('', 'empty'), undefined)
    assert.ok(pricing.holidays.has('2028-01-01'))
    assert.ok(pricing.holidays.has('2026-10-01'))
    assert.equal(pricing.holidays.has('not a date'), false)
    assert.equal(pricing.timeOfDay, false)
    assert.equal(pricing.showInSessionList, false)
  })
})

describe('priceLedger and buildView', () => {
  const pro = (peak, offPeak = zero(), options = {}) => row('deepseek-v4-pro', peak, offPeak, { provider: 'deepseek-account', ...options })

  it('prices peak tokens at the peak card, in both official currencies', () => {
    const result = priceLedger([pro(buckets(1_000_000, 2_000_000, 100_000))], resolvePricing({}))
    // 1M miss * 9 + 2M hit * 0.3 + 0.1M out * 27; in USD 1.32 + 0.088 + 0.396
    assert.deepEqual(result.cost, { 'CNY+USD': { CNY: 12.3, USD: 1.804 } })
    assert.deepEqual(result.costs.input, { 'CNY+USD': { CNY: 9, USD: 1.32 } })
    assert.deepEqual(result.costs.cacheWrite, { 'CNY+USD': { CNY: 0, USD: 0 } })
    assert.deepEqual(result.saved, {})
    assert.equal(result.complete, true)
  })

  it('halves off-peak tokens and reports the saving', () => {
    const result = priceLedger([pro(zero(), buckets(1_000_000, 0, 1_000_000))], resolvePricing({}))
    assert.equal(result.cost['CNY+USD'].CNY, 4.5 + 13.5)
    assert.equal(result.saved['CNY+USD'].CNY, 18)
  })

  it('bills a holiday at the off-peak price, from the config of the moment', () => {
    const holiday = [pro(buckets(1_000_000), zero(), { date: '2026-10-01' })]
    assert.equal(priceLedger(holiday, resolvePricing({})).cost['CNY+USD'].CNY, 4.5)
    const added = [pro(buckets(1_000_000), zero(), { date: '2026-11-09' })]
    assert.equal(priceLedger(added, resolvePricing({})).cost['CNY+USD'].CNY, 9)
    assert.equal(priceLedger(added, resolvePricing({ holidays: ['2026-11-09'] })).cost['CNY+USD'].CNY, 4.5)
  })

  it('prices everything at peak when time-of-day pricing is off', () => {
    const result = priceLedger([pro(zero(), buckets(1_000_000, 0, 1_000_000))], resolvePricing({ timeOfDayPricing: false }))
    assert.equal(result.cost['CNY+USD'].CNY, 36)
    assert.deepEqual(result.saved, {})
  })

  it('bills cache writes at the cache-write price', () => {
    const pricing = resolvePricing({ models: { claude: { input: 3, cacheHit: 0.3, cacheWrite: 3.75, output: 15 } } })
    const result = priceLedger([row('claude', buckets(0, 0, 0, 1_000_000))], pricing)
    assert.deepEqual(result.cost, { CNY: { CNY: 3.75 } })
  })

  it('prices each band and date of a model separately', () => {
    const ledger = [
      row('gpt-5.5', buckets(1_000_000), zero(), { band: 0 }),
      row('gpt-5.5', buckets(1_000_000), zero(), { band: 6 }),
      row('gemini-4-argon', buckets(1_000_000), zero(), { date: '2026-12-02' }),
    ]
    const result = priceLedger(ledger, resolvePricing({}))
    assert.deepEqual(result.cost, { USD: { USD: 5 + 10 + 4 } })
    assert.deepEqual(result.models.map(m => [m.model, m.cost]), [['gpt-5.5', { USD: { USD: 15 } }], ['gemini-4-argon', { USD: { USD: 4 } }]])
  })

  it('keeps unpriced models out of the total and flags the view', () => {
    const ledger = [pro(buckets(1_000_000)), row('hy5', buckets(500))]
    const result = priceLedger(ledger, resolvePricing({}))
    assert.deepEqual(result.cost, { 'CNY+USD': { CNY: 9, USD: 1.32 } })
    assert.equal(result.complete, false)
    assert.deepEqual(result.models.map(m => [m.model, m.cost]), [['deepseek-v4-pro', { 'CNY+USD': { CNY: 9, USD: 1.32 } }], ['hy5', null]])
  })

  it('groups models by the currencies they are priced in', () => {
    const ledger = [pro(buckets(1_000_000)), row('claude-opus-5-5', buckets(1_000_000)), row('qwen3.8-max', buckets(1_000_000))]
    assert.deepEqual(priceLedger(ledger, resolvePricing({})).cost, {
      'CNY+USD': { CNY: 9, USD: 1.32 },
      USD: { USD: 4 },
      CNY: { CNY: 12 },
    })
  })

  it('builds the client view with totals, hit rate, currencies, and the list flag', () => {
    const state = {
      ...initialState(),
      total: [pro(buckets(250_000, 750_000, 10_000, 0, 4_000))],
      calls: 3,
      turn: { no: 2, ledger: [pro(buckets(100_000))] },
    }
    const view = buildView(state, resolvePricing({}))
    assert.equal(view.v, 3)
    assert.equal(view.currency, 'CNY')
    assert.deepEqual([...view.currencies], DEFAULT_CURRENCIES)
    assert.equal(view.liveRates, true)
    assert.equal(view.calls, 3)
    assert.equal(view.cacheHitRate, 0.75)
    assert.equal(view.tokens.reasoning, 4_000)
    assert.equal(view.cost['CNY+USD'].CNY, 2.745) // 2.25 + 0.225 + 0.27
    assert.deepEqual(view.turn, { no: 2, cost: { 'CNY+USD': { CNY: 0.9, USD: 0.132 } }, complete: true })
    assert.equal(view.compaction, null)
    assert.equal(view.showInList, true)
    assert.equal(view.tiered, true)
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(view))), JSON.stringify(view))
  })
})
