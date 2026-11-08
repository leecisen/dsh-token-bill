# dsh-token-bill · Conversation cost

[![npm](https://img.shields.io/npm/v/dsh-token-bill?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-token-bill)
[![license](https://img.shields.io/npm/l/dsh-token-bill)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-%E2%89%A5%200.2.2--rc.1-4d6bfe)](https://github.com/deepseek-ai/deepseek-harness)

[中文](README.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that estimates **what every conversation costs**. Besides DeepSeek, it knows the official prices of Claude, GPT, Gemini, Grok, and the main models of 11 Chinese vendors, and shows them in the currency you pick: dollars, euros, rubles, and more.

**Install**: DeepSeek Harness → **Plugins** → **Add plugin**, enter `dsh-token-bill`. ([details](#install))

- **Under the composer**: the session's estimated cost sits left of the context ring; click it for a breakdown.
- **In the sidebar**: every conversation shows its cost next to its time, without opening it.
- **Official prices from 16 vendors**: DeepSeek; Anthropic Claude, OpenAI GPT, Google Gemini, xAI Grok; and from China, Moonshot Kimi, Zhipu GLM, MiniMax, Alibaba Qwen, ByteDance Doubao, Tencent Hunyuan, Baidu ERNIE, Xiaomi MiMo, StepFun, Ant Group Ling, and Meituan LongCat: over 100 models ([price table](#built-in-prices)). Long-context tiers and announced price changes are applied call by call. Price any other model in the config.
- **Pick a currency**: the top-right of the panel switches the display currency. The default choices are CNY, USD, EUR, RUB, INR, IDR, BRL, and HKD, the regions where DeepSeek has the most users. Models with both an official CNY and an official USD price use the matching table; everything else converts at the day's exchange rate ([details](#currencies-and-exchange-rates)).
- **Peak / off-peak aware**: DeepSeek charges peak rates on Beijing weekdays 09:00–12:00 and 14:00–18:00 and half price at all other times (weekends and Chinese public holidays included). Each call is priced by **when it happened**, and the panel shows how much off-peak hours saved.
- **More complete**: counts the model calls made by context compaction (the built-in token meter does not), lists subagent costs with a grand total, and never re-bills the history a forked conversation inherited.
- **Price edits apply at once**: sessions store tokens only and prices are applied when the view is built, so changing a price re-prices every past conversation.
- Chinese and English UI, follows the light / dark theme; no dependencies, no build step.

> Costs are estimated from provider-reported token usage and a price table. Your bill is authoritative.

## Screenshots

| Breakdown panel (light) | Breakdown panel (dark) | Sidebar |
|---|---|---|
| <img src="docs/panel-light-en.png" width="362" alt="Cost breakdown panel in the light theme, shown in US dollars"> | <img src="docs/panel-dark-en.png" width="362" alt="Cost breakdown panel in the dark theme, shown in US dollars"> | <img src="docs/sidebar-en.png" width="300" alt="Each conversation's cost in the sidebar list"> |

<sub>2x preview renders of the plugin's code with the DSH theme; the plugin follows DSH's language setting. Sample data, shown in USD: one peak-hour exchange and one night-time (off-peak) exchange that also called Claude Sonnet 5.5 and GLM-5.3 once each, one compaction, and one subagent.</sub>

What the panel shows:

| Row | Meaning |
|---|---|
| Currency, top right | Switches the display currency for every amount, the sidebar included; the choice is remembered. Hover it for the exchange rate's date and source. |
| Input · cache miss / cache hit / Output | Tokens and cost per bucket; the bar shows each bucket's share of the cost. A "Cache write" row appears when there are cache writes. |
| Cache hit rate | Cached input ÷ all input. |
| Model calls | Billed model calls (a failed attempt that was retried counts too). |
| Thinking (in output) | Thinking (reasoning) tokens, already included in Output. |
| Last turn | Cost of the most recent turn. |
| Compaction | Cost of the model calls made while compacting the context. |
| Off-peak savings | What you saved compared with paying peak prices throughout. |
| Subagents / Total incl. subagents | Cost of the subagents this session started, and the total with them. |
| By model | Tokens and cost per model, most expensive first; models without a price show "no price". |

- A trailing `+` means some model has no price and is left out of the total (marked "no price" under By model).
- The subagent lines appear only when the session started subagents and the sidebar has loaded their data.

## Install

Requires DeepSeek Harness **0.2.2-rc.1 or newer**.

### From the Plugins page (recommended)

DeepSeek Harness sidebar → **Plugins** → **Add plugin**, then enter:

```text
dsh-token-bill
```

Click **Install**, then **Enable now**. The plugin is published on [npm](https://www.npmjs.com/package/dsh-token-bill), so new versions can be updated in one click on the Plugins page.

From the command line: `dsh plugin add dsh-token-bill` (add `--profile <your profile>` if you need one).

> The China mirror (npmmirror) can take a while to pick up a new version. If you don't get the latest one, switch **Registry** in **Add plugin** to the official npm registry.

### Other ways to install

- **From GitHub**: enter `github:leecisen/dsh-token-bill` in **Add plugin** to install the repository's latest code. A plugin installed this way can't be updated in one click; uninstall and reinstall it to upgrade.
- **Offline**: download the source ZIP from [Releases](https://github.com/leecisen/dsh-token-bill/releases), extract it somewhere permanent, and enter that folder's **absolute path** in **Add plugin** (for example `D:\dsh-plugins\dsh-token-bill`).

### Upgrading from an older version

- **2.0.x → 2.1**: click Update on the **Plugins** page. 2.1 records usage differently, so the first time a session opens after the update its history is counted again; with many sessions this can take a few seconds.
- **v1 (`@local/token-cost`)**: v2 is a separate package (package `dsh-token-bill`, row id `dsh-token-bill`) and does not clash with v1. Install and enable v2, then turn off or remove `@local/token-cost` on the **Plugins** page. v1's `inputPrice` / `cacheHitPrice` / `outputPrice` fields still work as the fallback price for models without one.
- **2.0.0 (then named `dsh-token-cost`)**: uninstall it on the **Plugins** page first, then install as above. Note that the npm package named `dsh-token-cost` is **someone else's plugin**, not an older version of this one.
- **2.0.1 installed through `github:`**: uninstall it and reinstall by entering `dsh-token-bill` to get one-click updates.

## Configuration

It works without any configuration: CNY, peak / off-peak pricing, costs in the sidebar, exchange rates refreshed daily. To change that, add an entry to your profile's `cordis.patch.yml` (on Windows usually `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`):

```yaml
- id: dsh-token-bill
  config:
    currency: CNY            # default display currency; also the currency of custom prices
    currencies: [CNY, USD, EUR, RUB, INR, IDR, BRL, HKD]   # currencies the panel offers
    exchangeRates: true      # fetch the day's exchange rates; false = built-in rates only, no network
    timeOfDayPricing: true   # DeepSeek peak / off-peak tiers; false = everything at peak (an upper bound)
    showInSessionList: true  # show each conversation's cost in the sidebar
    holidays:                # extra public holidays (Beijing dates), off-peak all day
      - '2028-01-01'
    models:                  # prices per million tokens
      my-model:              # key: a model id, or provider/model id
        input: 0.8           # input, cache miss
        cacheRead: 0.2       # input, cache hit (defaults to input; the old name cacheHit works too)
        output: 2            # output
        currency: CNY        # currency of these prices (defaults to `currency` above)
        # cacheWrite: 1      # cache write (defaults to input)
        # offPeak:           # optional off-peak card; missing fields inherit from above
        #   output: 1
      deepseek-account/deepseek-v4-pro:   # e.g. override one provider's copy of a model
        input: 0
        cacheRead: 0
        output: 0
    fallback:                # optional: price for every model without one; omit to show "no price"
      input: 2
      cacheRead: 0.5
      output: 8
```

Note: this `config` **replaces** the plugin's own config as a whole (DeepSeek Harness does not merge them); fields you leave out take the defaults below.

| Field | Default | Meaning |
|---|---|---|
| `currency` | `CNY` | Default display currency (a three-letter code); a currency picked in the panel takes precedence. Also the default currency of custom prices. |
| `currencies` | `CNY USD EUR RUB INR IDR BRL HKD` | Currencies the panel offers. Any three-letter code works, for example add `JPY`, `KRW`, or `TWD`. |
| `exchangeRates` | `true` | Fetch the day's exchange rates online. |
| `symbol` | by currency (`¥`, `$`, `₽`, …) | Symbol shown before amounts in `currency`. |
| `timeOfDayPricing` | `true` | Price DeepSeek peak and off-peak hours separately. |
| `showInSessionList` | `true` | Show each conversation's cost in the sidebar list. |
| `holidays` | built-in 2026 and 2027 days off | Extra holidays as `YYYY-MM-DD` (Beijing time). |
| `models` | none | Custom or overriding prices. Lookup: `provider/model` → `model` → built-in → `fallback`. |
| `fallback` | none | Fallback price. v1's `inputPrice` / `cacheHitPrice` / `outputPrice` mean the same. |

### Currencies and exchange rates

- **Why these eight**: they cover the regions where DeepSeek has the most users: China, Russia, the US, Hong Kong, and Brazil lead its web traffic, and India, Indonesia, and Europe have many monthly users (third-party figures collected by [Second Talent](https://www.secondtalent.com/resources/deepseek-statistics/), [Panto](https://www.getpanto.ai/blog/deepseek-ai-statistics), and [Statista](https://www.statista.com/statistics/1556986/deepseek-global-web-traffic-share-by-country)). Add others with `currencies`.
- **How amounts convert**: models with both an official CNY and an official USD price (DeepSeek, Kimi K3, Zhipu GLM-5.x, MiniMax, Xiaomi MiMo, Meituan LongCat) use the matching table when CNY or USD is shown. Everything else is priced in its official currency first, then converted.
- **Where the rates come from**: the plugin goes online only when an amount actually needs converting, trying [currency-api](https://github.com/fawazahmed0/exchange-api) (`latest.currency-api.pages.dev`, with jsDelivr as a backup) and then [ExchangeRate-API](https://www.exchangerate-api.com) (`open.er-api.com`). It asks at most once every 12 hours and keeps the result in the browser's local storage; requests carry no session data. Offline, it uses built-in rates from 2026-11-07. Hover the currency in the panel to see the rates' date and source.
- Amounts use the latest daily rate, past sessions included, so they can differ from what your bank or card actually charged.

### Built-in prices

From each vendor's official price page, checked **2026-11-08**, per million tokens. CNY prices are mainland-China list prices; USD prices are international ones.

- **Long context**: the tier is picked by each request's prompt size (input + cache reads + cache writes).
- **Price changes**: dated rows apply from that day (Beijing time), for example Gemini 4 Argon's promotional price ends on November 30.
- **Cache writes**: Anthropic and Kimi at the 5-minute cache price, OpenAI at the 30-minute price; elsewhere at the input price unless listed.
- **Limited-time discounts**: when no end date is given, the price charged today is used (Qwen `qwen3.7-plus` at 20% off, the launch discounts of Ant Group Ling and Meituan LongCat); MiniMax calls its 50% off permanent. OpenAI's `gpt-5.6-sol` promotional price runs until November 30; the price after that has not been published.
- **Model ids**: matched case-insensitively; gateway `vendor/` prefixes (OpenRouter), Bedrock and Vertex spellings, and trailing date versions are dropped; `claude-opus-4.5` and `claude-opus-4-5` are the same model; OpenRouter's `:free` models cost nothing.
- DeepSeek peak hours: Beijing time Monday to Friday (except Chinese public holidays) 09:00–12:00 and 14:00–18:00 (01:00–04:00 and 06:00–10:00 UTC); all other hours are off-peak. The 2026 and 2027 holidays are built in (2027's schedule was announced by the State Council on 2026-11-05).
- Through the DeepSeek account provider (`deepseek-account`) the cost is the API-equivalent price. If your account runs on a quota or plan, set `deepseek-account/<model>` under `models` to 0 or to your real rate.
- Prices can change; the official pages win. Issues and PRs for outdated prices are welcome.

<details>
<summary><b>All built-in prices (click to expand)</b></summary>

| Vendor | Model | Input (cache miss) | Input (cache hit) | Output | Notes |
|---|---|---|---|---|---|
| [DeepSeek](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) | `deepseek-flash` | ¥2 / $0.30 | ¥0.04 / $0.006 | ¥8 / $1.20 | half price off-peak; also `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `deepseek-v4.1-flash` |
|  | `deepseek-v4-pro` | ¥9 / $1.32 | ¥0.30 / $0.044 | ¥27 / $3.96 | half price off-peak |
| [Anthropic Claude](https://platform.claude.com/docs/en/about-claude/pricing) | `claude-fable-5-1` | $10 | $0.25 | $50 | cache write $12.50 |
|  | `claude-mythos-5-1` | $10 | $0.25 | $50 | cache write $12.50 |
|  | `claude-fable-5` | $10 | $1 | $50 | cache write $12.50 |
|  | `claude-mythos-5` | $10 | $1 | $50 | cache write $12.50 |
|  | `claude-opus-5-5` | $4 | $0.20 | $20 | cache write $5 |
|  | `claude-opus-5` | $5 | $0.50 | $25 | cache write $6.25 |
|  | `claude-opus-4-8` | $5 | $0.50 | $25 | cache write $6.25 |
|  | `claude-opus-4-7` | $5 | $0.50 | $25 | cache write $6.25 |
|  | `claude-opus-4-6` | $5 | $0.50 | $25 | cache write $6.25 |
|  | `claude-opus-4-5` | $5 | $0.50 | $25 | cache write $6.25 |
|  | `claude-sonnet-5-5` | $2 | $0.10 | $10 | cache write $2.50 |
|  | `claude-sonnet-5` | $2 | $0.20 | $10 | cache write $2.50 |
|  | `claude-sonnet-4-6` | $3 | $0.30 | $15 | cache write $3.75 |
|  | `claude-sonnet-4-5` | $3 | $0.30 | $15 | cache write $3.75 |
|  | `claude-haiku-5-5` | $0.10 | $0.01 | $0.50 | prompt > 100k: $0.50 / $0.05 / $2.50; cache write $0.125 |
|  | `claude-haiku-4-5` | $1 | $0.10 | $5 | cache write $1.25 |
| [OpenAI](https://developers.openai.com/api/docs/pricing) | `gpt-6-astra` | $10 | $1 | $50 | prompt > 272k: $20 / $2 / $75; cache write $12.50 |
|  | `gpt-6.1-sol` | $2 | $0.10 | $10 | prompt > 272k: $4 / $0.20 / $15; cache write $2.50 |
|  | `gpt-6.1-terra` | $1 | $0.05 | $5 | prompt > 272k: $2 / $0.10 / $7.50; cache write $1.25 |
|  | `gpt-6-sol` | $2 | $0.20 | $10 | prompt > 272k: $4 / $0.40 / $15; cache write $2.50 |
|  | `gpt-6-luna` | $0.10 | $0.01 | $0.50 | prompt > 272k: $0.20 / $0.02 / $0.75; cache write $0.125 |
|  | `gpt-5.6-sol` | $4 | $0.40 | $20 | prompt > 272k: $8 / $0.80 / $30; cache write $5 |
|  | `gpt-5.6-terra` | $2 | $0.20 | $12 | prompt > 272k: $4 / $0.40 / $18; cache write $2.50 |
|  | `gpt-5.6-luna` | $0.20 | $0.02 | $1.20 | prompt > 272k: $0.40 / $0.04 / $1.80; cache write $0.25 |
|  | `gpt-5.5` | $5 | $0.50 | $30 | prompt > 272k: $10 / $1 / $45 |
|  | `gpt-5.5-pro` | $30 | $30 | $180 | prompt > 272k: $60 / $60 / $270 |
|  | `gpt-5.4` | $2.50 | $0.25 | $15 | prompt > 272k: $5 / $0.50 / $22.50 |
|  | `gpt-5.4-pro` | $30 | $30 | $180 | prompt > 272k: $60 / $60 / $270 |
|  | `gpt-5.4-mini` | $0.75 | $0.075 | $4.50 |  |
|  | `gpt-5.4-nano` | $0.20 | $0.02 | $1.25 |  |
|  | `gpt-5.3-codex` | $1.75 | $0.175 | $14 |  |
|  | `gpt-5.2` | $1.75 | $0.175 | $14 |  |
|  | `gpt-5.2-pro` | $21 | $21 | $168 |  |
|  | `gpt-5.1` | $1.25 | $0.125 | $10 |  |
|  | `gpt-5` | $1.25 | $0.125 | $10 |  |
|  | `gpt-5-mini` | $0.25 | $0.025 | $2 |  |
|  | `gpt-5-nano` | $0.05 | $0.005 | $0.40 |  |
|  | `gpt-5-pro` | $15 | $15 | $120 |  |
|  | `gpt-4.1` | $2 | $0.50 | $8 |  |
|  | `gpt-4.1-mini` | $0.40 | $0.10 | $1.60 |  |
|  | `gpt-4o` | $2.50 | $1.25 | $10 |  |
|  | `gpt-4o-mini` | $0.15 | $0.075 | $0.60 |  |
|  | `o3` | $2 | $0.50 | $8 |  |
|  | `o3-pro` | $20 | $20 | $80 |  |
|  | `chat-latest` | $5 | $0.50 | $30 |  |
| [Google Gemini](https://ai.google.dev/gemini-api/docs/pricing) | `gemini-4-argon` | $2 | $0.10 | $10 | from 2026-12-01: $4 / $0.20 / $20 |
|  | `gemini-3.8-flash` | $0.75 | $0.075 | $3.75 | from 2027-01-01: $1.50 / $0.15 / $7.50 |
|  | `gemini-3.5-flash-lite` | $0.30 | $0.03 | $2.50 |  |
|  | `gemini-3.1-flash-lite` | $0.25 | $0.025 | $1.50 |  |
|  | `gemini-3.1-pro-preview` | $2 | $0.20 | $12 | prompt > 200k: $4 / $0.40 / $18; also `gemini-3.1-pro-preview-customtools` |
|  | `gemini-3-flash-preview` | $0.50 | $0.05 | $3 |  |
|  | `gemini-2.5-pro` | $1.25 | $0.125 | $10 | prompt > 200k: $2.50 / $0.25 / $15; from 2026-12-01: $0.75 / $0.075 / $3.75 |
|  | `gemini-2.5-flash` | $0.30 | $0.03 | $2.50 |  |
|  | `gemini-2.5-flash-lite` | $0.10 | $0.01 | $0.40 |  |
| [xAI Grok](https://docs.x.ai/docs/models) | `grok-4.7` | $2 | $0.50 | $6 | prompt > 200k: $4 / $1 / $12 |
|  | `grok-4.6` | $2 | $0.50 | $6 | prompt > 200k: $4 / $1 / $12 |
|  | `grok-4.5` | $2 | $0.30 | $6 | prompt > 200k: $4 / $0.60 / $12 |
|  | `grok-4.3` | $1.25 | $0.20 | $2.50 | prompt > 200k: $2.50 / $0.40 / $5 |
|  | `grok-4.20-0309-reasoning` | $1.25 | $0.20 | $2.50 | prompt > 200k: $2.50 / $0.40 / $5 |
|  | `grok-4.20-0309-non-reasoning` | $1.25 | $0.20 | $2.50 | prompt > 200k: $2.50 / $0.40 / $5 |
|  | `grok-4.20-multi-agent-0309` | $1.25 | $0.20 | $2.50 | prompt > 200k: $2.50 / $0.40 / $5 |
|  | `grok-build-0.1` | $1 | $0.20 | $2 | prompt > 200k: $2 / $0.40 / $4 |
| [Moonshot Kimi](https://platform.kimi.com/docs/pricing/chat) | `kimi-k3.1-pro` | ¥13 | ¥1.30 | ¥68 |  |
|  | `kimi-k3.1-pro-highspeed` | ¥26 | ¥1.30 | ¥136 |  |
|  | `kimi-k3` | ¥20 / $3 | ¥2 / $0.30 | ¥100 / $15 |  |
|  | `kimi-k2.7-code` | ¥6.50 | ¥1.30 | ¥27 |  |
|  | `kimi-k2.7-code-highspeed` | ¥13 | ¥2.60 | ¥54 |  |
|  | `kimi-k2.6` | ¥6.50 | ¥1.10 | ¥27 |  |
| [Zhipu GLM](https://bigmodel.cn/pricing) | `glm-5.3` | ¥8 / $1.40 | ¥2 / $0.26 | ¥28 / $4.40 |  |
|  | `glm-5.3-flash` | ¥0.80 / $0.15 | ¥0.23 / $0.03 | ¥2.80 / $0.50 |  |
|  | `glm-5.3-flashx` | ¥2 / $0.37 | ¥0.57 / $0.075 | ¥7 / $1.25 |  |
|  | `glm-5.2` | ¥8 / $1.40 | ¥2 / $0.26 | ¥28 / $4.40 |  |
|  | `glm-5.1` | ¥6 / $1.40 | ¥1.30 / $0.26 | ¥24 / $4.40 | prompt > 32k: ¥8 / ¥2 / ¥28 |
|  | `glm-5` | $1 | $0.20 | $3.20 |  |
|  | `glm-4.7` | $0.60 | $0.11 | $2.20 |  |
|  | `glm-4.6` | $0.60 | $0.11 | $2.20 |  |
|  | `glm-4.5` | $0.60 | $0.11 | $2.20 |  |
|  | `glm-4.5-air` | $0.20 | $0.03 | $1.10 |  |
|  | `glm-4.7-flash` | free | free | free |  |
|  | `glm-4.5-flash` | free | free | free |  |
| [MiniMax](https://platform.minimaxi.com/docs/guides/pricing) | `minimax-m3` | ¥2.10 / $0.30 | ¥0.42 / $0.06 | ¥8.40 / $1.20 | prompt > 512k: ¥4.20 / ¥0.84 / ¥16.80 ($0.60 / $0.12 / $2.40) |
|  | `minimax-m3.1-flash` | ¥1 / $0.15 | ¥0.10 / $0.015 | ¥4 / $0.60 |  |
| [Alibaba Qwen](https://help.aliyun.com/zh/model-studio/model-pricing) | `qwen3.8-max` | ¥12 | ¥2.40 | ¥36 |  |
|  | `qwen3.7-max` | ¥12 | ¥2.40 | ¥36 |  |
|  | `qwen3.7-plus` | ¥1.60 | ¥0.32 | ¥6.40 | prompt > 256k: ¥4.80 / ¥0.96 / ¥19.20 |
|  | `qwen3.6-plus` | ¥2 | ¥0.40 | ¥12 | prompt > 256k: ¥8 / ¥1.60 / ¥48 |
|  | `qwen3.8-flash` | ¥0.80 | ¥0.16 | ¥2.70 |  |
|  | `qwen3.6-flash` | ¥1.20 | ¥0.24 | ¥7.20 | prompt > 256k: ¥4.80 / ¥0.96 / ¥28.80 |
|  | `qwen-max` | ¥2.40 | ¥0.48 | ¥9.60 |  |
|  | `qwen-flash` | ¥0.15 | ¥0.03 | ¥1.50 | prompt > 128k: ¥0.60 / ¥0.12 / ¥6; prompt > 256k: ¥1.20 / ¥0.24 / ¥12 |
| [ByteDance Doubao](https://www.volcengine.com/docs/82379/1544106) | `doubao-seed-2.1-pro` | ¥6 | ¥1.20 | ¥30 |  |
|  | `doubao-seed-2.1-turbo` | ¥3 | ¥0.60 | ¥15 |  |
|  | `doubao-seed-2.1-lite` | ¥0.80 | ¥0.16 | ¥2.70 |  |
|  | `doubao-seed-evolving` | ¥6 | ¥1.20 | ¥30 |  |
|  | `doubao-seed-2.0-pro` | ¥3.20 | ¥0.64 | ¥16 | prompt > 32k: ¥4.80 / ¥0.96 / ¥24; prompt > 128k: ¥9.60 / ¥1.92 / ¥48 |
|  | `doubao-seed-2.0-code` | ¥3.20 | ¥0.64 | ¥16 | prompt > 32k: ¥4.80 / ¥0.96 / ¥24; prompt > 128k: ¥9.60 / ¥1.92 / ¥48 |
|  | `doubao-seed-2.0-lite` | ¥0.60 | ¥0.12 | ¥3.60 | prompt > 32k: ¥0.90 / ¥0.18 / ¥5.40; prompt > 128k: ¥1.80 / ¥0.36 / ¥10.80 |
|  | `doubao-seed-2.0-mini` | ¥0.20 | ¥0.04 | ¥2 | prompt > 32k: ¥0.40 / ¥0.08 / ¥4; prompt > 128k: ¥0.80 / ¥0.16 / ¥8 |
| [Tencent Hunyuan](https://cloud.tencent.com/product/tokenhub) | `hy4` | ¥6 | ¥0.30 | ¥18 |  |
|  | `hy3` | ¥1 | ¥0.25 | ¥4 |  |
| [Baidu ERNIE](https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya) | `ernie-5.1` | ¥4 | ¥4 | ¥18 | prompt > 32k: ¥6 / ¥6 / ¥22 |
| [Xiaomi MiMo](https://platform.xiaomimimo.com/docs/pricing) | `mimo-v2.6-pro` | ¥3 / $0.435 | ¥0.025 / $0.0036 | ¥6 / $0.87 |  |
|  | `mimo-v2.6-flash` | ¥1 / $0.14 | ¥0.02 / $0.0028 | ¥2 / $0.28 |  |
|  | `mimo-v2.6-pro-ultraspeed` | ¥30 / $4.35 | ¥0.25 / $0.036 | ¥60 / $8.70 |  |
| [StepFun Step](https://platform.stepfun.com/docs/zh/guides/pricing/details) | `step-5-preview` | ¥7 | ¥0.35 | ¥20 | from 2026-10-14: ¥7 / ¥0.70 / ¥20 |
|  | `step-3.7-flash` | ¥1.35 | ¥0.27 | ¥8.10 |  |
|  | `step-3.5-flash` | ¥0.70 | ¥0.14 | ¥2.10 | also `step-3.5-flash-2603` |
| [Ant Group Ling](https://developer.ant-ling.com/zh-CN/docs/models/price/) | `ling-3.1-flash` | ¥0.50 | ¥0.10 | ¥1.50 |  |
|  | `ling-3.0-flash` | ¥0.14 | ¥0.028 | ¥0.42 |  |
|  | `ling-3.0-flash-vl` | ¥0.14 | ¥0.028 | ¥0.42 |  |
| [Meituan LongCat](https://longcat.chat/platform/docs/zh/pricing/longcat-2.5) | `longcat-2.5` | ¥2 / $0.30 | ¥0.04 / $0.006 | ¥8 / $1.20 |  |

</details>

## How it works

- The **Host half** registers the session projection `dshTokenBill`, which replays every billed model call in the session log: `assistant/message`, `assistant/attempt` (a failed attempt that was retried is billed too), and `compaction/summary`. Tokens are bucketed per provider + model, Beijing date, prompt-size band, and peak / off-peak hours: uncached input, cached input, cache writes, output (and the thinking tokens within it).
- Within one attempt the final message's usage replaces the streaming sample; after `llm/retry-started` the retry is billed separately — the same rule the built-in token meter follows.
- Peak / off-peak comes from each event's timestamp in Beijing time, so the fold is deterministic and replay-stable; holidays are applied when the view is built, so added holidays apply to past sessions too.
- Forked sessions: events inherited from the parent (below `inheritedEventCount`) are not billed again.
- The projection stores tokens only; the **view** applies the current prices and reports amounts grouped by each model's official currency (CNY / USD), so a price edit applies to every session at once.
- The **browser half** puts the badge and panel into the `conversation.composer.dock` slot (reading this session's projection, converted to your currency) and the per-conversation label into `sidebar.session.row.trailing` (reading the session list's summary rows). Subagent costs come from `subagentCatalog` and the session list.

## Known limitations

- It is an estimate from reported usage and a price table. Per-request services such as web search / fetch are not included, nor are auxiliary calls like session-title generation (those calls are not written to the session log).
- Subscription plans (vendors' Coding Plans, Token Plans, monthly passes) are not billed per token, but the plugin still estimates pay-as-you-go prices; set that provider's models to 0 under `models`.
- Not included: Gemini context-cache storage, OpenAI / Anthropic data-residency surcharges, cloud-platform price differences (Bedrock, Vertex), Batch discounts, and priority-tier surcharges.
- The sidebar shows costs only for sessions with summary data; a conversation from before the plugin was installed may need to be opened once.
- Subagent costs depend on the child sessions the sidebar has loaded; until then the amount carries a `+`.

## Development

```bash
git clone https://github.com/leecisen/dsh-token-bill.git
cd dsh-token-bill
node --test "test/*.test.js"
```

- `index.js`: Host entry, registers the projection.
- `lib/fold.js`: the projection fold (pure).
- `lib/pricing.js`: price tables, peak / off-peak hours, long-context bands, and the priced view (pure).
- `client.js`: the browser half, plain JS without a build step; it requires only DSH's shared `react`, `react-dom`, and `@deepseek-ai/dsh-client-ui-primitives`. The currency picker and exchange rates live here.
- `test/`: `node --test` unit tests, including a smoke test that renders the browser components under Node.

To try local changes, enter the repository folder's absolute path in DeepSeek Harness's **Add plugin**; restart DSH after editing.

## License

[MIT](LICENSE)
