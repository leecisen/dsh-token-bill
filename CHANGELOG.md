# Changelog

## 2.1.0 — 2026-11-08

### Added

- **Currency picker** in the breakdown panel's header. Every amount, the badge and the sidebar included, switches to the picked currency, and the choice is remembered. The default list follows DeepSeek's largest user regions: CNY, USD, EUR, RUB, INR, IDR, BRL, HKD (`currencies` changes it).
- **Daily exchange rates**: amounts that need converting use the day's rate from currency-api (with jsDelivr and ExchangeRate-API as backups), fetched at most every 12 hours and cached in the browser; built-in rates of 2026-11-07 cover offline use. `exchangeRates: false` keeps the plugin offline. Hover the currency to see the rates' date and source.
- **Official prices for 16 vendors, over 100 models** (checked 2026-11-08): DeepSeek; Anthropic Claude, OpenAI, Google Gemini, xAI Grok; Moonshot Kimi, Zhipu GLM, MiniMax, Alibaba Qwen, ByteDance Doubao, Tencent Hunyuan, Baidu ERNIE, Xiaomi MiMo, StepFun, Ant Group Ling, Meituan LongCat. Models with both a mainland-China CNY price and an international USD price use the table matching the displayed currency.
- **Long-context tiers**: each call is priced by its own prompt size (Claude Haiku 5.5 above 100k, Gemini and Grok above 200k, OpenAI above 272k, Qwen, Doubao, GLM-5.1, ERNIE, MiniMax).
- **Dated price changes**: a price with a start date applies from that Beijing day, so Gemini 4 Argon's and Gemini 3.8 Flash's promotional prices end on schedule, and Step 5 Preview's cache price rises on 2026-10-14, without re-pricing earlier calls.
- Model ids are matched across spellings: OpenRouter `vendor/model`, Bedrock and Vertex ids, dated snapshots, dots or dashes in version numbers; OpenRouter `:free` models cost nothing.
- 2027 Chinese public holidays (announced 2026-11-05).
- `models` entries take an optional `currency`; `cacheRead` is the new name for `cacheHit` (both work).

### Changed

- The panel's footnote is gone; the panel title already says the amounts are estimates.
- Holidays are applied when the view is built, so holidays added in the config re-price past sessions too.
- The projection state records each call's Beijing date and prompt-size band (state version 3): after updating, each session's history is counted again once.
- Views carry amounts per official currency (view version 3). The browser half still reads views a window received from 2.0 before the update, with the currency picker, until the window reloads.

## 2.0.2 — 2026-11-08

Documentation only; the plugin code is unchanged.

- Install by name: DeepSeek Harness → Plugins → Add plugin → `dsh-token-bill`, now that the package is on npm (and updates in one click). `github:leecisen/dsh-token-bill` and the offline ZIP stay as alternatives.
- README: npm / license / DeepSeek Harness version badges, a one-line install at the top, and upgrade notes per older version.
- More npm keywords for search.

## 2.0.1 — 2026-11-07

### Changed

- **Renamed to `dsh-token-bill`** (repository `leecisen/dsh-token-bill`, row id `dsh-token-bill`, projection key `dshTokenBill`). The npm name `dsh-token-cost` belongs to a different author's plugin, so installing by that bare name never reached this one. Install with `github:leecisen/dsh-token-bill`.
- If you installed 2.0.0 (then named `dsh-token-cost`), uninstall it on the Plugins page before installing 2.0.1.
- Sharper 2x README screenshots in Chinese and English; panel notes keep "9–12" on one line and drop the stray space after Chinese full stops.

## 2.0.0 — 2026-11-07

A rewrite of the v1 `@local/token-cost` plugin, published as `dsh-token-cost`.

### Added

- **Per-model pricing.** Usage is tracked per provider + model, read from each message's source (or the latest request header for failed attempts), and priced with that model's rates.
- **Built-in official DeepSeek prices** for `deepseek-flash` and `deepseek-v4-pro` in CNY and USD (checked 2026-11-07); the retired names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` bill as Flash.
- **Peak / off-peak pricing.** Each call is priced by its Beijing time: weekdays 09:00–12:00 and 14:00–18:00 are peak, everything else (weekends and the built-in 2026 public holidays) is half price. `holidays` adds more days; `timeOfDayPricing: false` turns it off.
- **Breakdown panel** on click: cost per token bucket with a proportion bar, cache hit rate, model calls, thinking tokens, last turn, compaction, off-peak savings, subagents with a grand total, and per-model rows. It follows the built-in context meter's look and closes on Escape or an outside click.
- **Sidebar costs**: every conversation in the session list shows its cost beside its time (`showInSessionList`).
- **Compaction calls are billed** (`compaction/summary`), which the built-in token meter does not count.
- **Forked sessions** no longer re-bill the events they inherited from their parent.
- `models` overrides keyed by `model` or `provider/model`, optional `offPeak` and `cacheWrite` prices, and a `fallback` price for unknown models; models without a price are shown as unpriced instead of guessed.
- Chinese and English UI, plugin title / description / detail document for the Plugins page.
- Unit tests for the fold, the pricing, the Host entry, and a Node smoke test of the browser components.

### Changed

- Package renamed to `dsh-token-cost`; row id `dsh-token-cost`, projection key `dshTokenCost`, so v1 and v2 can be installed side by side during an upgrade.
- The projection stores tokens only and prices them in the view, so price edits apply to every past session.
- Registration is awaited and checkpoint state is validated on restore, as the session-projection contract asks.

### Compatibility

- v1's `inputPrice`, `cacheHitPrice`, and `outputPrice` are still read, as the fallback price for models without their own.

## 1.0.0

- First version (`@local/token-cost`): one cost badge next to the context ring, a single price table for the whole session.
