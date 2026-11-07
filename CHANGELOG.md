# Changelog

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
