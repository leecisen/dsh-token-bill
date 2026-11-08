/**
 * The `dshTokenBill` session projection: a replay-stable fold of every billed
 * model call in one Session log into token buckets, kept per route
 * (provider + model), Beijing date, prompt-size band, and time slot
 * (DeepSeek peak / off-peak).
 *
 * The state holds tokens and facts about each call only. Prices, holidays,
 * and currencies are applied by the view (see `lib/pricing.js`), so a price or
 * config edit re-prices every Session without re-folding its log, and a
 * checkpoint stays valid across price changes.
 */
import { bandOf, buildView, dateAt, slotAt } from './pricing.js'

/** Projection key; distinct from v1's `tokenCost` so both versions can coexist during an upgrade. */
export const PROJECTION_KEY = 'dshTokenBill'

/** Bump whenever the state shape or fold semantics change: stale checkpoints are then discarded. */
export const STATE_VERSION = 3

const FIELDS = Object.freeze(['input', 'cacheRead', 'cacheWrite', 'output', 'reasoning'])

const UNKNOWN_ROUTE = Object.freeze({ provider: '', model: '' })

/** @returns {object} an all-zero bucket set. */
export function emptyBuckets() {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }
}

function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

/**
 * Bucket one provider usage sample. `inputTokens` is the uncached (cache-miss)
 * prompt part, as the built-in token meter reads it; reasoning tokens are a
 * subset of output and only reported for display.
 * @param {object} usage - an LLM usage record.
 * @returns {object} bucket set.
 */
export function bucketsFromUsage(usage) {
  const output = count(usage.outputTokens)
  return {
    input: count(usage.inputTokens),
    cacheRead: count(usage.cacheReadTokens),
    cacheWrite: count(usage.cacheWriteTokens),
    output,
    reasoning: Math.min(count(usage.reasoningTokens), output),
  }
}

function bucketsEqual(a, b) {
  return FIELDS.every(field => a[field] === b[field])
}

function bucketsEmpty(buckets) {
  return FIELDS.every(field => buckets[field] === 0)
}

function routeOf(provider, model) {
  if (typeof model !== 'string' || model.length === 0) return undefined
  return { provider: typeof provider === 'string' ? provider : '', model }
}

function sameRoute(a, b) {
  return a != null && b != null && a.provider === b.provider && a.model === b.model
}

/** Ledger key of one call: its route, Beijing date, and prompt-size band. */
function keyOf(route, time, buckets) {
  return {
    provider: route.provider,
    model: route.model,
    date: dateAt(time),
    band: bandOf(buckets.input + buckets.cacheRead + buckets.cacheWrite),
  }
}

function sameKey(a, b) {
  return sameRoute(a, b) && a.date === b.date && a.band === b.band
}

/**
 * Add (`sign` = 1) or remove (`sign` = -1) one bucket set from a ledger without
 * mutating it. An entry that drops to zero is removed.
 * @param {ReadonlyArray<object>} ledger - ledger entries.
 * @param {{ provider: string, model: string, date: string, band: number }} key - the call's ledger key.
 * @param {'peak' | 'offPeak'} slot - the call's time slot.
 * @param {object} buckets - the call's buckets.
 * @param {1 | -1} sign - direction.
 * @returns {ReadonlyArray<object>} the next ledger.
 */
export function ledgerAdd(ledger, key, slot, buckets, sign) {
  if (bucketsEmpty(buckets)) return ledger
  const index = ledger.findIndex(entry => sameKey(entry, key))
  if (index < 0 && sign < 0) return ledger
  const base = index >= 0
    ? ledger[index]
    : { provider: key.provider, model: key.model, date: key.date, band: key.band, peak: emptyBuckets(), offPeak: emptyBuckets() }
  const next = {}
  for (const field of FIELDS) next[field] = Math.max(0, base[slot][field] + sign * buckets[field])
  const entry = { ...base, [slot]: next }
  if (index < 0) return [...ledger, entry]
  if (bucketsEmpty(entry.peak) && bucketsEmpty(entry.offPeak)) return ledger.filter((_, i) => i !== index)
  const copy = ledger.slice()
  copy[index] = entry
  return copy
}

