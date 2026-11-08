# dsh-token-bill · 对话费用

[![npm](https://img.shields.io/npm/v/dsh-token-bill?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-token-bill)
[![license](https://img.shields.io/npm/l/dsh-token-bill)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-%E2%89%A5%200.2.2--rc.1-4d6bfe)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.en.md)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：估算**每个对话花了多少钱**。除了 DeepSeek，还内置了 Claude、GPT、Gemini、Grok 和国内 11 家厂商主流模型的官方价格，可以随时切换成美元、欧元、卢布等币种显示。

**安装**：DeepSeek Harness → **插件** → **添加插件**，输入 `dsh-token-bill`。（[详细说明](#安装)）

- **输入框下方**：上下文圆环左边显示本会话的估算费用，点一下展开明细。
- **侧边栏**：会话列表里，每个对话的时间旁边直接显示它的费用，不用点进去。
- **16 家厂商的官方价格**：DeepSeek；Anthropic Claude、OpenAI GPT、Google Gemini、xAI Grok；国内的月之暗面 Kimi、智谱 GLM、MiniMax、阿里通义千问、字节豆包、腾讯混元、百度文心、小米 MiMo、阶跃星辰、蚂蚁百灵、美团 LongCat，共 100 多个模型（[价格表](#内置价格)）。长上下文的阶梯价、官方已公布的调价日期，都按每次调用分别计算。没有内置的模型，在配置里补上价格即可。
- **切换币种**：明细面板右上角可以切换显示币种，默认提供人民币、美元、欧元、卢布、印度卢比、印尼盾、巴西雷亚尔、港币——按 DeepSeek 用户最多的地区选取。官方同时有人民币价和美元价的模型直接用对应的价目表，其余按当日汇率换算（[说明](#币种与汇率)）。
- **区分高峰 / 空闲时段**：DeepSeek 官方在北京时间工作日 9:00–12:00、14:00–18:00 收高峰价，其余时段（含周末、法定节假日全天）半价。插件按**每次调用发生的时间**分别计价，并显示「空闲时段节省」了多少。
- **算得更全**：上下文压缩（compaction）时的模型调用也计入（内置的 token 计量不含这部分）；子代理的费用单独列出并给出合计；从别的会话分叉出来的会话，不会重复计算继承来的部分。
- **改价立即生效**：会话里只记录 token 数，价格在显示时才套用，改了价格后所有历史会话都按新价格重算。
- 中英文界面，跟随浅色 / 深色主题；零依赖、无需构建。

> 费用由模型返回的 token 用量 × 价格表估算，仅供参考，以实际账单为准。

## 效果

| 明细面板（浅色） | 明细面板（深色） | 侧边栏 |
|---|---|---|
| <img src="docs/panel-light.png" width="362" alt="浅色主题下的费用明细面板"> | <img src="docs/panel-dark.png" width="362" alt="深色主题下的费用明细面板"> | <img src="docs/sidebar.png" width="300" alt="侧边栏会话列表里每个对话的费用"> |

<sub>以上为插件代码在 DSH 主题样式下的 2 倍分辨率预览渲染。示例数据：一次高峰时段对话 + 一次夜间（空闲）对话，其中各调用了一次 Claude Sonnet 5.5 和 GLM-5.3 + 一次上下文压缩 + 一个子代理。</sub>

面板里有什么：

| 行 | 含义 |
|---|---|
| 标题栏右侧的币种 | 点开切换显示币种，所有金额（包括侧边栏）一起换算；选择会记住。鼠标悬停可以看到汇率日期和来源。 |
| 输入 · 未命中缓存 / 命中缓存 / 输出 | 各类 token 数与对应费用；彩条是费用占比。有缓存写入时会多一行「缓存写入」。 |
| 缓存命中率 | 命中缓存的输入 ÷ 全部输入。 |
| 模型调用 | 计费的模型调用次数（失败后重试的那次也算）。 |
| 其中思考 | 输出里的思考（推理）tokens，已包含在「输出」中。 |
| 最近一轮 | 最近一轮对话的费用。 |
| 上下文压缩 | 压缩上下文时的模型调用费用。 |
| 空闲时段节省 | 和全部按高峰价相比省下的钱。 |
| 子代理 / 合计 | 本会话启动的子代理的费用，以及加上它们之后的合计。 |
| 按模型 | 每个模型的 token 与费用，按费用从高到低排列；没有价格的模型显示「未定价」。 |

- 金额后面的 `+` 表示有模型没有价格，这部分没有计入总额（在「按模型」里标为「未定价」）。
- 「子代理」「合计」只在本会话启动过子代理、并且侧边栏已加载它们的数据时出现。

## 安装

需要 DeepSeek Harness **0.2.2-rc.1 或更新版本**。

### 在插件页面安装（推荐）

DeepSeek Harness 侧边栏 → **插件** → **添加插件**，输入：

```text
dsh-token-bill
```

点 **安装**，装好后点 **立即启用**。插件发布在 [npm](https://www.npmjs.com/package/dsh-token-bill) 上，以后出了新版本，可以直接在插件页面一键更新。

习惯用命令行的话，可以执行 `dsh plugin add dsh-token-bill`，需要时加上 `--profile <你的 profile 名>`。

> 国内镜像（npmmirror）同步新版本可能要等一会儿。如果装不到最新版，把「添加插件」里的 **安装源** 切换成 **npm 官方源**。

### 其他安装方式

- **从 GitHub 安装**：在「添加插件」里填 `github:leecisen/dsh-token-bill`，装的是仓库里最新的代码。这种方式装的插件没法在插件页面一键更新，升级时要先卸载再重新安装。
- **离线安装**：在 [Releases](https://github.com/leecisen/dsh-token-bill/releases) 下载源码 ZIP，解压到一个固定的文件夹，然后在「添加插件」里填这个文件夹的**完整路径**（例如 `D:\dsh-plugins\dsh-token-bill`）。

### 从旧版本升级

- **2.0.x → 2.1**：在 **插件** 页面点更新即可。2.1 改了会话里记录用量的方式，更新后第一次打开会话时会重新统计一遍历史用量，会话很多时可能要等几秒。
- **v1（`@local/token-cost`）**：新版是一个独立的包（包名 `dsh-token-bill`，行 id `dsh-token-bill`），和旧版互不冲突。装好并启用新版后，在 **插件** 页面关闭或卸载旧的 `@local/token-cost` 即可。旧版的 `inputPrice` / `cacheHitPrice` / `outputPrice` 配置仍然有效，会用作"没有价格的模型的兜底价格"。
- **2.0.0（当时叫 `dsh-token-cost`）**：先在 **插件** 页面卸载，再按上面的方法安装。注意：npm 上叫 `dsh-token-cost` 的包是**别人的另一个插件**，不是本插件的旧版本。
- **用 `github:` 地址装过 2.0.1 的**：卸载后改成输入 `dsh-token-bill` 重新安装，以后就能一键更新了。

## 配置

不配置也能用：默认显示人民币、区分时段、在侧边栏显示费用、每天联网更新汇率。要修改时，在你的 profile 的 `cordis.patch.yml`（Windows 一般在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`）里加一段：

```yaml
- id: dsh-token-bill
  config:
    currency: CNY            # 默认显示的币种；也是 models 里自定义价格的默认币种
    currencies: [CNY, USD, EUR, RUB, INR, IDR, BRL, HKD]   # 面板里可以切换的币种
    exchangeRates: true      # 每天联网更新一次汇率；false = 只用内置汇率，不联网
    timeOfDayPricing: true   # 区分 DeepSeek 高峰/空闲时段；false = 全部按高峰价（保守上限）
    showInSessionList: true  # 在侧边栏会话列表显示费用
    holidays:                # 额外的法定节假日（北京时间日期），整天按空闲价
      - '2028-01-01'
    models:                  # 每百万 tokens 的价格
      my-model:              # 键可以是「模型 id」，也可以是「provider/模型 id」
        input: 0.8           # 输入（未命中缓存）
        cacheRead: 0.2       # 输入（命中缓存），默认等于 input（旧名 cacheHit 也能用）
        output: 2            # 输出
        currency: CNY        # 这组价格的币种，默认等于上面的 currency
        # cacheWrite: 1      # 缓存写入，默认等于 input
        # offPeak:           # 可选：空闲时段价格，缺的字段沿用上面的值
        #   output: 1
      deepseek-account/deepseek-v4-pro:   # 例：只覆盖某个 provider 下的同名模型
        input: 0
        cacheRead: 0
        output: 0
    fallback:                # 可选：所有没有价格的模型都按这个算；不填则显示「未定价」
      input: 2
      cacheRead: 0.5
      output: 8
```

注意：这里的 `config` 会**整体替换**插件自带的配置（DeepSeek Harness 不做合并），没写的字段使用下表中的默认值。

| 字段 | 默认值 | 说明 |
|---|---|---|
| `currency` | `CNY` | 默认显示的币种（三位字母代码）；在面板里选过别的币种后，以面板里的选择为准。也是自定义价格的默认币种。 |
| `currencies` | `CNY USD EUR RUB INR IDR BRL HKD` | 面板里可以切换的币种。可以换成任何三位字母代码，例如加上 `JPY`、`KRW`、`TWD`。 |
| `exchangeRates` | `true` | 是否联网获取每日汇率。 |
| `symbol` | 随币种（`¥`、`$`、`₽`…） | 显示 `currency` 时金额前的符号。 |
| `timeOfDayPricing` | `true` | 是否区分 DeepSeek 高峰 / 空闲时段。 |
| `showInSessionList` | `true` | 是否在侧边栏会话列表显示每个对话的费用。 |
| `holidays` | 内置 2026、2027 年放假日期 | 追加的节假日，格式 `YYYY-MM-DD`（北京时间）。 |
| `models` | 无 | 自定义 / 覆盖价格。查找顺序：`provider/模型` → `模型` → 内置价格 → `fallback`。 |
| `fallback` | 无 | 兜底价格。旧版的 `inputPrice` / `cacheHitPrice` / `outputPrice` 等同于它。 |

### 币种与汇率

- **为什么是这 8 种**：按 DeepSeek 用户最多的地区选取——网站访问量排在前面的中国、俄罗斯、美国、中国香港、巴西，以及月活用户较多的印度、印度尼西亚和欧洲（参考 [Second Talent](https://www.secondtalent.com/resources/deepseek-statistics/)、[Panto](https://www.getpanto.ai/blog/deepseek-ai-statistics)、[Statista](https://www.statista.com/statistics/1556986/deepseek-global-web-traffic-share-by-country) 汇总的第三方统计）。需要别的币种，用 `currencies` 加上即可。
- **怎么换算**：官方同时有人民币价和美元价的模型（DeepSeek、Kimi K3、智谱 GLM-5.x、MiniMax、小米 MiMo、美团 LongCat），显示人民币或美元时直接用对应的官方价目表；其余情况先按官方币种算出费用，再按汇率换算。
- **汇率从哪来**：只在确实需要换算时联网，依次尝试 [currency-api](https://github.com/fawazahmed0/exchange-api)（`latest.currency-api.pages.dev`，备用 jsDelivr）和 [ExchangeRate-API](https://www.exchangerate-api.com)（`open.er-api.com`）。12 小时内不重复请求，结果保存在本机浏览器存储里；请求里不带任何会话数据。联不上网时用内置的 2026-11-07 汇率。鼠标悬停在面板的币种上，可以看到当前汇率的日期和来源。
- 汇率用的是最新的每日汇率，历史会话也按当天的汇率换算，和银行、信用卡实际结算的汇率会有出入。

### 内置价格

来自各厂商官方价格页，**2026-11-08** 核对，单位：每百万 tokens。人民币价是中国大陆站的价格，美元价是国际站的价格。

- **长上下文**：按单次请求的提示长度（输入 + 缓存命中 + 缓存写入）选择阶梯价。
- **调价**：表里写了日期的，按调用发生当天（北京时间）选价，例如 Gemini 4 Argon 的促销价到 11 月 30 日为止。
- **缓存写入**：Anthropic、Kimi 按 5 分钟缓存的价格，OpenAI 按 30 分钟缓存的价格；没有单独列出的按输入价。
- **限时折扣**：没写结束日期的，按现在实际收的价格（通义千问 `qwen3.7-plus` 八折、蚂蚁百灵和美团 LongCat 的上线折扣）；MiniMax 是官方说的"永久五折"。OpenAI `gpt-5.6-sol` 的促销价到 11 月 30 日，之后的价格官方还没有公布。
- **模型名匹配**：不区分大小写；OpenRouter 这类网关的「厂商/模型」前缀、Bedrock 和 Vertex 的写法、末尾的日期版本号都会自动去掉；`claude-opus-4.5` 和 `claude-opus-4-5` 算同一个模型；OpenRouter 的 `:free` 免费模型计为 0。
- DeepSeek 高峰时段：北京时间周一至周五（不含法定节假日）9:00–12:00、14:00–18:00；其余时间均为空闲时段。内置了 2026、2027 年的放假安排（2027 年的安排由国务院办公厅于 2026-11-05 公布）。
- 通过 DeepSeek 账号（`deepseek-account`）使用时，按 API 价格估算，代表「等价 API 费用」；如果你的账号走的是额度/套餐，可以在 `models` 里用 `deepseek-account/<模型>` 把价格改成 0 或你的实际单价。
- 价格可能调整，以官方页面为准；发现过期欢迎提 issue / PR。

<details>
<summary><b>全部内置价格（点击展开）</b></summary>

| 厂商 | 模型 | 输入（未命中缓存） | 输入（命中缓存） | 输出 | 说明 |
|---|---|---|---|---|---|
| [DeepSeek](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) | `deepseek-flash` | ¥2 / $0.30 | ¥0.04 / $0.006 | ¥8 / $1.20 | 空闲时段半价；也匹配 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`、`deepseek-v4.1-flash` |
|  | `deepseek-v4-pro` | ¥9 / $1.32 | ¥0.30 / $0.044 | ¥27 / $3.96 | 空闲时段半价 |
| [Anthropic Claude](https://platform.claude.com/docs/en/about-claude/pricing) | `claude-fable-5-1` | $10 | $0.25 | $50 | 缓存写入 $12.50 |
|  | `claude-mythos-5-1` | $10 | $0.25 | $50 | 缓存写入 $12.50 |
|  | `claude-fable-5` | $10 | $1 | $50 | 缓存写入 $12.50 |
|  | `claude-mythos-5` | $10 | $1 | $50 | 缓存写入 $12.50 |
|  | `claude-opus-5-5` | $4 | $0.20 | $20 | 缓存写入 $5 |
|  | `claude-opus-5` | $5 | $0.50 | $25 | 缓存写入 $6.25 |
|  | `claude-opus-4-8` | $5 | $0.50 | $25 | 缓存写入 $6.25 |
|  | `claude-opus-4-7` | $5 | $0.50 | $25 | 缓存写入 $6.25 |
|  | `claude-opus-4-6` | $5 | $0.50 | $25 | 缓存写入 $6.25 |
|  | `claude-opus-4-5` | $5 | $0.50 | $25 | 缓存写入 $6.25 |
|  | `claude-sonnet-5-5` | $2 | $0.10 | $10 | 缓存写入 $2.50 |
|  | `claude-sonnet-5` | $2 | $0.20 | $10 | 缓存写入 $2.50 |
|  | `claude-sonnet-4-6` | $3 | $0.30 | $15 | 缓存写入 $3.75 |
|  | `claude-sonnet-4-5` | $3 | $0.30 | $15 | 缓存写入 $3.75 |
|  | `claude-haiku-5-5` | $0.10 | $0.01 | $0.50 | 提示 > 100k：$0.50 / $0.05 / $2.50；缓存写入 $0.125 |
|  | `claude-haiku-4-5` | $1 | $0.10 | $5 | 缓存写入 $1.25 |
| [OpenAI](https://developers.openai.com/api/docs/pricing) | `gpt-6-astra` | $10 | $1 | $50 | 提示 > 272k：$20 / $2 / $75；缓存写入 $12.50 |
|  | `gpt-6.1-sol` | $2 | $0.10 | $10 | 提示 > 272k：$4 / $0.20 / $15；缓存写入 $2.50 |
|  | `gpt-6.1-terra` | $1 | $0.05 | $5 | 提示 > 272k：$2 / $0.10 / $7.50；缓存写入 $1.25 |
|  | `gpt-6-sol` | $2 | $0.20 | $10 | 提示 > 272k：$4 / $0.40 / $15；缓存写入 $2.50 |
|  | `gpt-6-luna` | $0.10 | $0.01 | $0.50 | 提示 > 272k：$0.20 / $0.02 / $0.75；缓存写入 $0.125 |
|  | `gpt-5.6-sol` | $4 | $0.40 | $20 | 提示 > 272k：$8 / $0.80 / $30；缓存写入 $5 |
|  | `gpt-5.6-terra` | $2 | $0.20 | $12 | 提示 > 272k：$4 / $0.40 / $18；缓存写入 $2.50 |
|  | `gpt-5.6-luna` | $0.20 | $0.02 | $1.20 | 提示 > 272k：$0.40 / $0.04 / $1.80；缓存写入 $0.25 |
|  | `gpt-5.5` | $5 | $0.50 | $30 | 提示 > 272k：$10 / $1 / $45 |
|  | `gpt-5.5-pro` | $30 | $30 | $180 | 提示 > 272k：$60 / $60 / $270 |
|  | `gpt-5.4` | $2.50 | $0.25 | $15 | 提示 > 272k：$5 / $0.50 / $22.50 |
|  | `gpt-5.4-pro` | $30 | $30 | $180 | 提示 > 272k：$60 / $60 / $270 |
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
| [Google Gemini](https://ai.google.dev/gemini-api/docs/pricing) | `gemini-4-argon` | $2 | $0.10 | $10 | 2026-12-01 起：$4 / $0.20 / $20 |
|  | `gemini-3.8-flash` | $0.75 | $0.075 | $3.75 | 2027-01-01 起：$1.50 / $0.15 / $7.50 |
|  | `gemini-3.5-flash-lite` | $0.30 | $0.03 | $2.50 |  |
|  | `gemini-3.1-flash-lite` | $0.25 | $0.025 | $1.50 |  |
|  | `gemini-3.1-pro-preview` | $2 | $0.20 | $12 | 提示 > 200k：$4 / $0.40 / $18；也匹配 `gemini-3.1-pro-preview-customtools` |
|  | `gemini-3-flash-preview` | $0.50 | $0.05 | $3 |  |
|  | `gemini-2.5-pro` | $1.25 | $0.125 | $10 | 提示 > 200k：$2.50 / $0.25 / $15；2026-12-01 起：$0.75 / $0.075 / $3.75 |
|  | `gemini-2.5-flash` | $0.30 | $0.03 | $2.50 |  |
|  | `gemini-2.5-flash-lite` | $0.10 | $0.01 | $0.40 |  |
| [xAI Grok](https://docs.x.ai/docs/models) | `grok-4.7` | $2 | $0.50 | $6 | 提示 > 200k：$4 / $1 / $12 |
|  | `grok-4.6` | $2 | $0.50 | $6 | 提示 > 200k：$4 / $1 / $12 |
|  | `grok-4.5` | $2 | $0.30 | $6 | 提示 > 200k：$4 / $0.60 / $12 |
|  | `grok-4.3` | $1.25 | $0.20 | $2.50 | 提示 > 200k：$2.50 / $0.40 / $5 |
|  | `grok-4.20-0309-reasoning` | $1.25 | $0.20 | $2.50 | 提示 > 200k：$2.50 / $0.40 / $5 |
|  | `grok-4.20-0309-non-reasoning` | $1.25 | $0.20 | $2.50 | 提示 > 200k：$2.50 / $0.40 / $5 |
|  | `grok-4.20-multi-agent-0309` | $1.25 | $0.20 | $2.50 | 提示 > 200k：$2.50 / $0.40 / $5 |
|  | `grok-build-0.1` | $1 | $0.20 | $2 | 提示 > 200k：$2 / $0.40 / $4 |
| [月之暗面 Kimi](https://platform.kimi.com/docs/pricing/chat) | `kimi-k3.1-pro` | ¥13 | ¥1.30 | ¥68 |  |
|  | `kimi-k3.1-pro-highspeed` | ¥26 | ¥1.30 | ¥136 |  |
|  | `kimi-k3` | ¥20 / $3 | ¥2 / $0.30 | ¥100 / $15 |  |
|  | `kimi-k2.7-code` | ¥6.50 | ¥1.30 | ¥27 |  |
|  | `kimi-k2.7-code-highspeed` | ¥13 | ¥2.60 | ¥54 |  |
|  | `kimi-k2.6` | ¥6.50 | ¥1.10 | ¥27 |  |
| [智谱 GLM](https://bigmodel.cn/pricing) | `glm-5.3` | ¥8 / $1.40 | ¥2 / $0.26 | ¥28 / $4.40 |  |
|  | `glm-5.3-flash` | ¥0.80 / $0.15 | ¥0.23 / $0.03 | ¥2.80 / $0.50 |  |
|  | `glm-5.3-flashx` | ¥2 / $0.37 | ¥0.57 / $0.075 | ¥7 / $1.25 |  |
|  | `glm-5.2` | ¥8 / $1.40 | ¥2 / $0.26 | ¥28 / $4.40 |  |
|  | `glm-5.1` | ¥6 / $1.40 | ¥1.30 / $0.26 | ¥24 / $4.40 | 提示 > 32k：¥8 / ¥2 / ¥28 |
|  | `glm-5` | $1 | $0.20 | $3.20 |  |
|  | `glm-4.7` | $0.60 | $0.11 | $2.20 |  |
|  | `glm-4.6` | $0.60 | $0.11 | $2.20 |  |
|  | `glm-4.5` | $0.60 | $0.11 | $2.20 |  |
|  | `glm-4.5-air` | $0.20 | $0.03 | $1.10 |  |
|  | `glm-4.7-flash` | 免费 | 免费 | 免费 |  |
|  | `glm-4.5-flash` | 免费 | 免费 | 免费 |  |
| [MiniMax](https://platform.minimaxi.com/docs/guides/pricing) | `minimax-m3` | ¥2.10 / $0.30 | ¥0.42 / $0.06 | ¥8.40 / $1.20 | 提示 > 512k：¥4.20 / ¥0.84 / ¥16.80（$0.60 / $0.12 / $2.40） |
|  | `minimax-m3.1-flash` | ¥1 / $0.15 | ¥0.10 / $0.015 | ¥4 / $0.60 |  |
| [阿里 通义千问](https://help.aliyun.com/zh/model-studio/model-pricing) | `qwen3.8-max` | ¥12 | ¥2.40 | ¥36 |  |
|  | `qwen3.7-max` | ¥12 | ¥2.40 | ¥36 |  |
|  | `qwen3.7-plus` | ¥1.60 | ¥0.32 | ¥6.40 | 提示 > 256k：¥4.80 / ¥0.96 / ¥19.20 |
|  | `qwen3.6-plus` | ¥2 | ¥0.40 | ¥12 | 提示 > 256k：¥8 / ¥1.60 / ¥48 |
|  | `qwen3.8-flash` | ¥0.80 | ¥0.16 | ¥2.70 |  |
|  | `qwen3.6-flash` | ¥1.20 | ¥0.24 | ¥7.20 | 提示 > 256k：¥4.80 / ¥0.96 / ¥28.80 |
|  | `qwen-max` | ¥2.40 | ¥0.48 | ¥9.60 |  |
|  | `qwen-flash` | ¥0.15 | ¥0.03 | ¥1.50 | 提示 > 128k：¥0.60 / ¥0.12 / ¥6；提示 > 256k：¥1.20 / ¥0.24 / ¥12 |
| [字节 豆包](https://www.volcengine.com/docs/82379/1544106) | `doubao-seed-2.1-pro` | ¥6 | ¥1.20 | ¥30 |  |
|  | `doubao-seed-2.1-turbo` | ¥3 | ¥0.60 | ¥15 |  |
|  | `doubao-seed-2.1-lite` | ¥0.80 | ¥0.16 | ¥2.70 |  |
|  | `doubao-seed-evolving` | ¥6 | ¥1.20 | ¥30 |  |
|  | `doubao-seed-2.0-pro` | ¥3.20 | ¥0.64 | ¥16 | 提示 > 32k：¥4.80 / ¥0.96 / ¥24；提示 > 128k：¥9.60 / ¥1.92 / ¥48 |
|  | `doubao-seed-2.0-code` | ¥3.20 | ¥0.64 | ¥16 | 提示 > 32k：¥4.80 / ¥0.96 / ¥24；提示 > 128k：¥9.60 / ¥1.92 / ¥48 |
|  | `doubao-seed-2.0-lite` | ¥0.60 | ¥0.12 | ¥3.60 | 提示 > 32k：¥0.90 / ¥0.18 / ¥5.40；提示 > 128k：¥1.80 / ¥0.36 / ¥10.80 |
|  | `doubao-seed-2.0-mini` | ¥0.20 | ¥0.04 | ¥2 | 提示 > 32k：¥0.40 / ¥0.08 / ¥4；提示 > 128k：¥0.80 / ¥0.16 / ¥8 |
| [腾讯 混元](https://cloud.tencent.com/product/tokenhub) | `hy4` | ¥6 | ¥0.30 | ¥18 |  |
|  | `hy3` | ¥1 | ¥0.25 | ¥4 |  |
| [百度 文心](https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya) | `ernie-5.1` | ¥4 | ¥4 | ¥18 | 提示 > 32k：¥6 / ¥6 / ¥22 |
| [小米 MiMo](https://platform.xiaomimimo.com/docs/pricing) | `mimo-v2.6-pro` | ¥3 / $0.435 | ¥0.025 / $0.0036 | ¥6 / $0.87 |  |
|  | `mimo-v2.6-flash` | ¥1 / $0.14 | ¥0.02 / $0.0028 | ¥2 / $0.28 |  |
|  | `mimo-v2.6-pro-ultraspeed` | ¥30 / $4.35 | ¥0.25 / $0.036 | ¥60 / $8.70 |  |
| [阶跃星辰 Step](https://platform.stepfun.com/docs/zh/guides/pricing/details) | `step-5-preview` | ¥7 | ¥0.35 | ¥20 | 2026-10-14 起：¥7 / ¥0.70 / ¥20 |
|  | `step-3.7-flash` | ¥1.35 | ¥0.27 | ¥8.10 |  |
|  | `step-3.5-flash` | ¥0.70 | ¥0.14 | ¥2.10 | 也匹配 `step-3.5-flash-2603` |
| [蚂蚁 百灵 Ling](https://developer.ant-ling.com/zh-CN/docs/models/price/) | `ling-3.1-flash` | ¥0.50 | ¥0.10 | ¥1.50 |  |
|  | `ling-3.0-flash` | ¥0.14 | ¥0.028 | ¥0.42 |  |
|  | `ling-3.0-flash-vl` | ¥0.14 | ¥0.028 | ¥0.42 |  |
| [美团 LongCat](https://longcat.chat/platform/docs/zh/pricing/longcat-2.5) | `longcat-2.5` | ¥2 / $0.30 | ¥0.04 / $0.006 | ¥8 / $1.20 |  |

</details>

## 计算方式

- **Host 端**注册一个会话投影 `dshTokenBill`，重放会话日志里每一次计费的模型调用：`assistant/message`、`assistant/attempt`（失败后重试的那次也计费）和 `compaction/summary`。按「provider + 模型」、调用当天的北京日期、提示长度档位和「高峰 / 空闲」分桶累计 token：未命中缓存的输入、命中缓存的输入、缓存写入、输出（以及其中的思考 tokens）。
- 同一次尝试里，流式过程中的用量会被最终消息的用量替换；遇到 `llm/retry-started` 后，重试那次单独计费——与内置 token 计量的规则一致。
- 高峰 / 空闲按**事件发生时间**（北京时间）判断，结果可重放、确定；节假日在显示时才套用，所以追加的节假日对历史会话也生效。
- 分叉会话：从父会话继承的那部分事件（`inheritedEventCount` 之前）不计费。
- 投影里只存 token；**视图**才按当前价格计价，按模型的官方币种（人民币 / 美元）分组给出金额，所以改价立即对所有会话生效。
- **浏览器端**：`conversation.composer.dock` 插槽里的徽标和明细面板读取本会话的投影，按你选的币种换算；`sidebar.session.row.trailing` 插槽从会话列表的摘要数据里读取每个会话的费用。子代理的费用来自 `subagentCatalog` 和会话列表。

## 已知限制

- 估算值：基于模型返回的用量和价格表，不含联网搜索 / 抓取等按次收费的服务，也不含会话标题生成等辅助调用（这些调用没有写入会话日志）。
- 订阅制的套餐（各家的 Coding Plan、Token Plan、包月卡等）不按量扣费，插件仍按按量价格估算；可以用 `models` 把对应 provider 的模型价格设成 0。
- 不含：Gemini 的缓存存储费、OpenAI / Anthropic 的数据驻留（指定地区）加价、Bedrock / Vertex 等云平台的价差、批量（Batch）折扣、优先级服务的加价。
- 侧边栏只显示已经有摘要数据的会话：安装插件前的老会话，可能要打开一次才会显示费用。
- 子代理费用依赖会话列表里已加载的子会话数据，没加载到时金额后会带 `+`。

## 开发

```bash
git clone https://github.com/leecisen/dsh-token-bill.git
cd dsh-token-bill
node --test "test/*.test.js"
```

- `index.js`：Host 入口，注册投影。
- `lib/fold.js`：投影的折叠逻辑（纯函数）。
- `lib/pricing.js`：价格表、高峰 / 空闲判断、长上下文档位、计价视图（纯函数）。
- `client.js`：浏览器端（纯 JS，无需构建），只依赖 DSH 共享的 `react`、`react-dom` 和 `@deepseek-ai/dsh-client-ui-primitives`；币种选择和汇率也在这里。
- `test/`：`node --test` 单元测试，包括在 Node 里渲染浏览器端组件的冒烟测试。

本地调试：在 DeepSeek Harness 的「添加插件」里填仓库文件夹的绝对路径来安装；改完代码后重启 DSH 生效。

## 许可证

[MIT](LICENSE)
