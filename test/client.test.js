/**
 * Smoke test of the browser half without a browser: client.js runs against a
 * tiny React stand-in that renders function components to text, so the slot
 * registrations, the badge, the panel, the currency picker, and the sidebar
 * label can be checked under plain `node --test`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

import { createTokenCostProjection } from '../lib/fold.js'
import { resolvePricing } from '../lib/pricing.js'

const FRAGMENT = Symbol('Fragment')

/** Minimal React: elements, a few hooks, and cloneElement. `open` scripts useState. */
function fakeReact(stateQueue) {
  // Like React: positional children win over props.children; one child stays
  // a single element, several become an array.
  const createElement = (type, props, ...children) => ({
    type,
    props: children.length === 0
      ? { ...props }
      : { ...props, children: children.length === 1 ? children[0] : children },
  })
  return {
    createElement,
    Fragment: FRAGMENT,
    cloneElement: (element, extra) => ({ ...element, props: { ...element.props, ...extra } }),
    useState: initial => [stateQueue.length > 0 ? stateQueue.shift() : initial, () => {}],
    useRef: current => ({ current }),
    useEffect: () => {},
    useLayoutEffect: () => {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
}

/** Expand function components, so element trees can be searched and rendered. */
function expand(node) {
  if (node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(expand)
  if (typeof node.type === 'function') return expand(node.type(node.props))
  return { ...node, props: { ...node.props, children: expand(node.props.children) } }
}

/** Render to compact text: element tags become `<tag>`, attributes are dropped except title/aria-label. */
function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).join('')
  if (typeof node.type === 'function') return render(node.type(node.props))
  if (node.type === FRAGMENT) return render(node.props.children)
  const attrs = ['title', 'aria-label'].filter(name => node.props[name] !== undefined)
    .map(name => ` ${name}="${node.props[name]}"`).join('')
  return `<${node.type}${attrs}>${render(node.props.children)}</${node.type}>`
}

/** First element (after expansion) the predicate accepts. */
function find(node, predicate) {
  if (node === null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, predicate)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (predicate(node)) return node
  return find(node.props.children, predicate)
}

function loadClient({ open = false, stored = {} } = {}) {
  const stateQueue = open ? [true] : []
  const React = fakeReact(stateQueue)
  const modules = { react: React, 'react-dom': { createPortal: node => node } }
  let plugin
  const styles = []
  const document = {
    body: {},
    head: { appendChild: tag => styles.push(tag) },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, remove() {} }),
  }
  const storage = { ...stored }
  const sandbox = {
    document,
    window: {
      __ModuleLoader__: { load: ({ id, factory }) => { plugin = { id, ...factory(name => modules[name]) } } },
      localStorage: {
        getItem: key => (key in storage ? storage[key] : null),
        setItem: (key, value) => { storage[key] = String(value) },
      },
    },
  }
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox, { filename: 'client.js' })

  const registrations = []
  const dictionaries = {}
  const effects = []
  const ctx = {
    effect: (fn, label) => effects.push({ label, dispose: fn() }),
    locale: { register: (ns, dicts) => { dictionaries[ns] = dicts; return () => {} } },
    slots: {
      inject: (name, fn) => fn(),
      register: (options, component) => { registrations.push({ options, component }); return () => {} },
    },
  }
  plugin.apply(ctx)
  const t = (lang) => (key, params) => {
    const template = dictionaries.dshTokenBill[lang][key] ?? key
    return params ? template.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m)) : template
  }
  return { plugin, registrations, dictionaries, effects, t, stateQueue, storage }
}

/** A real view from the Host fold, so the client renders exactly what the Host would send. */
function viewFrom(events, config = {}) {
  const projection = createTokenCostProjection(resolvePricing(config))
  const state = events.reduce(projection.apply, projection.init({}, 0))
  return JSON.parse(JSON.stringify(projection.wire.view(state)))
}