/** The usage sample of one Assistant settlement, mirroring the built-in token meter. */
function usageOf(event) {
  const data = event.data
  if (event.type === 'assistant/message' && data.usage != null) return data.usage
  const stream = data.stream
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record != null && record.type === 'chunk' && record.chunk != null && record.chunk.type === 'usage') {
      return record.chunk.usage
    }
  }
  return undefined
}

/**
 * Initial state. Events below `inheritedEventCount` were copied from the parent
 * when this Session was forked; they were billed there, so they are not billed
 * again here.
 * @param {number} [inheritedEventCount] - fork-inherited cut.
 * @returns {object} state.
 */
export function initialState(inheritedEventCount) {
  return {
    inherited: typeof inheritedEventCount === 'number' && inheritedEventCount > 0 ? inheritedEventCount : 0,
    total: [],
    compaction: [],
    calls: 0,
    compactions: 0,
    turn: null,
    turnNo: null,
    last: null,
    header: null,
  }
}

function inherited(state, event) {
  return typeof event.seq === 'number' && event.seq < state.inherited
}

/** One `assistant/attempt` or `assistant/message`: a billed model call, or the final sample of one. */
function foldSettlement(state, event, slotOf) {
  if (inherited(state, event)) return state
  const data = event.data
  const sample = usageOf(event)
  if (typeof sample !== 'object' || sample === null) return state
  const { turn, step } = data
  if (typeof turn !== 'number' || typeof step !== 'number') return state

  const source = event.type === 'assistant/message' && data.message != null ? data.message.source : undefined
  const route = (source != null ? routeOf(source.provider, source.model) : undefined) ?? state.header ?? UNKNOWN_ROUTE
  const slot = slotOf(event.time)
  const buckets = bucketsFromUsage(sample)
  const key = keyOf(route, event.time, buckets)

  // A final message sample replaces the streaming sample of the same attempt;
  // `llm/retry-started` closes that slot, so a retried attempt adds instead.
  const previous = state.last !== null && state.last.turn === turn && state.last.step === step ? state.last : null
  if (previous !== null && previous.slot === slot && sameKey(previous.key, key) && bucketsEqual(previous.buckets, buckets)) {
    return state
  }

  let total = state.total
  let current = state.turn !== null && state.turn.no === turn ? state.turn.ledger : []
  if (previous !== null) {
    total = ledgerAdd(total, previous.key, previous.slot, previous.buckets, -1)
    current = ledgerAdd(current, previous.key, previous.slot, previous.buckets, -1)
  }
  return {
    ...state,
    total: ledgerAdd(total, key, slot, buckets, 1),
    turn: { no: turn, ledger: ledgerAdd(current, key, slot, buckets, 1) },
    calls: previous === null ? state.calls + 1 : state.calls,
    last: { turn, step, key, slot, buckets },
  }
}

/** One `compaction/summary`: the summarizer's own model call, which the built-in meter does not count. */
function foldCompaction(state, event, slotOf) {
  if (inherited(state, event)) return state
  const data = event.data
  if (typeof data.usage !== 'object' || data.usage === null) return state
  const buckets = bucketsFromUsage(data.usage)
  if (bucketsEmpty(buckets)) return state
  const route = routeOf(data.provider, data.model) ?? state.header ?? UNKNOWN_ROUTE
  const slot = slotOf(event.time)
  const key = keyOf(route, event.time, buckets)
  const no = typeof state.turnNo === 'number' ? state.turnNo : state.turn !== null ? state.turn.no : 0
  const current = state.turn !== null && state.turn.no === no ? state.turn.ledger : []
  return {
    ...state,
    total: ledgerAdd(state.total, key, slot, buckets, 1),
    compaction: ledgerAdd(state.compaction, key, slot, buckets, 1),
    compactions: state.compactions + 1,
    turn: { no, ledger: ledgerAdd(current, key, slot, buckets, 1) },
  }
}

