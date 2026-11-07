import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import {
  PROJECTION_KEY,
  STATE_VERSION,
  createTokenCostProjection,
  foldEvent,
  initialState,
  parseState,
} from '../lib/fold.js'
import { resolvePricing } from '../lib/pricing.js'

const PEAK = Date.parse('2026-11-09T10:00:00+08:00') // Monday 10:00 Beijing
const OFF_PEAK = Date.parse('2026-11-09T20:00:00+08:00') // Monday 20:00 Beijing

let seq = 0
const event = (type, data, time = PEAK) => ({ type, seq: seq++, time, data })
const usage = (inputTokens, outputTokens, cacheReadTokens = 0, extra = {}) =>
  ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens: 0, ...extra })
const source = (provider, model) => ({ kind: 'model', provider, model })

const header = (provider, model) => event('request/header', { header: { config: { provider, model } }, reason: 'initial' })
const turnStart = turn => event('turn/start', { turn })
const message = (turn, step, sample, src = source('deepseek-account', 'deepseek-v4-pro'), time = PEAK) =>
  event('assistant/message', { turn, step, usage: sample, stream: [], message: { role: 'assistant', content: [], source: src } }, time)
const attempt = (turn, step, sample, time = PEAK) =>
  event('assistant/attempt', { turn, step, stream: [{ type: 'chunk', chunk: { type: 'usage', usage: sample } }] }, time)
const retryStarted = (turn, step) => event('llm/retry-started', { turn, step, attempt: 2 })
const compaction = (sample, provider = 'deepseek-account', model = 'deepseek-flash') =>
  event('compaction/summary', { compactionId: 'c1', summary: [], provider, model, usage: sample })

const allPeak = () => 'peak'
const run = (events, state = initialState(), tierOf = allPeak) =>
  events.reduce((current, next) => foldEvent(current, next, tierOf), state)

const entry = (state, model) => state.total.find(e => e.model === model)

beforeEach(() => {
  seq = 0
})

