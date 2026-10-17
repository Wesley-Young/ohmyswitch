# OpenCode 配置契约

依据 OpenCode v2.0.27 的源码（tag `v2.0.27`，commit `1f4d07a`）整理：`packages/core/src/config.ts`、`config/discovery.ts`、`config/normalize.ts`、`config/variable.ts`、`config/plugin/provider.ts`、`model-resolver.ts`、`variant.ts`、`models-dev.ts`，`packages/schema/src/config/provider.ts`、`model.ts`，`packages/ai/src/providers/*`、`protocols/*`。只适配 V2 的配置格式（顶层 `providers`），不写 V1 的 `provider`。OpenCode 升级后需要重新核对标了「版本相关」的条目。

## 读写的文件

| 文件 | 读 | 写 | 说明 |
|---|---|---|---|
| `<configDir>/opencode.jsonc` 或 `<configDir>/opencode.json` | 是 | 是 | 全局配置；两个都存在时写 `opencode.jsonc` |
| 项目目录中的 `opencode.json(c)`、`.opencode/` | 否 | 否 | 项目级配置不碰 |
| OpenCode 数据目录（`~/.local/share/opencode`，含凭据数据库） | 否 | 否 | 登录凭据不读不写 |

- `<configDir>` 是 `$XDG_CONFIG_HOME/opencode`，未设置时为 `~/.config/opencode`（所有平台相同）。见 `src/core/harness-opencode/descriptor.ts`。
- OpenCode 两个全局文件都会读取，`opencode.jsonc` 优先级更高。OpenCode 自己更新全局配置时，写入两者中最后一个存在的（即 `opencode.jsonc` 优先），都不存在时新建 `opencode.jsonc`。ohmyswitch 用同样的规则选文件。
- 默认模型（`model`）等其他设置不写。
- 已应用后用户又新建了 `opencode.jsonc` 时，ohmyswitch 改为以它为准，原来写在 `opencode.json` 里的条目显示为「已被移除」；重新写入会写到 `opencode.jsonc`，旧条目留在 `opencode.json` 中（OpenCode 以 `opencode.jsonc` 的为准）。

## 文件格式

- JSONC（允许注释和尾逗号）。写入时保留注释和其他内容。
- 整个文件无法解析时，OpenCode 忽略整个文件；单个 `providers` 条目不合法时，只忽略该条目。ohmyswitch 不写无法解析的文件。
- **变量替换**：OpenCode 在解析前对原文做文本替换，`{env:NAME}` 替换为环境变量，`{file:path}` 替换为文件内容。没有转义写法，所以写入的值（名称、地址、API Key、模型 id）含 `{env:` 或 `{file:` 时拒绝写入。
- OpenCode 监听配置文件，修改后自动重新加载。
- 新建的文件内容为 `{ "providers": {} }`，不写 `$schema`（V2 没有对应的配置 schema 地址），权限 `0600`（含 API Key）。

## ohmyswitch 负责的条目

每个应用到 OpenCode 的 ohmyswitch 供应商对应 `providers` 下的一个键（下称 key）。key 就是 OpenCode 中的 provider ID，模型以 `<key>/<模型 id>` 引用。ohmyswitch 只改自己记录的 key。

### key 的限制

- key 与内置供应商同名时，OpenCode 会把条目合并进内置供应商（继承其模型和设置）。内置供应商来自 models.dev 目录（OpenCode 运行时会更新目录），以及插件注册的供应商。所以 key 不能使用：
  - ohmyswitch 缓存的 models.dev 目录中的所有供应商 id；目录不可用时，不分配新 key（已有的 key 不受影响）。
  - 插件注册的供应商 id（版本相关）：`amazon-bedrock azure cerebras chatgpt cloudflare-ai-gateway cloudflare-workers-ai cohere databricks digitalocean github-copilot gitlab google-vertex kilo llmgateway lmstudio modal neon nvidia ollama openai opencode openrouter perplexity poe sap-ai-core snowflake-cortex vercel vllm xai zenmux`
- V1 的 `provider` 与 V2 的 `providers` 同名时，OpenCode 以 V2 为准并报告冲突。所以 V1 `provider` 中已有的 key 也视为已占用。
- OpenCode 中为同一 provider ID 存有凭据时，凭据优先于配置中的 `settings.apiKey`。ohmyswitch 不读凭据数据库，无法检测，只在文档和排错提示中说明。

### 供应商字段

| 字段 | 写入的值 |
|---|---|
| `name` | ohmyswitch 供应商名称 |
| `package` | 由端点决定，见下表 |
| `settings.baseURL` | 由端点决定，见下表 |
| `settings.apiKey` | API Key（原样） |
| `models` | 见下文 |

`settings` 中的其他键、`headers`、`body`、`env`、`canonical` 由用户管理，原样保留。

| ohmyswitch 端点 | `package` | `settings.baseURL` |
|---|---|---|
| `/v1/chat/completions` | `@opencode/ai/providers/openai-compatible` | `<Base URL>/v1` |
| `/v1/responses` | `@opencode/ai/providers/openai-compatible/responses` | `<Base URL>/v1` |
| `/v1/messages` | `@opencode/ai/providers/anthropic-compatible` | `<Base URL>/v1` |
| `/v1beta/generateContent` | `@opencode/ai/providers/google` | `<Base URL>/v1beta` |

