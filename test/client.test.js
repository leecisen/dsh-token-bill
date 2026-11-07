/**
 * Smoke test of the browser half without a browser: client.js runs against a
 * tiny React stand-in that renders function components to text, so the slot
 * registrations, the badge, the panel, and the sidebar label can be checked
 * under plain `node --test`.
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
  }
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

function loadClient({ open = false } = {}) {
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
  const sandbox = {
    document,
    window: { __ModuleLoader__: { load: ({ id, factory }) => { plugin = { id, ...factory(name => modules[name]) } } } },
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
    const template = dictionaries.dshTokenCost[lang][key] ?? key
    return params ? template.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m)) : template
  }
  return { plugin, registrations, dictionaries, effects, t, stateQueue }
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
  message(1, 1, 'hy4', 'hy4', { inputTokens: 2_000, outputTokens: 300 }, MONDAY_NIGHT),
])

describe('client.js', () => {
  it('registers as dsh-token-cost with both slot entries, styles, and dictionaries', () => {
    const { plugin, registrations, dictionaries, effects } = loadClient()
    assert.equal(plugin.id, 'dsh-token-cost')
    assert.deepEqual([...plugin.inject], ['slots', 'locale'])
    assert.deepEqual(registrations.map(r => [r.options.name, r.options.id, r.options.locale]), [
      ['conversation.composer.dock', 'dsh-token-cost', 'dshTokenCost'],
      ['sidebar.session.row.trailing', 'dsh-token-cost', 'dshTokenCost'],
    ])
    assert.deepEqual(Object.keys(dictionaries.dshTokenCost).sort(), ['en', 'zh'])
    assert.deepEqual(Object.keys(dictionaries.dshTokenCost.zh).sort(), Object.keys(dictionaries.dshTokenCost.en).sort())
    assert.equal(effects.length, 2)
  })

  it('renders the badge with the session cost and nothing before the first call', () => {
    const { registrations, t } = loadClient()
    const Badge = registrations[0].component
    const html = render({ type: Badge, props: { useProjection: key => (key === 'dshTokenCost' ? SESSION_VIEW : undefined), t: t('zh') } })
    // Peak: 0.12M*9 + 0.88M*0.3 + 9k*27 = 1.08 + 0.264 + 0.243; night: 0.04M*4.5 + 0.96M*0.15 + 5k*13.5 = 0.18 + 0.144 + 0.0675
    assert.equal(SESSION_VIEW.cost, 1.9785)
    // Without ui-primitives the Tooltip stand-in puts the label in `title`.
    assert.match(html, /<button title="本会话估算费用 ¥1\.98\+，点击查看明细" aria-label="本会话估算费用 ¥1\.98\+，点击查看明细">¥1\.98\+<\/button>/)
    const empty = viewFrom([])
    assert.equal(render({ type: Badge, props: { useProjection: () => empty, t: t('zh') } }), '')
    assert.equal(render({ type: Badge, props: { useProjection: () => undefined } }), '')
  })

  it('renders the open panel with buckets, stats, models, and notes', () => {
    const { registrations, t } = loadClient({ open: true })
    const Badge = registrations[0].component
    const html = render({ type: Badge, props: { useProjection: key => (key === 'dshTokenCost' ? SESSION_VIEW : undefined), t: t('en') } })
    for (const text of [
      'Session cost (estimate)',
      '¥1.98+',
      'Input · cache miss', '162k',
      'Input · cache hit', '1.8M',
      'Output', '14.3k', // 9k + 5k + 300
      'Cache hit rate', '92%', // 1.84M / (0.162M + 1.84M)
      'Model calls', '<dd>3</dd>',
      'Thinking (in output)', '3k tokens',
      'Last turn', '¥0.392+',
      'Off-peak savings', '¥0.392',
      'By model', 'deepseek-v4-pro', 'hy4', 'no price',
      'Models without a price are left out',
    ]) {
      assert.ok(html.includes(text), `panel should include ${JSON.stringify(text)}\n${html}`)
    }
    assert.equal(html.includes('Cache write'), false, 'the cache-write row hides when unused')
  })

  it('adds subagent costs from the session list', () => {
    const { registrations, t } = loadClient({ open: true })
    const Badge = registrations[0].component
    const child = viewFrom([message(0, 0, 'deepseek-flash', 'deepseek-account', { inputTokens: 1_000_000, outputTokens: 0 })])
    const list = {
      byId: { child1: { id: 'child1', projectionValues: { dshTokenCost: child } } },
      projectionsBySession: {},
    }
    const catalog = [{ id: 'child1', mode: 'one-shot', label: 'x' }, { id: 'ext', mode: 'external', label: 'y' }]
    const html = render({
      type: Badge,
      props: {
        useProjection: key => (key === 'dshTokenCost' ? SESSION_VIEW : key === 'subagentCatalog' ? catalog : undefined),
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
        root: { id: 'root', projectionValues: { dshTokenCost: SESSION_VIEW } },
        child1: { id: 'child1', projectionValues: { dshTokenCost: child, subagentCatalog: [{ id: 'root', mode: 'one-shot' }] } },
      },
      projectionsBySession: {},
    }
    const html = render({
      type: Badge,
      props: {
        sessionId: 'root',
        useProjection: key => (key === 'dshTokenCost' ? SESSION_VIEW : key === 'subagentCatalog' ? [{ id: 'child1', mode: 'one-shot' }] : undefined),
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
        a: { id: 'a', projectionValues: { dshTokenCost: SESSION_VIEW } },
        b: { id: 'b', projectionValues: {} },
        c: { id: 'c', projectionValues: { dshTokenCost: { ...SESSION_VIEW, showInList: false } } },
      },
      projectionsBySession: { d: { values: { dshTokenCost: { ...SESSION_VIEW, cost: 0.0004, complete: true } } } },
    }
    const row = id => render({ type: Row, props: { sessionId: id, useSessions: selector => selector(list), t: t('zh') } })
    assert.equal(row('a'), '<span title="估算费用 ¥1.98+">¥1.98+</span>')
    assert.equal(row('b'), '')
    assert.equal(row('c'), '')
    assert.equal(row('d'), '<span title="估算费用 ¥0.0004"><¥0.001</span>')
    assert.equal(row('missing'), '')
  })
})
