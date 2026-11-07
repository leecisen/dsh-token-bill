import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildView, priceLedger, resolvePricing, tierAt } from '../lib/pricing.js'
import { initialState } from '../lib/fold.js'

/** Epoch ms of a Beijing wall-clock time. */
const beijing = (iso) => Date.parse(`${iso}+08:00`)

const NO_HOLIDAYS = new Set()

const buckets = (input = 0, cacheRead = 0, output = 0, cacheWrite = 0, reasoning = 0) =>
  ({ input, cacheRead, cacheWrite, output, reasoning })
const zero = () => buckets()

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
  })

  it('treats an unreadable time as peak, the higher price', () => {
    assert.equal(tierAt(undefined, NO_HOLIDAYS), 'peak')
    assert.equal(tierAt(Number.NaN, NO_HOLIDAYS), 'peak')
  })
})

describe('resolvePricing', () => {
  it('defaults to CNY with time-of-day pricing and the list label on', () => {
    const pricing = resolvePricing(undefined)
    assert.equal(pricing.currency, 'CNY')
    assert.equal(pricing.symbol, '¥')
    assert.equal(pricing.timeOfDay, true)
    assert.equal(pricing.showInSessionList, true)
  })

  it('prices the official models from the built-in table', () => {
    const pricing = resolvePricing({})
    assert.deepEqual(pricing.priceFor('deepseek-account', 'deepseek-v4-pro').peak,
      { input: 9, cacheHit: 0.3, cacheWrite: 9, output: 27 })
    assert.deepEqual(pricing.priceFor('deepseek-official', 'deepseek-flash').offPeak,
      { input: 1, cacheHit: 0.02, cacheWrite: 1, output: 4 })
    // Retired names are billed at the Flash price.
    assert.equal(pricing.priceFor('deepseek-official', 'deepseek-v4-flash'), pricing.priceFor('x', 'deepseek-flash'))
    assert.equal(pricing.priceFor('x', 'DeepSeek-V4-Pro'), pricing.priceFor('x', 'deepseek-v4-pro'))
  })

  it('switches tables and symbol with the currency', () => {
    const pricing = resolvePricing({ currency: 'usd' })
    assert.equal(pricing.currency, 'USD')
    assert.equal(pricing.symbol, '$')
    assert.deepEqual(pricing.priceFor('', 'deepseek-v4-pro').offPeak,
      { input: 0.66, cacheHit: 0.022, cacheWrite: 0.66, output: 1.98 })
    // No built-in table for other currencies: only configured prices apply.
    assert.equal(resolvePricing({ currency: 'EUR' }).priceFor('', 'deepseek-v4-pro'), undefined)
    assert.equal(resolvePricing({ currency: 'EUR' }).symbol, '€')
  })

  it('lets provider/model overrides beat model overrides and built-ins', () => {
    const pricing = resolvePricing({
      models: {
        'deepseek-v4-pro': { input: 1, output: 2 },
        'deepseek-account/deepseek-v4-pro': { input: 0, cacheHit: 0, output: 0 },
        hy4: { input: '0.8', cacheHit: 0.2, output: 2, offPeak: { output: 1 } },
      },
    })
    assert.deepEqual(pricing.priceFor('deepseek-account', 'deepseek-v4-pro').peak,
      { input: 0, cacheHit: 0, cacheWrite: 0, output: 0 })
    assert.deepEqual(pricing.priceFor('deepseek-official', 'deepseek-v4-pro').peak,
      { input: 1, cacheHit: 1, cacheWrite: 1, output: 2 })
    const hy = pricing.priceFor('hy4', 'hy4')
    assert.deepEqual(hy.peak, { input: 0.8, cacheHit: 0.2, cacheWrite: 0.8, output: 2 })
    assert.deepEqual(hy.offPeak, { input: 0.8, cacheHit: 0.2, cacheWrite: 0.8, output: 1 })
  })

  it('uses the v1 top-level prices as the fallback for unknown models only', () => {
    const pricing = resolvePricing({ inputPrice: 2, cacheHitPrice: 0.5, outputPrice: 8 })
    assert.deepEqual(pricing.priceFor('hy4', 'hy4').peak, { input: 2, cacheHit: 0.5, cacheWrite: 2, output: 8 })
    assert.equal(pricing.priceFor('hy4', 'hy4').offPeak, undefined)
    assert.equal(pricing.priceFor('', 'deepseek-v4-pro').peak.input, 9)
    assert.deepEqual(resolvePricing({ fallback: { input: 3, output: 6 } }).priceFor('a', 'b').peak,
      { input: 3, cacheHit: 3, cacheWrite: 3, output: 6 })
  })

  it('leaves unknown models unpriced and ignores malformed entries', () => {
    const pricing = resolvePricing({
      models: { broken: { input: -1, output: 2 }, words: { input: 'cheap', output: 1 }, empty: {} },
      holidays: ['2027-01-01', 'not a date', 42],
      timeOfDayPricing: false,
      showInSessionList: false,
    })
    assert.equal(pricing.priceFor('', 'hy4'), undefined)
    assert.equal(pricing.priceFor('', 'broken'), undefined)
    assert.equal(pricing.priceFor('', 'words'), undefined)
    assert.equal(pricing.priceFor('', 'empty'), undefined)
    assert.ok(pricing.holidays.has('2027-01-01'))
    assert.ok(pricing.holidays.has('2026-10-01'))
    assert.equal(pricing.holidays.has('not a date'), false)
    assert.equal(pricing.timeOfDay, false)
    assert.equal(pricing.showInSessionList, false)
  })
})

