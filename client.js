/**
 * Browser half of dsh-token-bill.
 *
 *  - `conversation.composer.dock`: a cost badge beside the built-in context
 *    ring. Clicking it opens a breakdown panel: cost per token bucket, per
 *    model, last turn, compaction, subagents, and off-peak savings, with a
 *    currency picker.
 *  - `sidebar.session.row.trailing`: every conversation's cost next to its
 *    time in the sidebar list, read from the Session summary rows.
 *
 * The Host prices each model in the currencies its vendor lists (CNY, USD).
 * This half shows every amount in the currency the user picked, converting
 * the rest at the day's exchange rate, fetched at most twice a day and cached
 * in localStorage, with a built-in table when offline.
 *
 * Plain JS on purpose, so the package needs no build step. It requires only
 * modules from the shell's shared table (react, react-dom, ui-primitives);
 * when ui-primitives is missing or older, small local stand-ins take over.
 */
window.__ModuleLoader__.load({
  id: 'dsh-token-bill',
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
    const KEY = 'dshTokenBill'
    /** Locale namespace owned by this plugin. */
    const NS = 'dshTokenBill'
    const STYLE_KEY = 'dsh-token-bill/style'
    const CURRENCY_KEY = 'dsh-token-bill:currency'
    const RATES_KEY = 'dsh-token-bill:rates'

    const zh = {
      'lang': 'zh-CN',
      'badge.tooltip': '本会话估算费用 {cost}，点击查看明细',
      'badge.unpriced': '本会话所用模型未配置价格，点击查看用量',
      'panel.title': '本会话费用（估算）',
      'currency.label': '显示币种',
      'fx.live': '汇率 {date}（{source}，每日更新）',
      'fx.builtin': '内置汇率 {date}（暂未联网更新）',
      'fx.rate': '1 USD = {rate} {code}',
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
      'row.title': '估算费用 {cost}',
    }

    const en = {
      'lang': 'en',
      'badge.tooltip': 'Estimated cost of this session: {cost}. Click for details',
      'badge.unpriced': "This session's models have no price configured. Click for usage",
      'panel.title': 'Session cost (estimate)',
      'currency.label': 'Display currency',
      'fx.live': 'Rates of {date} ({source}, refreshed daily)',
      'fx.builtin': 'Built-in rates of {date} (not refreshed online yet)',
      'fx.rate': '1 USD = {rate} {code}',
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

    function isObject(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    }

    function codeOf(value) {
      return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null
    }

    // ---- storage ------------------------------------------------------------

    // localStorage can be missing or throw (private mode, blocked site data);
    // every read and write degrades to "nothing stored".
    function storageGet(key) {
      try {
        return window.localStorage.getItem(key)
      } catch (_blocked) {
        return null
      }
    }

    function storageSet(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch (_blocked) {
        // Not persisted; the choice still holds for this window.
      }
    }

    // ---- currencies and exchange rates ----------------------------------------

    /** Offered when a view predates the Host's currency list. */
    const DEFAULT_CURRENCIES = ['CNY', 'USD', 'EUR', 'RUB', 'INR', 'IDR', 'BRL', 'HKD']

    const SYMBOLS = {
      CNY: '¥', USD: '$', EUR: '€', RUB: '₽', INR: '₹', IDR: 'Rp', BRL: 'R$', HKD: 'HK$',
      TWD: 'NT$', JPY: 'JP¥', KRW: '₩', GBP: '£', SGD: 'S$', MYR: 'RM', THB: '฿', VND: '₫',
      PHP: '₱', TRY: '₺', PKR: 'Rs', NGN: '₦', EGP: 'E£', AUD: 'A$', CAD: 'C$', CHF: 'CHF',
      AED: 'AED', SAR: 'SAR', KZT: '₸', UAH: '₴', MXN: 'MX$', BDT: '৳',
    }

    /** Units of each currency per US dollar, 2026-11-07; used until a live table arrives. */
    const BUILTIN_RATES = {
      date: '2026-11-07',
      source: 'builtin',
      rates: {
        USD: 1, CNY: 6.67549, EUR: 0.897643, RUB: 82.0022, INR: 94.0653, IDR: 18105.1, BRL: 5.5051,
        HKD: 7.84013, TWD: 32.7831, JPY: 158.481, KRW: 1364.28, GBP: 0.748926, SGD: 1.2826, MYR: 4.06247,
        THB: 33.5666, VND: 25618.2, PHP: 63.1017, TRY: 50.293, PKR: 276.527, NGN: 1342.33, EGP: 53.8464,
        AUD: 1.45629, CAD: 1.41296, CHF: 0.819866, AED: 3.6725, SAR: 3.75, KZT: 448.253, UAH: 45.2866,
        MXN: 18.6372, BDT: 124.535,
      },
    }

    function readUsdTable(table) {
      const rates = { USD: 1 }
      for (const [code, value] of Object.entries(table)) {
        const upper = code.toUpperCase()
        if (/^[A-Z]{3}$/.test(upper) && typeof value === 'number' && Number.isFinite(value) && value > 0) rates[upper] = value
      }
      return rates
    }

    /** Free, keyless, CORS-open daily tables, tried in order. */
    const RATE_SOURCES = [
      {
        name: 'currency-api',
        url: 'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
        read: json => (isObject(json) && typeof json.date === 'string' && isObject(json.usd)
          ? { date: json.date, rates: readUsdTable(json.usd) }
          : null),
      },
      {
        name: 'currency-api',
        url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
        read: json => (isObject(json) && typeof json.date === 'string' && isObject(json.usd)
          ? { date: json.date, rates: readUsdTable(json.usd) }
          : null),
      },
      {
        name: 'ExchangeRate-API',
        url: 'https://open.er-api.com/v6/latest/USD',
        read: json => (isObject(json) && json.result === 'success' && isObject(json.rates)
          ? {
            date: typeof json.time_last_update_unix === 'number'
              ? new Date(json.time_last_update_unix * 1000).toISOString().slice(0, 10)
              : '',
            rates: readUsdTable(json.rates),
          }
          : null),
      },
    ]

    const RATES_MAX_AGE = 12 * 60 * 60 * 1000
    const RETRY_AFTER = 30 * 60 * 1000
    const FETCH_TIMEOUT = 8000

    /** Module state shared by every badge, panel, and sidebar label. */
    const fx = { table: BUILTIN_RATES, fetchedAt: 0, failedAt: 0, loading: false }
    const prefs = { currency: null }
    const listeners = new Set()
    let version = 0

    function emit() {
      version += 1
      for (const listener of listeners) listener()
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    function getVersion() {
      return version
    }

    function loadStoredRates() {
      const raw = storageGet(RATES_KEY)
      if (raw === null) return
      try {
        const stored = JSON.parse(raw)
        if (isObject(stored) && typeof stored.date === 'string' && typeof stored.source === 'string'
          && isObject(stored.rates) && stored.rates.CNY > 0 && typeof stored.fetchedAt === 'number') {
          fx.table = { date: stored.date, source: stored.source, rates: readUsdTable(stored.rates) }
          fx.fetchedAt = stored.fetchedAt
        }
      } catch (_corrupt) {
        // Keep the built-in table.
      }
    }

    function loadStoredCurrency() {
      prefs.currency = codeOf(storageGet(CURRENCY_KEY))
    }

    loadStoredRates()
    loadStoredCurrency()

    async function fetchRates() {
      for (const source of RATE_SOURCES) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const timer = controller !== null ? setTimeout(() => controller.abort(), FETCH_TIMEOUT) : null
        try {
          const response = await fetch(source.url, {
            cache: 'no-cache',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller !== null ? controller.signal : undefined,
          })
          if (!response.ok) continue
          const table = source.read(await response.json())
          if (table !== null && table.rates.CNY > 0) return { ...table, source: source.name }
        } catch (_unreachable) {
          // Try the next source.
        } finally {
          if (timer !== null) clearTimeout(timer)
        }
      }
      return null
    }

    /** Refresh the rate table when it is older than twelve hours. Never throws. */
    function ensureRates() {
      if (fx.loading || typeof fetch !== 'function') return
      const now = Date.now()
      const fresh = fx.table.source !== 'builtin' && now - fx.fetchedAt < RATES_MAX_AGE
      if (fresh || now - fx.failedAt < RETRY_AFTER) return
      fx.loading = true
      fetchRates().then((table) => {
        if (table === null) {
          fx.failedAt = Date.now()
          return
        }
        fx.table = table
        fx.fetchedAt = Date.now()
        storageSet(RATES_KEY, JSON.stringify({ ...table, fetchedAt: fx.fetchedAt }))
        emit()
      }).catch(() => {
        fx.failedAt = Date.now()
      }).finally(() => {
        fx.loading = false
      })
    }

    function setCurrency(code) {
      const next = codeOf(code)
      if (next === null || next === prefs.currency) return
      prefs.currency = next
      storageSet(CURRENCY_KEY, next)
      emit()
    }

    function useBillStoreFallback() {
      const [, setTick] = React.useState(0)
      React.useEffect(() => subscribe(() => setTick(n => n + 1)), [])
      return version
    }

    // Chosen once, so every render calls the same hooks in the same order.
    const useBillStore = typeof React.useSyncExternalStore === 'function'
      ? () => React.useSyncExternalStore(subscribe, getVersion, getVersion)
      : useBillStoreFallback

    /**
     * Convert a money value (`{ [sig]: { [currency]: amount } }`) into one
     * currency: a group priced in that currency uses its own table; the rest
     * converts from USD, or from the group's only currency.
     * @returns {{ value: number, ok: boolean, fx: boolean }} the amount, whether every part converted, and whether rates were used.
     */
    function convert(money, code) {
      const rates = fx.table.rates
      let value = 0
      let ok = true
      let used = false
      if (!isObject(money)) return { value, ok, fx: used }
      for (const bag of Object.values(money)) {
        if (!isObject(bag)) continue
        if (typeof bag[code] === 'number') {
          value += bag[code]
          continue
        }
        const codes = Object.keys(bag).filter(c => typeof bag[c] === 'number')
        if (codes.length === 0) continue
        const pivot = codes.includes('USD') ? 'USD' : codes[0]
        const rate = rates[code] / rates[pivot]
        if (!(rate > 0) || !Number.isFinite(rate)) {
          ok = false
          continue
        }
        value += bag[pivot] * rate
        used = true
      }
      return { value, ok, fx: used }
    }

    function addMoney(target, money) {
      if (!isObject(money)) return
      for (const [sig, bag] of Object.entries(money)) {
        if (!isObject(bag)) continue
        const into = target[sig] || (target[sig] = {})
        for (const [code, amount] of Object.entries(bag)) {
          if (typeof amount === 'number') into[code] = (into[code] || 0) + amount
        }
      }
    }

    // ---- views ----------------------------------------------------------------

    function single(amount, code) {
      return typeof amount === 'number' && amount !== 0 ? { [code]: { [code]: amount } } : {}
    }

    /**
     * v2 views priced everything in one currency; read them as money values.
     * A window that was open across the upgrade can still hold one, so it
     * keeps the full picker and converts at the day's rate like any other.
     */
    function upgradeView(view) {
      const code = codeOf(view.currency) || 'CNY'
      const money = amount => single(amount, code)
      const costs = isObject(view.costs) ? view.costs : {}
      return {
        ...view,
        v: 3,
        currency: code,
        currencies: DEFAULT_CURRENCIES.includes(code) ? DEFAULT_CURRENCIES : [code, ...DEFAULT_CURRENCIES],
        symbol: null,
        liveRates: true,
        cost: money(view.cost),
        costs: { input: money(costs.input), cacheRead: money(costs.cacheRead), cacheWrite: money(costs.cacheWrite), output: money(costs.output) },
        saved: money(view.saved),
        turn: view.turn ? { ...view.turn, cost: money(view.turn.cost) } : null,
        compaction: view.compaction ? { ...view.compaction, cost: money(view.compaction.cost) } : null,
        models: Array.isArray(view.models)
          ? view.models.map(row => ({ ...row, cost: row.cost === null ? null : money(row.cost) }))
          : [],
      }
    }

    const upgraded = new WeakMap()

    /** This plugin's view in the current shape, or null. */
    function readView(value) {
      if (!isObject(value)) return null
      if (value.v === 3 && isObject(value.cost) && isObject(value.costs) && Array.isArray(value.models)) return value
      if (value.v === 2 && typeof value.cost === 'number') {
        let view = upgraded.get(value)
        if (view === undefined) {
          view = upgradeView(value)
          upgraded.set(value, view)
        }
        return view
      }
      return null
    }

    function currencyOptions(view) {
      const listed = Array.isArray(view.currencies) && view.currencies.length > 0 ? view.currencies : DEFAULT_CURRENCIES
      const rates = fx.table.rates
      return listed.filter(code => codeOf(code) !== null && (code === view.currency || rates[code] > 0))
    }

    /** The picked currency when this view can show it, else the configured one. */
    function displayCurrency(view) {
      const options = currencyOptions(view)
      if (prefs.currency !== null && options.includes(prefs.currency)) return prefs.currency
      return codeOf(view.currency) || 'CNY'
    }

    function symbolOf(code, view) {
      if (typeof view.symbol === 'string' && view.symbol !== '' && code === view.currency) return view.symbol
      return SYMBOLS[code] || code
    }

    // ---- formatting --------------------------------------------------------

    function group(text) {
      const [whole, fraction] = text.split('.')
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      return fraction === undefined ? grouped : `${grouped}.${fraction}`
    }

    /**
     * Money text. `badge` and `row` stay short; `panel` keeps cents above 100.
     * @param {number} cost - amount.
     * @param {string} symbol - currency symbol.
     * @param {'badge' | 'row' | 'panel'} mode - where it renders.
     * @returns {string} formatted amount.
     */
    function formatMoney(cost, symbol, mode) {
      const raw = typeof symbol === 'string' ? symbol : ''
      // A symbol ending in a letter (Rp, CHF) reads better with a space.
      const s = /[A-Za-z]$/.test(raw) ? `${raw} ` : raw
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) return `${s}0`
      // Conversion noise (0.99999999) should read as 1.00, not 1.000.
      const value = Number(cost.toPrecision(6))
      const floor = mode === 'row' ? 0.001 : 0.0001
      if (value < floor) return `<${s}${floor}`
      let digits
      if (value < 0.01) digits = mode === 'row' ? 3 : 4
      else if (value < 1) digits = 3
      else if (value < 100 || mode === 'panel') digits = 2
      else digits = 0
      return `${s}${group(value.toFixed(digits))}`
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

    function formatRate(rate) {
      return String(Number(rate.toPrecision(rate >= 100 ? 6 : 5)))
    }

    const displayNames = new Map()

    /** Localized currency names for the picker, when the runtime has them. */
    function currencyName(code, lang) {
      try {
        let names = displayNames.get(lang)
        if (names === undefined) {
          names = typeof Intl === 'object' && typeof Intl.DisplayNames === 'function'
            ? new Intl.DisplayNames([lang], { type: 'currency' })
            : null
          displayNames.set(lang, names)
        }
        const name = names !== null ? names.of(code) : undefined
        if (typeof name === 'string' && name !== code) return `${code} · ${name}`
      } catch (_unsupported) {
        // Fall back to the bare code.
      }
      return code
    }

    function rateNote(code, t) {
      const table = fx.table
      const head = table.source === 'builtin'
        ? t('fx.builtin', { date: table.date })
        : t('fx.live', { date: table.date, source: table.source })
      const shown = code === 'USD' ? 'CNY' : code
      const rate = table.rates[shown]
      return rate > 0 ? `${head} · ${t('fx.rate', { rate: formatRate(rate), code: shown })}` : head
    }

    /**
     * The amounts one view renders, in one currency.
     * @returns {object} converted numbers plus `fx` (rates were used) and `ok`.
     */
    function priced(view, code) {
      let used = false
      let ok = true
      const amount = (money) => {
        const result = convert(money, code)
        used = used || result.fx
        ok = ok && result.ok
        return result.value
      }
      const result = {
        cost: amount(view.cost),
        costs: {
          input: amount(view.costs.input),
          cacheRead: amount(view.costs.cacheRead),
          cacheWrite: amount(view.costs.cacheWrite),
          output: amount(view.costs.output),
        },
        saved: amount(view.saved),
        turn: view.turn !== null ? amount(view.turn.cost) : null,
        compaction: view.compaction !== null ? amount(view.compaction.cost) : null,
        models: view.models.map(row => ({ ...row, amount: row.cost === null ? null : amount(row.cost) })),
      }
      result.fx = used
      result.ok = ok
      return result
    }

    function badgeText(amount, complete, symbol) {
      if (amount <= 0 && !complete) return `${symbol}?`
      return formatMoney(amount, symbol, 'badge') + (complete ? '' : '+')
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
      }, [open, anchorRef, panelRef, gap, margin, options.layoutKey])
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

    /** This plugin's raw view of one Session from the session-list store. */
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
     * a JSON string so the store selector result compares by value.
     */
    function summarizeChildren(list, key, rootId) {
      if (key === '') return ''
      // The root is pre-seeded so a malformed catalog can never count it as its own child.
      const seen = new Set(typeof rootId === 'string' ? [rootId] : [])
      let count = 0
      let known = 0
      let complete = true
      const cost = {}
      const visit = (id, depth) => {
        if (seen.has(id) || depth > 8) return
        seen.add(id)
        count += 1
        const view = readView(viewOf(list, id))
        if (view !== null) {
          known += 1
          addMoney(cost, view.cost)
          if (!view.complete) complete = false
        }
        for (const nested of childIds(catalogOf(list, id))) visit(nested, depth + 1)
      }
      for (const id of key.split('\n')) visit(id, 0)
      return JSON.stringify({ count, known, complete, cost })
    }

    function parseChildren(summary) {
      if (typeof summary !== 'string' || summary === '') return null
      try {
        const parsed = JSON.parse(summary)
        if (!(parsed.count > 0)) return null
        return { count: parsed.count, cost: parsed.cost, complete: parsed.complete === true && parsed.known === parsed.count }
      } catch (_corrupt) {
        return null
      }
    }

    // ---- composer badge and panel --------------------------------------------

    const BUCKETS = [
      { key: 'input', tone: 'dshtb-tone-input' },
      { key: 'cacheRead', tone: 'dshtb-tone-cache' },
      { key: 'cacheWrite', tone: 'dshtb-tone-write' },
      { key: 'output', tone: 'dshtb-tone-output' },
    ]

    function CurrencyPicker({ view, code, t }) {
      const options = currencyOptions(view)
      if (options.length < 2) return null
      const lang = t('lang')
      return h('label', { className: 'dshtb-picker', title: rateNote(code, t) },
        h('span', { className: 'dshtb-picker-code', 'aria-hidden': true }, code),
        h('select', {
          'aria-label': t('currency.label'),
          value: code,
          onChange: event => setCurrency(event.target.value),
        }, options.map(option => h('option', { key: option, value: option }, currencyName(option, lang)))))
    }

    function CostPanel({ view, amounts, code, t, panelRef, position, subagents }) {
      const symbol = symbolOf(code, view)
      const money = value => formatMoney(value, symbol, 'panel')
      const complete = view.complete && amounts.ok
      const buckets = BUCKETS.filter(bucket => bucket.key !== 'cacheWrite' || view.tokens.cacheWrite > 0)
      const segments = amounts.cost > 0
        ? buckets.map(bucket => ({ ...bucket, width: amounts.costs[bucket.key] / amounts.cost * 100 })).filter(s => s.width > 0)
        : []

      const stats = []
      if (view.cacheHitRate !== null) stats.push(['hit', t('stat.cacheHit'), formatPercent(view.cacheHitRate)])
      stats.push(['calls', t('stat.calls'), t('stat.callsValue', { n: view.calls })])
      if (view.tokens.reasoning > 0) stats.push(['reasoning', t('stat.reasoning'), `${formatTokens(view.tokens.reasoning)} tokens`])
      if (amounts.turn !== null && Math.abs(amounts.turn - amounts.cost) > 1e-9) {
        stats.push(['turn', t('stat.turn'), money(amounts.turn) + (view.turn.complete ? '' : '+')])
      }
      if (amounts.compaction !== null) {
        stats.push(['compaction', t('stat.compaction', { n: view.compaction.calls }), money(amounts.compaction)])
      }
      if (view.tiered && amounts.saved > 0) stats.push(['saved', t('stat.saved'), money(amounts.saved)])
      if (subagents !== null) {
        const children = convert(subagents.cost, code)
        const childrenComplete = subagents.complete && children.ok
        stats.push(['subagents', t('stat.subagents', { n: subagents.count }), money(children.value) + (childrenComplete ? '' : '+')])
        stats.push(['grand', t('stat.grand'), money(amounts.cost + children.value) + (childrenComplete && complete ? '' : '+')])
      }

      const repeated = new Set()
      const seenModels = new Set()
      for (const row of amounts.models) {
        if (seenModels.has(row.model)) repeated.add(row.model)
        seenModels.add(row.model)
      }
      const rows = amounts.models.slice().sort((a, b) => (b.amount === null ? -1 : b.amount) - (a.amount === null ? -1 : a.amount) || b.tokens - a.tokens)
      const showModels = rows.length > 1 || rows.some(row => row.amount === null)

      return h('div', {
        ref: panelRef,
        className: 'dshtb-panel',
        style: position || { visibility: 'hidden', left: 0, top: 0 },
        role: 'dialog',
        'aria-label': t('panel.title'),
      },
      h('div', { className: 'dshtb-head' },
        h('span', { className: 'dshtb-title' }, t('panel.title')),
        h(CurrencyPicker, { view, code, t }),
        h('span', { className: 'dshtb-total' }, amounts.cost <= 0 && !complete
          ? t('models.unpriced')
          : money(amounts.cost) + (complete ? '' : '+'))),
      segments.length > 0
        ? h('div', { className: 'dshtb-bar', 'aria-hidden': true },
          segments.map(segment => h('div', {
            key: segment.key,
            className: `dshtb-seg ${segment.tone}`,
            style: { width: `${segment.width}%` },
          })))
        : h('div', { className: 'dshtb-gap' }),
      h('dl', { className: 'dshtb-grid' },
        buckets.map(bucket => h(React.Fragment, { key: bucket.key },
          h('dt', null, h('span', { className: `dshtb-swatch ${bucket.tone}`, 'aria-hidden': true }), t(`bucket.${bucket.key}`)),
          h('dd', null, formatTokens(view.tokens[bucket.key])),
          h('dd', { className: 'dshtb-money' }, amounts.cost > 0 || complete ? money(amounts.costs[bucket.key]) : '—')))),
      h('div', { className: 'dshtb-sep' }),
      h('dl', { className: 'dshtb-grid dshtb-stats' },
        stats.map(([key, label, value]) => h(React.Fragment, { key },
          h('dt', null, label),
          h('dd', { className: key === 'grand' ? 'dshtb-money dshtb-strong' : 'dshtb-money' }, value)))),
      showModels
        ? h(React.Fragment, null,
          h('div', { className: 'dshtb-sep' }),
          h('div', { className: 'dshtb-section' }, t('models.title')),
          h('dl', { className: 'dshtb-grid' },
            rows.map(row => h(React.Fragment, { key: `${row.provider}\n${row.model}` },
              h('dt', { title: row.provider ? `${row.provider} / ${row.model}` : row.model },
                row.model || '?',
                repeated.has(row.model) && row.provider ? h('span', { className: 'dshtb-provider' }, row.provider) : null),
              h('dd', null, formatTokens(row.tokens)),
              h('dd', { className: row.amount === null ? 'dshtb-muted' : 'dshtb-money' },
                row.amount === null ? t('models.unpriced') : money(row.amount))))))
        : null)
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
      useBillStore()
      const read = props.useProjection
      const view = readView(typeof read === 'function' ? read(KEY) : undefined)
      const subagents = useSubagents(props)
      const [open, setOpen] = React.useState(false)
      const rootRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const available = view !== null && (view.calls > 0 || view.compaction !== null)
      const code = available ? displayCurrency(view) : ''
      const amounts = available ? priced(view, code) : null
      // Rates are fetched only when an amount actually needs converting.
      const needsRates = available && view.liveRates !== false && amounts.fx
      // Re-measure when the panel gains or loses rows, or its amounts change width, while it is open.
      const layoutKey = available
        ? [view.models.length, view.complete, view.compaction !== null, view.turn !== null, amounts.saved > 0,
          view.tokens.reasoning > 0, view.tokens.cacheWrite > 0, subagents === null ? 0 : subagents.count, code].join('|')
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
      React.useEffect(() => {
        if (needsRates) ensureRates()
      }, [needsRates])
      if (!available) return null

      const symbol = symbolOf(code, view)
      const complete = view.complete && amounts.ok
      const label = amounts.cost <= 0 && !complete
        ? t('badge.unpriced')
        : t('badge.tooltip', { cost: formatMoney(amounts.cost, symbol, 'panel') + (complete ? '' : '+') })
      return h('span', { ref: rootRef, className: 'dshtb-root' },
        h(Tooltip, { label, side: 'top', delayMs: 200, disabled: open, portal: true },
          h('button', {
            type: 'button',
            className: 'dshtb-trigger',
            'aria-label': label,
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            onClick: () => setOpen(!open),
          }, badgeText(amounts.cost, complete, symbol))),
        open && typeof document !== 'undefined'
          ? ReactDOM.createPortal(h(CostPanel, { view, amounts, code, t, panelRef, position, subagents }), document.body)
          : null)
    }

    // ---- sidebar session rows ---------------------------------------------

    function SessionRowCost(props) {
      useBillStore()
      const useSessions = props.useSessions
      const sessionId = props.sessionId
      const view = readView(typeof useSessions === 'function' ? useSessions(list => viewOf(list, sessionId)) : undefined)
      const code = view !== null ? displayCurrency(view) : ''
      const total = view !== null ? convert(view.cost, code) : null
      const needsRates = view !== null && view.liveRates !== false && total.fx
      React.useEffect(() => {
        if (needsRates) ensureRates()
      }, [needsRates])
      if (view === null || view.showInList === false || !(total.value > 0)) return null
      const t = translator(props.t)
      const symbol = symbolOf(code, view)
      const more = view.complete && total.ok ? '' : '+'
      return h('span', {
        className: 'dshtb-row',
        title: t('row.title', { cost: formatMoney(total.value, symbol, 'panel') + more }),
      }, formatMoney(total.value, symbol, 'row') + more)
    }

    // ---- styles ---------------------------------------------------------------

    // Theme tokens only, so light, dark, and skins follow the host. The panel
    // mirrors the built-in context meter's panel.
    const CSS = [
      '.dshtb-root{flex:none;display:inline-flex}',
      '.dshtb-trigger{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;cursor:pointer;background:0 0;border:none;flex:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}',
      '.dshtb-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '@media (hover:hover){.dshtb-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}',
      '.dshtb-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:min(300px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;max-width:var(--dsh-anchored-max-width,none);max-height:var(--dsh-anchored-max-height,none);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;padding:12px;font-size:12px;line-height:20px;position:fixed;overflow:hidden auto}',
      '.dshtb-head{display:flex;align-items:center;gap:6px}',
      '.dshtb-title{color:var(--dsw-alias-label-tertiary);margin-right:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshtb-total{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}',
      // The native select sits invisibly over the code, so the closed control
      // follows the theme while the open list stays native and accessible.
      '.dshtb-picker{position:relative;flex:none;display:inline-flex;align-items:center;gap:3px;border-radius:var(--dsw-radius-sm);padding:0 5px 0 6px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px;cursor:pointer}',
      '.dshtb-picker::after{content:"";width:4px;height:4px;margin:-2px 0 0 1px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(45deg)}',
      '.dshtb-picker:focus-within{outline:2px solid var(--dsw-alias-border-focus,#4d6bfe);outline-offset:1px}',
      '@media (hover:hover){.dshtb-picker:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}',
      '.dshtb-picker select{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;opacity:0;cursor:pointer;font:inherit;color-scheme:light}',
      '[data-ds-dark-theme] .dshtb-picker select{color-scheme:dark}',
      '.dshtb-bar{background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;gap:1px;height:4px;margin:10px 0;display:flex;overflow:hidden}',
      '.dshtb-gap{height:8px}',
      '.dshtb-seg{background:var(--dshtb-tint);border-radius:1px;flex:none;min-width:2px;height:100%}',
      '.dshtb-swatch{background:var(--dshtb-tint);vertical-align:baseline;border-radius:2px;width:8px;height:8px;margin-right:6px;display:inline-block}',
      '.dshtb-tone-input{--dshtb-tint:var(--dsw-static-blue-450,#4d6bfe)}',
      '.dshtb-tone-cache{--dshtb-tint:var(--dsw-static-neutral-bluish-400,#8a94a6)}',
      '.dshtb-tone-write{--dshtb-tint:#f59e0b}',
      '.dshtb-tone-output{--dshtb-tint:#a78bfa}',
      '.dshtb-grid{display:grid;grid-template-columns:minmax(0,1fr) auto auto;column-gap:12px;row-gap:2px;align-items:baseline;margin:0}',
      '.dshtb-grid dt{color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshtb-grid dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.dshtb-grid dd.dshtb-money{color:var(--dsw-alias-label-primary)}',
      '.dshtb-grid dd.dshtb-muted{color:var(--dsw-alias-label-tertiary)}',
      '.dshtb-stats{grid-template-columns:minmax(0,1fr) auto}',
      '.dshtb-strong{font-weight:500}',
      '.dshtb-provider{margin-left:6px;color:var(--dsw-alias-label-tertiary)}',
      '.dshtb-sep{border-top:.5px solid var(--dsw-alias-border-l2);margin:8px 0}',
      '.dshtb-section{color:var(--dsw-alias-label-tertiary);margin-bottom:2px}',
      '.dshtb-row{flex:none;color:inherit;font-size:10px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    ].join('')

    /** Install (or refresh) this plugin's one stylesheet. */
    function ensureStyles() {
      if (typeof document === 'undefined') return null
      let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_KEY)}]`)
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-token-bill'
        tag.dataset.pluginCss = STYLE_KEY
        document.head.appendChild(tag)
      }
      tag.textContent = CSS
      return tag
    }

    return {
      name: 'dsh-token-bill',
      inject: ['slots', 'locale'],
      /**
       * Register the stylesheet, the dictionaries, the cross-window settings
       * sync, and both slot entries. Each rides this plugin's fiber, so
       * turning the plugin off removes them all.
       * @param ctx - client plugin context.
       */
      apply(ctx) {
        ctx.effect(() => {
          const tag = ensureStyles()
          return () => {
            if (tag !== null) tag.remove()
          }
        }, 'dsh-token-bill: stylesheet')
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-token-bill: dictionaries')
        ctx.effect(() => {
          // Another window picked a currency or fetched rates: follow it.
          if (typeof window.addEventListener !== 'function') return () => {}
          const onStorage = (event) => {
            if (event.key === CURRENCY_KEY) {
              loadStoredCurrency()
              emit()
            } else if (event.key === RATES_KEY) {
              loadStoredRates()
              emit()
            }
          }
          window.addEventListener('storage', onStorage)
          return () => window.removeEventListener('storage', onStorage)
        }, 'dsh-token-bill: settings sync')
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'dsh-token-bill',
          order: -1,
          locale: NS,
        }, CostBadge))
        ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
          name: 'sidebar.session.row.trailing',
          id: 'dsh-token-bill',
          locale: NS,
        }, SessionRowCost))
      },
    }
  },
})