依据：这些协议只在 `baseURL` 后拼接最后一段（`/chat/completions`、`/responses`、`/messages`、`/models/<id>:streamGenerateContent`），各自默认的 baseURL 分别为 `https://api.openai.com/v1`、`https://api.anthropic.com/v1`、`https://generativelanguage.googleapis.com/v1beta`。注意与 Pi 不同，Anthropic 也要带 `/v1`。鉴权方式由 package 决定（Bearer、`x-api-key`、`x-goog-api-key`）。

### 模型字段

`models` 是以模型 id 为键的对象，按 ohmyswitch 的模型列表生成：ohmyswitch 删除的模型从中删除，新增的加入。每个模型中 ohmyswitch 负责下表的字段；其他字段（`settings`、`headers`、`body`、`cost`、`disabled`、`family`、`modelID`、`package`、`capabilities.output`、`limit.input`、`compatibility` 中的其他键）用户手动加的保留。

| OpenCode 字段 | 来源 | 未知时 |
|---|---|---|
| `name` | `name` | 不写（OpenCode 用 id） |
| `capabilities.tools` | `toolCall` | 不写（OpenCode 默认 `true`） |
| `capabilities.input` | `input` | 不写（OpenCode 默认 `text`、`image`） |
| `limit.context` | `contextWindow` | 不写（OpenCode 默认 200000） |
| `limit.output` | `maxOutput` | 不写（OpenCode 默认 32000） |
| `compatibility.reasoningField` | `interleaved.field` | 不写 |
| `variants` | `reasoning`、`reasoningOptions`，见下文 | 见下文 |

`cost` 不写（不保存价格）。`interleaved` 为 `true` 时没有对应字段，与 OpenCode 自己处理 models.dev 数据的方式一致。

### 推理等级（variants）

OpenCode 用 variants 表示推理档位，每个 variant 是 `{ id, settings?, headers?, body? }`。配置中的模型写了 `variants` 时，OpenCode 不再自动生成；不写时，只对部分 package 用默认等级自动生成，且不考虑模型实际支持的等级（`openai-compatible/responses` 和 `anthropic-compatible` 完全不生成）。所以由 ohmyswitch 生成：

| 情况 | variants |
|---|---|
| `reasoning` 为 `false` | `[]`（避免 OpenCode 为不推理的模型生成档位） |
| `reasoning` 未知，或为 `true` 但 `reasoningOptions` 未知 | 不写，使用 OpenCode 的默认行为 |
| `reasoningOptions` 已知 | 按 OpenCode 的 `Variant.resolve` 规则生成（`[]` 表示不可调） |

生成规则与 OpenCode 处理 models.dev `reasoning_options` 的方式相同（`variant.ts`，版本相关）：有 `toggle` 时先加入其中 id 为 `none` 的项；主体按 `effort`、`budget_tokens`、`toggle` 的优先级取第一种；按 id 去重。各 package 的写法：

- **Chat Completions**：`effort` 的每个值 → `{ settings: { reasoningEffort } }`；`toggle`、`budget_tokens` 不生成。
- **Responses**：`effort` 的每个值 → `{ settings: { reasoningEffort, reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } }`；其他不生成。
- **Anthropic Messages**：
  - `effort`：值 `none` → `{ settings: { thinking: { type: "disabled" } } }`；其他值 → `{ settings: { thinking: { type: "adaptive", display: "summarized" }, effort } }`。Claude 3.7 和 4.0–4.5（Opus 4.5 除外）改按 `budget_tokens`（min 1024）处理；Opus 4.5 用固定预算 `{ type: "enabled", budgetTokens: min(16000, 输出上限 - 1) }`；Fable、Mythos 去掉 `none`。
  - `toggle`：`none` → 关闭；`thinking` → 自适应（上述旧模型用固定预算）。Fable、Mythos 不生成。
  - `budget_tokens`：`high`、`max` 两档，`{ settings: { thinking: { type: "enabled", budgetTokens } } }`，上限 32000。
- **Google**：
  - `effort` → `{ settings: { thinkingConfig: { includeThoughts: true, thinkingLevel } } }`；
  - `toggle` → `none`：`{ includeThoughts: false, thinkingBudget: 0 }`，`thinking`：`{ includeThoughts: true, thinkingBudget: -1 }`；
  - `budget_tokens` → `high`、`max`：`{ includeThoughts: true, thinkingBudget }`。

预算档位：`max` = min(`max` 或 上限-1, 输出上限-1)，`high` = min(max(`min`, ⌊(max+1)/2⌋), max)；输出上限未知时按 32000。

## ohmyswitch 侧的记录

与 Pi 相同（见 `docs/harness/pi.md`）：key 由名称生成并记录在 `store.json` 的 `harnesses.opencode.key`；已有同名但不是 ohmyswitch 写入的条目需要确认接管；保存时自动更新，删除前先移除；状态按重新生成的条目与文件比较。

## 写入流程

1. 选文件（见上），读取（不存在视为空），解析 JSONC；解析失败，或 `providers` 存在但不是对象时停止并报错。
2. 生成条目；含 `{env:`、`{file:` 的值拒绝写入。
3. 在原文上只修改 `providers.<key>` 子树（保留注释和格式）。
4. 写入前重新读取文件比对，不同则停止。
5. 原子写入，保留原文件权限；新建文件用 `0600`。

取消应用时删除 `providers.<key>` 整个条目。