const MONDAY_PEAK = Date.parse('2026-11-09T10:00:00+08:00')
const MONDAY_NIGHT = Date.parse('2026-11-09T22:00:00+08:00')
let seq = 0
const message = (turn, step, model, provider, usage, time = MONDAY_PEAK) => ({
  type: 'assistant/message',
  seq: seq++,
  time,
  data: { turn, step, usage, stream: [], message: { source: { kind: 'model', provider, model } } },
})

const SESSION_VIEW = viewFrom([
  { type: 'turn/start', seq: seq++, time: MONDAY_PEAK, data: { turn: 0 } },
  message(0, 0, 'deepseek-v4-pro', 'deepseek-account', { inputTokens: 120_000, cacheReadTokens: 880_000, outputTokens: 9_000, reasoningTokens: 3_000 }),
  { type: 'turn/start', seq: seq++, time: MONDAY_NIGHT, data: { turn: 1 } },
  message(1, 0, 'deepseek-v4-pro', 'deepseek-account', { inputTokens: 40_000, cacheReadTokens: 960_000, outputTokens: 5_000 }, MONDAY_NIGHT),
  message(1, 1, 'hy5', 'hy5', { inputTokens: 2_000, outputTokens: 300 }, MONDAY_NIGHT),
])

/** One Claude Opus 5.5 call: $4 of input, priced in USD only. */
const CLAUDE_VIEW = viewFrom([message(0, 0, 'claude-opus-5-5', 'anthropic', { inputTokens: 1_000_000, outputTokens: 0 })])

const props = (view, t, extra = {}) => ({ useProjection: key => (key === 'dshTokenBill' ? view : undefined), t, ...extra })