/**
 * Fold one committed Session event. Returns the same reference for events
 * that do not concern this unit, as the registry requires.
 * @param {object} state - current state.
 * @param {object} event - committed Session event.
 * @param {(time: number) => 'peak' | 'offPeak'} [slotOf] - time-slot classifier; tests pass their own.
 * @returns {object} next state.
 */
export function foldEvent(state, event, slotOf = slotAt) {
  const data = event.data
  if (typeof data !== 'object' || data === null) return state
  switch (event.type) {
    case 'request/header': {
      const config = data.header != null ? data.header.config : undefined
      const route = config != null ? routeOf(config.provider, config.model) : undefined
      return route === undefined || sameRoute(route, state.header) ? state : { ...state, header: route }
    }
    case 'turn/start':
      return typeof data.turn !== 'number' || data.turn === state.turnNo ? state : { ...state, turnNo: data.turn }
    case 'llm/retry-started':
      return state.last !== null && state.last.turn === data.turn && state.last.step === data.step
        ? { ...state, last: null }
        : state
    case 'assistant/attempt':
    case 'assistant/message':
      return foldSettlement(state, event, slotOf)
    case 'compaction/summary':
      return foldCompaction(state, event, slotOf)
    default:
      return state
  }
}

function isCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isBuckets(value) {
  return typeof value === 'object' && value !== null && FIELDS.every(field => isCount(value[field]))
}

function isKey(value) {
  return typeof value === 'object' && value !== null
    && typeof value.provider === 'string' && typeof value.model === 'string'
    && typeof value.date === 'string' && Number.isInteger(value.band) && value.band >= 0
}

function isLedger(value) {
  return Array.isArray(value) && value.every(entry => isKey(entry) && isBuckets(entry.peak) && isBuckets(entry.offPeak))
}

/**
 * Validate a state restored from a persisted checkpoint. The registry discards
 * rows whose version differs; this guards against a corrupted row of the right
 * version reaching the fold.
 * @param {unknown} value - candidate state.
 * @returns {object} the same value.
 * @throws {Error} when the value is not a state of this version.
 */
export function parseState(value) {
  const ok = typeof value === 'object' && value !== null
    && isCount(value.inherited) && isLedger(value.total) && isLedger(value.compaction)
    && isCount(value.calls) && isCount(value.compactions)
    && (value.turn === null || (typeof value.turn === 'object' && isCount(value.turn.no) && isLedger(value.turn.ledger)))
    && (value.turnNo === null || isCount(value.turnNo))
    && (value.header === null || (typeof value.header === 'object' && typeof value.header.model === 'string'))
    && (value.last === null || (typeof value.last === 'object' && isKey(value.last.key) && isBuckets(value.last.buckets)))
  if (!ok) throw new Error('dsh-token-bill: invalid projection state')
  return value
}

/**
 * The projection definition registered with `ctx.sessionProjections`.
 * @param {object} pricing - result of `resolvePricing(config)`.
 * @returns {object} projection definition.
 */
export function createTokenCostProjection(pricing) {
  return {
    key: PROJECTION_KEY,
    stateVersion: STATE_VERSION,
    stateSchema: { parse: parseState },
    init: (_header, inheritedEventCount) => initialState(inheritedEventCount),
    apply: (state, event) => foldEvent(state, event),
    wire: {
      viewSchema: {
        parse: (value) => {
          if (typeof value !== 'object' || value === null || typeof value.then === 'function') {
            throw new Error('dsh-token-bill: view must be a plain object')
          }
          return value
        },
      },
      view: state => buildView(state, pricing),
    },
  }
}