describe('priceLedger and buildView', () => {
  const pro = (peak, offPeak = zero()) => ({ provider: 'deepseek-account', model: 'deepseek-v4-pro', peak, offPeak })

  it('prices peak tokens at the peak card', () => {
    const result = priceLedger([pro(buckets(1_000_000, 2_000_000, 100_000))], resolvePricing({}))
    // 1M miss * 9 + 2M hit * 0.3 + 0.1M out * 27
    assert.equal(result.cost, 12.3)
    assert.deepEqual(result.costs, { input: 9, cacheRead: 0.6, cacheWrite: 0, output: 2.7 })
    assert.equal(result.saved, 0)
    assert.equal(result.complete, true)
  })

  it('halves off-peak tokens and reports the saving', () => {
    const result = priceLedger([pro(zero(), buckets(1_000_000, 0, 1_000_000))], resolvePricing({}))
    assert.equal(result.cost, 4.5 + 13.5)
    assert.equal(result.saved, 18)
  })

  it('prices everything at peak when time-of-day pricing is off', () => {
    const result = priceLedger([pro(zero(), buckets(1_000_000, 0, 1_000_000))], resolvePricing({ timeOfDayPricing: false }))
    assert.equal(result.cost, 36)
    assert.equal(result.saved, 0)
  })

  it('bills cache writes at the cache-write price', () => {
    const pricing = resolvePricing({ models: { claude: { input: 3, cacheHit: 0.3, cacheWrite: 3.75, output: 15 } } })
    const result = priceLedger([{ provider: 'x', model: 'claude', peak: buckets(0, 0, 0, 1_000_000), offPeak: zero() }], pricing)
    assert.equal(result.cost, 3.75)
  })

  it('keeps unpriced models out of the total and flags the view', () => {
    const ledger = [pro(buckets(1_000_000)), { provider: 'hy4', model: 'hy4', peak: buckets(500), offPeak: zero() }]
    const result = priceLedger(ledger, resolvePricing({}))
    assert.equal(result.cost, 9)
    assert.equal(result.complete, false)
    assert.deepEqual(result.models.map(m => [m.model, m.cost]), [['deepseek-v4-pro', 9], ['hy4', null]])
  })

  it('builds the client view with totals, hit rate, and the list flag', () => {
    const state = {
      ...initialState(),
      total: [pro(buckets(250_000, 750_000, 10_000, 0, 4_000))],
      calls: 3,
      turn: { no: 2, ledger: [pro(buckets(100_000))] },
    }
    const view = buildView(state, resolvePricing({}))
    assert.equal(view.v, 2)
    assert.equal(view.symbol, '¥')
    assert.equal(view.calls, 3)
    assert.equal(view.cacheHitRate, 0.75)
    assert.equal(view.tokens.reasoning, 4_000)
    assert.equal(view.cost, 2.745) // 2.25 + 0.225 + 0.27
    assert.deepEqual(view.turn, { no: 2, cost: 0.9, complete: true })
    assert.equal(view.compaction, null)
    assert.equal(view.showInList, true)
    assert.equal(view.tiered, true)
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(view))), JSON.stringify(view))
  })
})