describe('client.js', () => {
  it('registers as dsh-token-bill with both slot entries, styles, dictionaries, and the settings sync', () => {
    const { plugin, registrations, dictionaries, effects } = loadClient()
    assert.equal(plugin.id, 'dsh-token-bill')
    assert.deepEqual([...plugin.inject], ['slots', 'locale'])
    assert.deepEqual(registrations.map(r => [r.options.name, r.options.id, r.options.locale]), [
      ['conversation.composer.dock', 'dsh-token-bill', 'dshTokenBill'],
      ['sidebar.session.row.trailing', 'dsh-token-bill', 'dshTokenBill'],
    ])
    assert.deepEqual(Object.keys(dictionaries.dshTokenBill).sort(), ['en', 'zh'])
    assert.deepEqual(Object.keys(dictionaries.dshTokenBill.zh).sort(), Object.keys(dictionaries.dshTokenBill.en).sort())
    assert.equal(effects.length, 3)
  })

  it('renders the badge with the session cost and nothing before the first call', () => {
    const { registrations, t } = loadClient()
    const Badge = registrations[0].component
    const html = render({ type: Badge, props: props(SESSION_VIEW, t('zh')) })
    // Peak: 0.12M*9 + 0.88M*0.3 + 9k*27 = 1.08 + 0.264 + 0.243; night: 0.04M*4.5 + 0.96M*0.15 + 5k*13.5 = 0.18 + 0.144 + 0.0675
    assert.equal(SESSION_VIEW.cost['CNY+USD'].CNY, 1.9785)
    // Without ui-primitives the Tooltip stand-in puts the label in `title`.
    assert.match(html, /<button title="本会话估算费用 ¥1\.98\+，点击查看明细" aria-label="本会话估算费用 ¥1\.98\+，点击查看明细">¥1\.98\+<\/button>/)
    const empty = viewFrom([])
    assert.equal(render({ type: Badge, props: { useProjection: () => empty, t: t('zh') } }), '')
    assert.equal(render({ type: Badge, props: { useProjection: () => undefined } }), '')
  })

  it('renders the open panel with buckets, stats, models, and the currency picker, without a footnote', () => {
    const { registrations, t } = loadClient({ open: true })
    const Badge = registrations[0].component
    const html = render({ type: Badge, props: props(SESSION_VIEW, t('en')) })
    for (const text of [
      'Session cost (estimate)',
      '¥1.98+',
      'aria-label="Display currency"',
      '<option>CNY · Chinese Yuan</option>', '<option>USD · US Dollar</option>', '<option>RUB · Russian Ruble</option>',
      'Input · cache miss', '162k',
      'Input · cache hit', '1.8M',
      'Output', '14.3k', // 9k + 5k + 300
      'Cache hit rate', '92%', // 1.84M / (0.162M + 1.84M)
      'Model calls', '<dd>3</dd>',
      'Thinking (in output)', '3k tokens',
      'Last turn', '¥0.392+',
      'Off-peak savings', '¥0.392',
      'By model', 'deepseek-v4-pro', 'hy5', 'no price',
    ]) {
      assert.ok(html.includes(text), `panel should include ${JSON.stringify(text)}\n${html}`)
    }
    assert.equal(html.includes('Cache write'), false, 'the cache-write row hides when unused')
    assert.equal(html.includes('<p'), false, 'the footnote is gone')
    assert.equal(html.includes('half price'), false, 'the footnote is gone')
    assert.match(html, /title="Built-in rates of 2026-11-07 \(not refreshed online yet\) · 1 USD = 6\.6755 CNY"/)
  })

  it('switches every amount to the picked currency and remembers it', () => {
    const { registrations, t, storage } = loadClient({ open: true })
    const Badge = registrations[0].component
    const select = find(expand({ type: Badge, props: props(SESSION_VIEW, t('zh')) }), node => node.type === 'select')
    assert.equal(select.props.value, 'CNY')
    select.props.onChange({ target: { value: 'USD' } })
    assert.equal(storage['dsh-token-bill:currency'], 'USD')
    // DeepSeek has an official USD table: 0.12M*1.32 + 0.88M*0.044 + 9k*3.96 + 0.04M*0.66 + 0.96M*0.022 + 5k*1.98
    assert.equal(SESSION_VIEW.cost['CNY+USD'].USD, 0.29018)
    const badge = render({ type: Badge, props: props(SESSION_VIEW, t('zh')) })
    assert.ok(badge.includes('>$0.290+</button>'), badge)
    // Ignored: not a currency code.
    select.props.onChange({ target: { value: 'dollars' } })
    assert.equal(storage['dsh-token-bill:currency'], 'USD')
  })

  it('converts the other currency at the day\'s rate, grouping large amounts', () => {
    const shown = (code) => {
      const { registrations, t } = loadClient({ stored: { 'dsh-token-bill:currency': code } })
      return render({ type: registrations[0].component, props: props(CLAUDE_VIEW, t('zh')) })
    }
    assert.ok(shown('USD').includes('>$4.00</button>'))
    assert.ok(shown('CNY').includes('>¥26.70</button>')) // 4 * 6.67549
    assert.ok(shown('IDR').includes('>Rp 72,420</button>')) // 4 * 18105.1
    // A pick the config does not offer falls back to the configured currency.
    assert.ok(shown('XYZ').includes('>¥26.70</button>'))
  })

  it('prefers newer stored rates over the built-in table', () => {
    const stored = {
      'dsh-token-bill:currency': 'CNY',
      'dsh-token-bill:rates': JSON.stringify({ date: '2026-11-08', source: 'currency-api', fetchedAt: Date.now(), rates: { USD: 1, CNY: 7 } }),
    }
    const { registrations, t } = loadClient({ stored, open: true })
    const html = render({ type: registrations[0].component, props: props(CLAUDE_VIEW, t('zh')) })
    assert.ok(html.includes('>¥28.00</button>'), html)
    assert.ok(html.includes('汇率 2026-11-08（currency-api，每日更新） · 1 USD = 7 CNY'), html)
  })

  it('adds subagent costs from the session list', () => {
    const { registrations, t } = loadClient({ open: true })
    const Badge = registrations[0].component
    const child = viewFrom([message(0, 0, 'deepseek-flash', 'deepseek-account', { inputTokens: 1_000_000, outputTokens: 0 })])
    const list = {
      byId: { child1: { id: 'child1', projectionValues: { dshTokenBill: child } } },
      projectionsBySession: {},
    }
    const catalog = [{ id: 'child1', mode: 'one-shot', label: 'x' }, { id: 'ext', mode: 'external', label: 'y' }]
    const html = render({
      type: Badge,
      props: {
        useProjection: key => (key === 'dshTokenBill' ? SESSION_VIEW : key === 'subagentCatalog' ? catalog : undefined),
        useSessions: selector => selector(list),
        t: t('zh'),
      },
    })
    assert.ok(html.includes('子代理（1 个）'), html)
    assert.ok(html.includes('<dd>¥2.00</dd>'), html)
    assert.ok(html.includes('合计（含子代理）'), html)
    assert.ok(html.includes('¥3.98+'), html)
  })

  it('never counts the session itself when a catalog points back at it', () => {
    const { registrations, t } = loadClient({ open: true })
    const Badge = registrations[0].component
    const child = viewFrom([message(0, 0, 'deepseek-flash', 'deepseek-account', { inputTokens: 1_000_000, outputTokens: 0 })])
    const list = {
      byId: {
        root: { id: 'root', projectionValues: { dshTokenBill: SESSION_VIEW } },
        child1: { id: 'child1', projectionValues: { dshTokenBill: child, subagentCatalog: [{ id: 'root', mode: 'one-shot' }] } },
      },
      projectionsBySession: {},
    }
    const html = render({
      type: Badge,
      props: {
        sessionId: 'root',
        useProjection: key => (key === 'dshTokenBill' ? SESSION_VIEW : key === 'subagentCatalog' ? [{ id: 'child1', mode: 'one-shot' }] : undefined),
        useSessions: selector => selector(list),
        t: t('zh'),
      },
    })
    assert.ok(html.includes('子代理（1 个）'), html)
    assert.ok(html.includes('¥3.98+'), html)
  })

  it('labels sidebar rows from the summary projection and honours showInList', () => {
    const { registrations, t } = loadClient()
    const Row = registrations[1].component
    const list = {
      byId: {
        a: { id: 'a', projectionValues: { dshTokenBill: SESSION_VIEW } },
        b: { id: 'b', projectionValues: {} },
        c: { id: 'c', projectionValues: { dshTokenBill: { ...SESSION_VIEW, showInList: false } } },
      },
      projectionsBySession: { d: { values: { dshTokenBill: { ...SESSION_VIEW, cost: { CNY: { CNY: 0.0004 } }, complete: true } } } },
    }
    const row = id => render({ type: Row, props: { sessionId: id, useSessions: selector => selector(list), t: t('zh') } })
    assert.equal(row('a'), '<span title="估算费用 ¥1.98+">¥1.98+</span>')
    assert.equal(row('b'), '')
    assert.equal(row('c'), '')
    assert.equal(row('d'), '<span title="估算费用 ¥0.0004"><¥0.001</span>')
    assert.equal(row('missing'), '')
  })

  it('still reads v2 views a window held across the upgrade, picker and conversion included', () => {
    const legacy = {
      v: 2, currency: 'CNY', symbol: '¥', cost: 6.67549, complete: true, calls: 1,
      tokens: { input: 1, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 },
      costs: { input: 6.67549, cacheRead: 0, cacheWrite: 0, output: 0 },
      cacheHitRate: 0, tiered: true, saved: 0, turn: null, compaction: null, models: [], showInList: true,
    }
    const { registrations, t } = loadClient({ stored: { 'dsh-token-bill:currency': 'USD' }, open: true })
    const panel = render({ type: registrations[0].component, props: props(legacy, t('zh')) })
    assert.ok(panel.includes('>$1.00</button>'), panel)
    assert.ok(panel.includes('aria-label="显示币种"'), 'the picker shows for a v2 view too')
    const list = { byId: { a: { id: 'a', projectionValues: { dshTokenBill: legacy } } }, projectionsBySession: {} }
    assert.equal(render({ type: registrations[1].component, props: { sessionId: 'a', useSessions: selector => selector(list), t: t('zh') } }),
      '<span title="估算费用 $1.00">$1.00</span>')
  })
})
