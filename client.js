/**
 * Browser half of dsh-token-cost.
 *
 *  - `conversation.composer.dock`: a cost badge beside the built-in context
 *    ring. Clicking it opens a breakdown panel: cost per token bucket, per
 *    model, last turn, compaction, subagents, and off-peak savings.
 *  - `sidebar.session.row.trailing`: every conversation's cost next to its
 *    time in the sidebar list, read from the Session summary rows.
 *
 * Plain JS on purpose, so the package needs no build step. It requires only
 * modules from the shell's shared table (react, react-dom, ui-primitives);
 * when ui-primitives is missing or older, small local stand-ins take over.
 */
window.__ModuleLoader__.load({
  id: 'dsh-token-cost',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    let primitives = {}
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives') || {}
    } catch (_missing) {
      primitives = {}
    }

    /** Projection key written by the Host half (`lib/fold.js`). */
    const KEY = 'dshTokenCost'
    /** Locale namespace owned by this plugin. */
    const NS = 'dshTokenCost'
    const STYLE_KEY = 'dsh-token-cost/style'

    const zh = {
      'badge.tooltip': '本会话估算费用 {cost}，点击查看明细',
      'badge.unpriced': '本会话所用模型未配置价格，点击查看用量',
      'panel.title': '本会话费用（估算）',
      'bucket.input': '输入 · 未命中缓存',
      'bucket.cacheRead': '输入 · 命中缓存',
      'bucket.cacheWrite': '缓存写入',
      'bucket.output': '输出',
      'stat.cacheHit': '缓存命中率',
      'stat.calls': '模型调用',
      'stat.callsValue': '{n} 次',
      'stat.reasoning': '其中思考',
      'stat.turn': '最近一轮',
      'stat.compaction': '上下文压缩（{n} 次）',
      'stat.saved': '空闲时段节省',
      'stat.subagents': '子代理（{n} 个）',
      'stat.grand': '合计（含子代理）',
      'models.title': '按模型',
      'models.unpriced': '未定价',
      // U+2060 WORD JOINER keeps "9–12" on one line.
      'note.tiered': 'DeepSeek 官方模型按时段计价：北京时间工作日 9–⁠12、14–⁠18 点为高峰，其余时段半价。',
      'note.flat': '不区分时段，统一按配置价格计算。',
      'note.unpriced': '未定价的模型不计入总额，可在插件配置的 models 中补充价格。',
      'note.bill': '估算值，以实际账单为准。',
      'note.join': '',
      'row.title': '估算费用 {cost}',
    }

    const en = {
      'badge.tooltip': 'Estimated cost of this session: {cost}. Click for details',
      'badge.unpriced': "This session's models have no price configured. Click for usage",
      'panel.title': 'Session cost (estimate)',
      'bucket.input': 'Input · cache miss',
      'bucket.cacheRead': 'Input · cache hit',
      'bucket.cacheWrite': 'Cache write',
      'bucket.output': 'Output',
      'stat.cacheHit': 'Cache hit rate',
      'stat.calls': 'Model calls',
      'stat.callsValue': '{n}',
      'stat.reasoning': 'Thinking (in output)',
      'stat.turn': 'Last turn',
      'stat.compaction': 'Compaction ({n}×)',
      'stat.saved': 'Off-peak savings',
      'stat.subagents': 'Subagents ({n})',
      'stat.grand': 'Total incl. subagents',
      'models.title': 'By model',
      'models.unpriced': 'no price',
      'note.tiered': 'Official DeepSeek models are priced by time: peak on Beijing weekdays 09–⁠12 and 14–⁠18, half price otherwise.',
      'note.flat': 'All hours are priced at the configured rates.',
      'note.unpriced': 'Models without a price are left out; add them under `models` in the plugin config.',
      'note.bill': 'Estimate only; your bill is authoritative.',
      // Separator between note sentences: none after a Chinese full stop, a space in English.
      'note.join': ' ',
      'row.title': 'Estimated cost {cost}',
    }

    function interpolate(template, params) {
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }

    /** Used only when a slot renders without a locale seat. */
    function fallbackT(key, params) {
      return interpolate(en[key] !== undefined ? en[key] : key, params)
    }

    function translator(t) {
      return typeof t === 'function' ? t : fallbackT
    }

    function isView(value) {
      return value !== null && typeof value === 'object' && value.v === 2 && typeof value.cost === 'number'
    }

    // ---- formatting --------------------------------------------------------

    /**
     * Money text. `badge` and `row` stay short; `panel` keeps cents above 100.
     * @param {number} cost - amount.
     * @param {string} symbol - currency symbol.
     * @param {'badge' | 'row' | 'panel'} mode - where it renders.
     * @returns {string} formatted amount.
     */
    function formatMoney(cost, symbol, mode) {
      const s = typeof symbol === 'string' ? symbol : ''
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) return `${s}0`
      const floor = mode === 'row' ? 0.001 : 0.0001
      if (cost < floor) return `<${s}${floor}`
      let digits
      if (cost < 0.01) digits = mode === 'row' ? 3 : 4
      else if (cost < 1) digits = 3
      else if (cost < 100 || mode === 'panel') digits = 2
      else digits = 0
      return `${s}${cost.toFixed(digits)}`
    }

    function formatTokens(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0'
      const scaled = n => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10))
      if (value < 1e3) return String(value)
      if (value < 1e6) return `${scaled(value / 1e3)}k`
      return `${scaled(value / 1e6)}M`
    }

    function formatPercent(rate) {
      return `${Math.round(rate * 100)}%`
    }

    function badgeText(view) {
      if (view.cost <= 0 && !view.complete) return `${view.symbol}?`
      return formatMoney(view.cost, view.symbol, 'badge') + (view.complete ? '' : '+')
    }

    // ---- ui-primitives with local stand-ins ---------------------------------

    function TooltipStandIn(props) {
      return React.cloneElement(props.children, { title: props.label })
    }

    function useAnchoredStandIn(options) {
      const { open, anchorRef, panelRef } = options
      const gap = options.gap === undefined ? 8 : options.gap
      const margin = options.margin === undefined ? 12 : options.margin
      const [position, setPosition] = React.useState(null)
      React.useLayoutEffect(() => {
        if (!open) {
          setPosition(null)
          return undefined
        }
        const place = () => {
          const anchor = anchorRef.current
          const panel = panelRef.current
          if (!anchor || !panel) return
          const a = anchor.getBoundingClientRect()
          const p = panel.getBoundingClientRect()
          const left = Math.max(margin, Math.min(a.left + a.width / 2 - p.width / 2, window.innerWidth - margin - p.width))
          const top = Math.max(margin, a.top - gap - p.height)
          setPosition({ left, top })
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open, anchorRef, panelRef, gap, margin])
      return position
    }

    function useDismissStandIn(rootRef, open, setOpen, panelRef) {
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (rootRef.current && rootRef.current.contains(target)) return
          if (panelRef && panelRef.current && panelRef.current.contains(target)) return
          setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
      }, [open, rootRef, panelRef, setOpen])
    }

    // Chosen once, so every render calls the same hooks in the same order.
    const Tooltip = primitives.Tooltip != null ? primitives.Tooltip : TooltipStandIn
    const useAnchoredPosition = typeof primitives.useAnchoredPosition === 'function'
      ? primitives.useAnchoredPosition
      : useAnchoredStandIn
    const useDismissOnOutsidePointer = typeof primitives.useDismissOnOutsidePointer === 'function'
      ? primitives.useDismissOnOutsidePointer
      : useDismissStandIn

    // ---- session-list reads -------------------------------------------------

    /** This plugin's view of one Session from the session-list store. */
    function viewOf(list, sessionId) {
      if (!list || typeof sessionId !== 'string') return undefined
      const row = list.byId ? list.byId[sessionId] : undefined
      const fromRow = row && row.projectionValues ? row.projectionValues[KEY] : undefined
      if (fromRow !== undefined) return fromRow
      const loaded = list.projectionsBySession ? list.projectionsBySession[sessionId] : undefined
      return loaded && loaded.values ? loaded.values[KEY] : undefined
    }

    function catalogOf(list, sessionId) {
      const row = list && list.byId ? list.byId[sessionId] : undefined
      const fromRow = row && row.projectionValues ? row.projectionValues.subagentCatalog : undefined
      if (fromRow !== undefined) return fromRow
      const loaded = list && list.projectionsBySession ? list.projectionsBySession[sessionId] : undefined
      return loaded && loaded.values ? loaded.values.subagentCatalog : undefined
    }

    /** Local child Session ids of a `subagentCatalog` view; external executions have no Session. */
    function childIds(catalog) {
      if (!Array.isArray(catalog)) return []
      const ids = []
      for (const child of catalog) {
        if (child && typeof child.id === 'string' && child.mode !== 'external') ids.push(child.id)
      }
      return ids
    }

    /**
     * Sum the cost views of a Session's subagents, nested ones included. Returns
     * a string so the store selector result compares by value.
     */
    function summarizeChildren(list, key, rootId) {
      if (key === '') return ''
      // The root is pre-seeded so a malformed catalog can never count it as its own child.
      const seen = new Set(typeof rootId === 'string' ? [rootId] : [])
      let count = 0
      let known = 0
      let cost = 0
      let complete = true
      const visit = (id, depth) => {
        if (seen.has(id) || depth > 8) return
        seen.add(id)
        count += 1
        const view = viewOf(list, id)
        if (isView(view)) {
          known += 1
          cost += view.cost
          if (!view.complete) complete = false
        }
        for (const nested of childIds(catalogOf(list, id))) visit(nested, depth + 1)
      }
      for (const id of key.split('\n')) visit(id, 0)
      return `${count}|${known}|${cost}|${complete ? 1 : 0}`
    }

    function parseChildren(summary) {
      if (typeof summary !== 'string' || summary === '') return null
      const [count, known, cost, complete] = summary.split('|')
      const n = Number(count)
      if (!(n > 0)) return null
      return { count: n, cost: Number(cost), complete: complete === '1' && Number(known) === n }
    }

    // ---- composer badge and panel --------------------------------------------

    const BUCKETS = [
      { key: 'input', tone: 'dshtc-tone-input' },
      { key: 'cacheRead', tone: 'dshtc-tone-cache' },
      { key: 'cacheWrite', tone: 'dshtc-tone-write' },
      { key: 'output', tone: 'dshtc-tone-output' },
    ]

    function CostPanel({ view, t, panelRef, position, subagents }) {
      const money = value => formatMoney(value, view.symbol, 'panel')
      const buckets = BUCKETS.filter(bucket => bucket.key !== 'cacheWrite' || view.tokens.cacheWrite > 0)
      const segments = view.cost > 0
        ? buckets.map(bucket => ({ ...bucket, width: view.costs[bucket.key] / view.cost * 100 })).filter(s => s.width > 0)
        : []

      const stats = []
      if (view.cacheHitRate !== null) stats.push(['hit', t('stat.cacheHit'), formatPercent(view.cacheHitRate)])
      stats.push(['calls', t('stat.calls'), t('stat.callsValue', { n: view.calls })])
      if (view.tokens.reasoning > 0) stats.push(['reasoning', t('stat.reasoning'), `${formatTokens(view.tokens.reasoning)} tokens`])
      if (view.turn !== null && view.turn.cost !== view.cost) {
        stats.push(['turn', t('stat.turn'), money(view.turn.cost) + (view.turn.complete ? '' : '+')])
      }
      if (view.compaction !== null) {
        stats.push(['compaction', t('stat.compaction', { n: view.compaction.calls }), money(view.compaction.cost)])
      }
      if (view.tiered && view.saved > 0) stats.push(['saved', t('stat.saved'), money(view.saved)])
      if (subagents !== null) {
        stats.push(['subagents', t('stat.subagents', { n: subagents.count }), money(subagents.cost) + (subagents.complete ? '' : '+')])
        stats.push(['grand', t('stat.grand'), money(view.cost + subagents.cost) + (subagents.complete && view.complete ? '' : '+')])
      }

      const repeated = new Set()
      const seenModels = new Set()
      for (const row of view.models) {
        if (seenModels.has(row.model)) repeated.add(row.model)
        seenModels.add(row.model)
      }
      const showModels = view.models.length > 1 || view.models.some(row => row.cost === null)

      const notes = [view.tiered ? t('note.tiered') : t('note.flat')]
      if (!view.complete) notes.push(t('note.unpriced'))
      notes.push(t('note.bill'))

      return h('div', {
        ref: panelRef,
        className: 'dshtc-panel',
        style: position || { visibility: 'hidden', left: 0, top: 0 },
        role: 'dialog',
        'aria-label': t('panel.title'),
      },
      h('div', { className: 'dshtc-head' },
        h('span', { className: 'dshtc-title' }, t('panel.title')),
        h('span', { className: 'dshtc-total' }, view.cost <= 0 && !view.complete
          ? t('models.unpriced')
          : money(view.cost) + (view.complete ? '' : '+'))),
      segments.length > 0
        ? h('div', { className: 'dshtc-bar', 'aria-hidden': true },
          segments.map(segment => h('div', {
            key: segment.key,
            className: `dshtc-seg ${segment.tone}`,
            style: { width: `${segment.width}%` },
          })))
        : h('div', { className: 'dshtc-gap' }),
      h('dl', { className: 'dshtc-grid' },
        buckets.map(bucket => h(React.Fragment, { key: bucket.key },
          h('dt', null, h('span', { className: `dshtc-swatch ${bucket.tone}`, 'aria-hidden': true }), t(`bucket.${bucket.key}`)),
          h('dd', null, formatTokens(view.tokens[bucket.key])),
          h('dd', { className: 'dshtc-money' }, view.cost > 0 || view.complete ? money(view.costs[bucket.key]) : '—')))),
      h('div', { className: 'dshtc-sep' }),
      h('dl', { className: 'dshtc-grid dshtc-stats' },
        stats.map(([key, label, value]) => h(React.Fragment, { key },
          h('dt', null, label),
          h('dd', { className: key === 'grand' ? 'dshtc-money dshtc-strong' : 'dshtc-money' }, value)))),
      showModels
        ? h(React.Fragment, null,
          h('div', { className: 'dshtc-sep' }),
          h('div', { className: 'dshtc-section' }, t('models.title')),
          h('dl', { className: 'dshtc-grid' },
            view.models.map(row => h(React.Fragment, { key: `${row.provider}\n${row.model}` },
              h('dt', { title: row.provider ? `${row.provider} / ${row.model}` : row.model },
                row.model || '?',
                repeated.has(row.model) && row.provider ? h('span', { className: 'dshtc-provider' }, row.provider) : null),
              h('dd', null, formatTokens(row.tokens)),
              h('dd', { className: row.cost === null ? 'dshtc-muted' : 'dshtc-money' },
                row.cost === null ? t('models.unpriced') : money(row.cost))))))
        : null,
      h('p', { className: 'dshtc-note' }, notes.join(t('note.join'))))
    }

    function useSubagents(props) {
      const read = props.useProjection
      const catalog = typeof read === 'function' ? read('subagentCatalog') : undefined
      const key = childIds(catalog).join('\n')
      const useSessions = props.useSessions
      const rootId = props.sessionId
      const summary = typeof useSessions === 'function' ? useSessions(list => summarizeChildren(list, key, rootId)) : ''
      return parseChildren(summary)
    }

    function CostBadge(props) {
      const t = translator(props.t)
      const read = props.useProjection
      const view = typeof read === 'function' ? read(KEY) : undefined
      const subagents = useSubagents(props)
      const [open, setOpen] = React.useState(false)
      const rootRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const available = isView(view) && (view.calls > 0 || view.compaction !== null)
      // Re-measure when the panel gains or loses rows while it is open.
      const layoutKey = available
        ? [view.models.length, view.complete, view.compaction !== null, view.turn !== null, view.saved > 0,
          view.tokens.reasoning > 0, view.tokens.cacheWrite > 0, subagents === null ? 0 : subagents.count].join('|')
        : ''
      const position = useAnchoredPosition({
        open: open && available,
        anchorRef: rootRef,
        panelRef,
        side: 'top',
        gap: 8,
        margin: 12,
        layoutKey,
      })
      useDismissOnOutsidePointer(rootRef, open && available, setOpen, panelRef)
      React.useEffect(() => {
        if (!available && open) setOpen(false)
      }, [available, open])
      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [open])
      if (!available) return null

      const label = view.cost <= 0 && !view.complete
        ? t('badge.unpriced')
        : t('badge.tooltip', { cost: formatMoney(view.cost, view.symbol, 'panel') + (view.complete ? '' : '+') })
      return h('span', { ref: rootRef, className: 'dshtc-root' },
        h(Tooltip, { label, side: 'top', delayMs: 200, disabled: open, portal: true },
          h('button', {
            type: 'button',
            className: 'dshtc-trigger',
            'aria-label': label,
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            onClick: () => setOpen(!open),
          }, badgeText(view))),
        open && typeof document !== 'undefined'
          ? ReactDOM.createPortal(h(CostPanel, { view, t, panelRef, position, subagents }), document.body)
          : null)
    }

    // ---- sidebar session rows ---------------------------------------------

    function SessionRowCost(props) {
      const useSessions = props.useSessions
      const sessionId = props.sessionId
      const view = typeof useSessions === 'function' ? useSessions(list => viewOf(list, sessionId)) : undefined
      if (!isView(view) || view.showInList === false || !(view.cost > 0)) return null
      const t = translator(props.t)
      const more = view.complete ? '' : '+'
      return h('span', {
        className: 'dshtc-row',
        title: t('row.title', { cost: formatMoney(view.cost, view.symbol, 'panel') + more }),
      }, formatMoney(view.cost, view.symbol, 'row') + more)
    }

    // ---- styles ---------------------------------------------------------------

    // Theme tokens only, so light, dark, and skins follow the host. The panel
    // mirrors the built-in context meter's panel.
    const CSS = [
      '.dshtc-root{flex:none;display:inline-flex}',
      '.dshtc-trigger{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;cursor:pointer;background:0 0;border:none;flex:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}',
      '.dshtc-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '@media (hover:hover){.dshtc-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}',
      '.dshtc-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:min(300px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;max-width:var(--dsh-anchored-max-width,none);max-height:var(--dsh-anchored-max-height,none);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;padding:12px;font-size:12px;line-height:20px;position:fixed;overflow:hidden auto}',
      '.dshtc-head{display:flex;align-items:baseline;gap:6px}',
      '.dshtc-title{color:var(--dsw-alias-label-tertiary)}',
      '.dshtc-total{margin-left:auto;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}',
      '.dshtc-bar{background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;gap:1px;height:4px;margin:10px 0;display:flex;overflow:hidden}',
      '.dshtc-gap{height:8px}',
      '.dshtc-seg{background:var(--dshtc-tint);border-radius:1px;flex:none;min-width:2px;height:100%}',
      '.dshtc-swatch{background:var(--dshtc-tint);vertical-align:baseline;border-radius:2px;width:8px;height:8px;margin-right:6px;display:inline-block}',
      '.dshtc-tone-input{--dshtc-tint:var(--dsw-static-blue-450,#4d6bfe)}',
      '.dshtc-tone-cache{--dshtc-tint:var(--dsw-static-neutral-bluish-400,#8a94a6)}',
      '.dshtc-tone-write{--dshtc-tint:#f59e0b}',
      '.dshtc-tone-output{--dshtc-tint:#a78bfa}',
      '.dshtc-grid{display:grid;grid-template-columns:minmax(0,1fr) auto auto;column-gap:12px;row-gap:2px;align-items:baseline;margin:0}',
      '.dshtc-grid dt{color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshtc-grid dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.dshtc-grid dd.dshtc-money{color:var(--dsw-alias-label-primary)}',
      '.dshtc-grid dd.dshtc-muted{color:var(--dsw-alias-label-tertiary)}',
      '.dshtc-stats{grid-template-columns:minmax(0,1fr) auto}',
      '.dshtc-strong{font-weight:500}',
      '.dshtc-provider{margin-left:6px;color:var(--dsw-alias-label-tertiary)}',
      '.dshtc-sep{border-top:.5px solid var(--dsw-alias-border-l2);margin:8px 0}',
      '.dshtc-section{color:var(--dsw-alias-label-tertiary);margin-bottom:2px}',
      '.dshtc-note{margin:8px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.dshtc-row{flex:none;color:inherit;font-size:10px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    ].join('')

    /** Install (or refresh) this plugin's one stylesheet. */
    function ensureStyles() {
      if (typeof document === 'undefined') return null
      let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_KEY)}]`)
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-token-cost'
        tag.dataset.pluginCss = STYLE_KEY
        document.head.appendChild(tag)
      }
      tag.textContent = CSS
      return tag
    }

    return {
      name: 'dsh-token-cost',
      inject: ['slots', 'locale'],
      /**
       * Register the stylesheet, the dictionaries, and both slot entries. Each
       * rides this plugin's fiber, so turning the plugin off removes them all.
       * @param ctx - client plugin context.
       */
      apply(ctx) {
        ctx.effect(() => {
          const tag = ensureStyles()
          return () => {
            if (tag !== null) tag.remove()
          }
        }, 'dsh-token-cost: stylesheet')
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-token-cost: dictionaries')
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'dsh-token-cost',
          order: -1,
          locale: NS,
        }, CostBadge))
        ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
          name: 'sidebar.session.row.trailing',
          id: 'dsh-token-cost',
          locale: NS,
        }, SessionRowCost))
      },
    }
  },
})