describe('foldEvent', () => {
  it('bills a message under the route its source names', () => {
    const state = run([
      header('deepseek-official', 'deepseek-flash'),
      turnStart(0),
      message(0, 0, usage(1000, 200, 3000, { reasoningTokens: 150 })),
    ])
    assert.equal(state.calls, 1)
    assert.equal(state.total.length, 1)
    assert.deepEqual(entry(state, 'deepseek-v4-pro'), {
      provider: 'deepseek-account',
      model: 'deepseek-v4-pro',
      peak: { input: 1000, cacheRead: 3000, cacheWrite: 0, output: 200, reasoning: 150 },
      offPeak: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 },
    })
  })

  it('attributes an attempt to the latest request header route', () => {
    const state = run([header('deepseek-official', 'deepseek-flash'), turnStart(0), attempt(0, 0, usage(10, 5))])
    assert.equal(entry(state, 'deepseek-flash').provider, 'deepseek-official')
    assert.equal(entry(state, 'deepseek-flash').peak.input, 10)
  })

  it('replaces the streaming sample of an attempt with its final message sample', () => {
    const state = run([
      header('deepseek-account', 'deepseek-v4-pro'),
      turnStart(0),
      attempt(0, 0, usage(100, 1)),
      message(0, 0, usage(100, 50)),
    ])
    assert.equal(state.calls, 1)
    assert.equal(entry(state, 'deepseek-v4-pro').peak.output, 50)
    assert.equal(entry(state, 'deepseek-v4-pro').peak.input, 100)
  })

  it('adds a retried attempt once llm/retry-started closes the slot', () => {
    const state = run([
      header('deepseek-account', 'deepseek-v4-pro'),
      turnStart(0),
      attempt(0, 0, usage(100, 1)),
      retryStarted(0, 0),
      message(0, 0, usage(100, 50)),
    ])
    assert.equal(state.calls, 2)
    assert.equal(entry(state, 'deepseek-v4-pro').peak.input, 200)
    assert.equal(entry(state, 'deepseek-v4-pro').peak.output, 51)
  })

  it('counts every step of a turn', () => {
    const state = run([turnStart(0), message(0, 0, usage(10, 1)), message(0, 1, usage(20, 2)), message(0, 2, usage(30, 3))])
    assert.equal(state.calls, 3)
    assert.equal(entry(state, 'deepseek-v4-pro').peak.input, 60)
  })

  it('keeps the same state reference when nothing billable changes', () => {
    const start = run([turnStart(0), message(0, 0, usage(10, 1))])
    assert.equal(foldEvent(start, event('step/end', { turn: 0, step: 0 }), allPeak), start)
    assert.equal(foldEvent(start, event('user/message', { message: {} }), allPeak), start)
    assert.equal(foldEvent(start, message(0, 0, usage(10, 1)), allPeak), start)
    assert.equal(foldEvent(start, retryStarted(5, 5), allPeak), start)
    assert.equal(foldEvent(start, turnStart(0), allPeak), start)
    assert.equal(foldEvent(start, event('assistant/message', { turn: 0, step: 1, stream: [] }), allPeak), start)
  })

  it('prefers the message usage field over the stream usage chunk', () => {
    const settled = event('assistant/message', {
      turn: 0,
      step: 0,
      usage: usage(7, 7),
      stream: [{ type: 'chunk', chunk: { type: 'usage', usage: usage(1, 1) } }],
      message: { source: source('p', 'm') },
    })
    assert.equal(run([settled]).total[0].peak.input, 7)
  })

  it('splits tokens by the billing tier of each event time', () => {
    const projection = createTokenCostProjection(resolvePricing({}))
    const events = [
      turnStart(0),
      message(0, 0, usage(1_000_000, 0), source('deepseek-account', 'deepseek-v4-pro'), PEAK),
      message(0, 1, usage(1_000_000, 0), source('deepseek-account', 'deepseek-v4-pro'), OFF_PEAK),
    ]
    const state = events.reduce(projection.apply, projection.init({}, 0))
    assert.equal(entry(state, 'deepseek-v4-pro').peak.input, 1_000_000)
    assert.equal(entry(state, 'deepseek-v4-pro').offPeak.input, 1_000_000)
    const view = projection.wire.view(state)
    assert.equal(view.cost, 9 + 4.5)
    assert.equal(view.saved, 4.5)
  })

  it('moves a replaced sample between tiers when its time crosses the boundary', () => {
    const state = run([
      turnStart(0),
      attempt(0, 0, usage(100, 1), PEAK),
      message(0, 0, usage(100, 10), source('a', 'm'), OFF_PEAK),
    ], initialState(), time => (time === PEAK ? 'peak' : 'offPeak'))
    const row = state.total.find(e => e.model === 'm')
    assert.equal(state.total.length, 1, 'the header-less attempt entry is removed once replaced')
    assert.equal(row.peak.input, 0)
    assert.equal(row.offPeak.input, 100)
    assert.equal(row.offPeak.output, 10)
  })

  it('counts compaction summaries, which the built-in meter does not', () => {
    const state = run([turnStart(0), message(0, 0, usage(10, 1)), compaction(usage(5000, 800))])
    assert.equal(state.compactions, 1)
    assert.equal(state.calls, 1)
    assert.equal(entry(state, 'deepseek-flash').peak.input, 5000)
    assert.equal(state.compaction[0].peak.output, 800)
    assert.equal(foldEvent(state, event('compaction/summary', { provider: 'p', model: 'm' }), allPeak), state)
  })

  it('does not bill events a fork inherited from its parent', () => {
    const events = [
      header('deepseek-account', 'deepseek-v4-pro'), // seq 0
      turnStart(0), // seq 1
      message(0, 0, usage(999, 99)), // seq 2, inherited
      compaction(usage(999, 99)), // seq 3, inherited
      turnStart(1), // seq 4
      attempt(1, 0, usage(10, 1)), // seq 5, own
    ]
    const state = run(events, initialState(4))
    assert.equal(state.calls, 1)
    assert.equal(state.compactions, 0)
    assert.equal(state.total.length, 1)
    assert.equal(entry(state, 'deepseek-v4-pro').peak.input, 10, 'the inherited header still routes the attempt')
  })

  it('keeps the latest turn as its own ledger', () => {
    const first = run([turnStart(0), message(0, 0, usage(10, 1)), message(0, 1, usage(10, 1))])
    assert.equal(first.turn.no, 0)
    assert.equal(first.turn.ledger[0].peak.input, 20)
    const waiting = run([turnStart(1)], first)
    assert.equal(waiting.turn.no, 0, 'a turn without usage keeps showing the previous one')
    const compacted = run([compaction(usage(100, 10))], waiting)
    assert.equal(compacted.turn.no, 1, 'a compaction belongs to the turn that started it')
    const second = run([message(1, 0, usage(5, 1))], compacted)
    assert.equal(second.turn.no, 1)
    assert.deepEqual(second.turn.ledger.map(e => [e.model, e.peak.input]), [['deepseek-flash', 100], ['deepseek-v4-pro', 5]])
  })
})

describe('parseState', () => {
  it('accepts initial and folded states', () => {
    assert.ok(parseState(initialState()))
    const folded = run([header('a', 'b'), turnStart(0), message(0, 0, usage(1, 1)), compaction(usage(2, 2))])
    assert.equal(parseState(JSON.parse(JSON.stringify(folded))).calls, 1)
  })

  it('rejects values of another shape', () => {
    for (const bad of [null, 1, {}, { ...initialState(), total: [{}] }, { ...initialState(), calls: -1 }, { totals: {}, last: null }]) {
      assert.throws(() => parseState(bad), /invalid projection state/)
    }
  })
})

describe('createTokenCostProjection', () => {
  it('declares the key, version, and a JSON view', () => {
    const projection = createTokenCostProjection(resolvePricing({ currency: 'USD' }))
    assert.equal(projection.key, PROJECTION_KEY)
    assert.equal(projection.stateVersion, STATE_VERSION)
    const state = [turnStart(0), message(0, 0, usage(1_000_000, 1_000_000))].reduce(projection.apply, projection.init({}, 0))
    const view = projection.wire.viewSchema.parse(projection.wire.view(state))
    assert.equal(view.currency, 'USD')
    assert.equal(view.cost, 5.28) // 1.32 + 3.96
    assert.throws(() => projection.wire.viewSchema.parse(Promise.resolve({})), /plain object/)
  })
})
