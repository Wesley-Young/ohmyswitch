# Pi 配置契约

依据 Pi 1.3.0 的源码（`@earendil-works/pi-coding-agent` 的 `core/model-config.js`、`core/provider-composer.js`、`core/resolve-config-value.ts`，`@earendil-works/pi-ai` 的 `api/*.js`、`models.js`）整理。Pi 升级后需要重新核对标了「版本相关」的条目。

## 读写的文件

| 文件 | 读 | 写 | 说明 |
|---|---|---|---|
| `<agentDir>/models.json` | 是 | 是 | 唯一写入的文件 |
| `<agentDir>/auth.json` | 否 | 否 | 登录凭据，不读不写 |
| `<agentDir>/settings.json` | 否 | 否 | 默认供应商、默认模型、启用的模型都在这里，ohmyswitch 不写默认值 |

`<agentDir>` 是 `PI_CODING_AGENT_DIR`（支持绝对路径和 `~/`），未设置时为 `~/.pi/agent`。见 `src/core/harness-pi/descriptor.ts`。

## models.json 的格式

- JSONC：Pi 先去掉 BOM 和注释再 `JSON.parse`。写入时必须保留注释和其他内容。
- 顶层：`{ "$schema"?: string, "providers": Record<string, Provider> }`。
- 用 TypeBox 校验，**任何一处不合法，Pi 会丢弃整个文件里的全部自定义供应商**。所以写出的内容必须合法；现有文件无法解析时不写入。
- 文件不存在时 Pi 视为没有自定义供应商。
- Pi 在打开 `/model` 时重新读取文件，不需要重启。

## ohmyswitch 负责的条目

每个应用到 Pi 的 ohmyswitch 供应商对应 `providers` 下的一个键（下称 key）。key 记录在 `store.json` 中，供应商改名后 key 不变。ohmyswitch 只改自己记录的 key，其他供应商、`$schema`、注释原样保留。

### key 的限制

- key 与 Pi 内置供应商同名时，Pi 会把条目**合并进内置供应商**：`baseUrl` 覆盖内置模型的地址，`models` 与内置模型合并。所以 key 不能使用内置供应商的 id（版本相关，Pi 1.3.0）：
  `amazon-bedrock ant-ling anthropic azure baseten cerebras cloudflare-ai-gateway cloudflare-workers-ai deepseek fireworks github-copilot google google-vertex groq huggingface kimi-coding meta minimax minimax-cn mistral moonshotai moonshotai-cn nvidia openai openai-codex opencode opencode-go openrouter qwen-token-plan qwen-token-plan-cn qwen-token-plan-individual radius together typesafe vercel-ai-gateway xai xiaomi xiaomi-token-plan-ams xiaomi-token-plan-cn xiaomi-token-plan-sgp zai zai-coding-cn`
- 扩展注册的供应商无法预知，不做检查。
- `auth.json` 中同一 id 下存有凭据时，Pi 优先使用凭据而不是 `models.json` 的 `apiKey`。ohmyswitch 不读 `auth.json`，无法检测，只在文档和排错提示中说明。

### 供应商字段

| 字段 | 写入的值 |
|---|---|
| `name` | ohmyswitch 供应商名称 |
| `api` | 由端点决定，见下表 |
| `baseUrl` | 由端点决定，见下表 |
| `apiKey` | 转义后的 API Key，见下文 |
| `models` | 见下文 |

provider 级的其他字段（`headers`、`compat`、`authHeader`、`modelOverrides`、`oauth`）ohmyswitch 不写，用户手动加的保留。

| ohmyswitch 端点 | `api` | `baseUrl` | 依据 |
|---|---|---|---|
| `/v1/chat/completions` | `openai-completions` | `<Base URL>/v1` | OpenAI SDK 在 baseURL 后拼 `/chat/completions`；内置 openai 为 `https://api.openai.com/v1` |
| `/v1/responses` | `openai-responses` | `<Base URL>/v1` | 同上 |
| `/v1/messages` | `anthropic-messages` | `<Base URL>` | Anthropic SDK 自己拼 `/v1/messages`；内置 anthropic 为 `https://api.anthropic.com` |
| `/v1beta/generateContent` | `google-generative-ai` | `<Base URL>/v1beta` | Pi 设置 `apiVersion: ""`，认为 baseUrl 已含版本；内置 google 为 `.../v1beta` |

### apiKey 的转义

Pi 把 `apiKey` 当作模板解析：以 `!` 开头表示执行 shell 命令；`$NAME`、`${NAME}` 读取环境变量；`$$` 和 `$!` 分别表示字面的 `$` 和 `!`。写入字面 Key 时：

1. 把每个 `$` 替换为 `$$`；
2. 结果以 `!` 开头时，在前面加 `$`（得到 `$!`）。

不转义的话，含 `$` 的 Key 会被当成环境变量引用，以 `!` 开头的 Key 会被当成命令执行。

### 模型字段

`models` 按 ohmyswitch 的模型列表生成，按 `id` 对应：ohmyswitch 删除的模型从数组中删除，新增的追加。每个模型中 ohmyswitch 负责下表的字段，其他字段（`samplingParams`、`promptCache`、`inputLimits`、`headers`、`cost` 等）用户手动加的保留。

| Pi 字段 | 来源 | 未知时 |
|---|---|---|
| `id` | `id` | — |
| `name` | `name` | 不写（Pi 用 id） |
| `reasoning` | `reasoning` | 不写（Pi 视为 false） |
| `thinkingLevelMap` | `reasoningOptions`，见下文 | 不写 |
| `input` | `input` 中的 `text`、`image`（Pi 不支持 `pdf`） | 不写（Pi 视为仅 text） |
| `contextWindow` | `contextWindow` | 不写（Pi 默认 128000） |
| `maxTokens` | `maxOutput` | 不写（Pi 默认 16384） |
| `compat.forceAdaptiveThinking` | `anthropic-messages` 且有 `effort` 选项时为 `true` | 不写 |
| `compat.requiresReasoningContentOnAssistantMessages` | `openai-completions` 且 `interleaved.field` 为 `reasoning_content` 时为 `true` | 不写 |

- `toolCall` 没有对应字段，不写。
- `cost` 不写（不保存价格），Pi 按 0 计费。

### 推理等级（thinkingLevelMap）

Pi 的档位是 `off minimal low medium high xhigh max`。`reasoning: true` 时，Pi 默认提供 `off` 到 `high`；`xhigh`、`max` 只有在 map 中给出字符串值时才提供；值为 `null` 的档位不提供。各协议把档位名（或 map 中的值）作为原生 effort 发送；Anthropic 只有在 `compat.forceAdaptiveThinking` 为 `true` 时才使用 effort，否则按 token 预算。

由 `reasoningOptions` 生成 map（E 为 `effort` 的取值）：

| 情况 | map |
|---|---|
| `reasoningOptions` 未知 | 不写，使用 Pi 默认 |
| 有 `effort` | `minimal` 到 `max`：在 E 中则映射为同名值（`minimal`–`high` 与默认相同，可省略），不在则为 `null`。`off`：E 含 `none` 时为 `"none"`；否则有 `toggle` 时不写（Pi 自行关闭推理）；都没有时为 `null` |
| 只有 `toggle` | `minimal`、`low`、`medium` 为 `null`，只保留 `off` 和 `high` |
| 只有 `budget_tokens` | 不写，使用 Pi 的预算档位 |
| 空数组（不可调） | 除 `high` 外全部为 `null` |

E 中 Pi 没有的值（如 `default`）忽略。

## ohmyswitch 侧的记录

- 首次应用时，key 由供应商名称生成：转为小写，非字母数字的部分换成 `-`，去掉首尾的 `-`；为空时用 `provider`。与内置供应商 id 或其他 ohmyswitch 供应商的 key 重复时加 `-2`、`-3` 后缀。
- 文件中已有同名、但不是 ohmyswitch 写入的条目时，需要用户确认接管；接管后按上文规则合并（保留用户的其他字段）。
- key 记录在 `store.json` 中该供应商的 `harnesses.pi.key`。
- 保存供应商后，自动重写所有已应用的 Harness；失败不回滚保存，逐个提示。
- 删除供应商前，先从已应用的 Harness 中移除；移除失败则不删除。
- 状态：重新生成条目并与文件中的条目比较（忽略键顺序）。相同为「已应用」，不同为「已被修改」，key 不存在为「已被移除」，文件无法解析为「无法读取」。

## 写入流程

1. 读取 `models.json`（不存在视为空），解析 JSONC；解析失败或 `providers` 不是对象时停止并报错。
2. 生成 ohmyswitch 负责的条目，用与 Pi 一致的规则校验。
3. 在原文上只修改该 key 的子树（保留注释和格式）。
4. 写入前重新读取文件，与第 1 步的内容比对；不同则停止，提示重新读取。
5. 原子写入。保留原文件权限；新建的文件使用 `0600`（含 API Key）。新文件包含 `"$schema": "https://pi.dev/schemas/models.schema.json"`。

取消应用时删除该 key 的整个条目（包括用户在条目内手动加的字段，需确认）。

- 顺序：ohmyswitch 的条目按供应商列表的顺序排列，只在它们已经占据的位置之间调换；用户自己的条目、条目之间的逗号和空白都不动。条目上方单独成行的注释跟着条目移动，写在上一个条目同一行末尾的注释留在原处。写入条目时在同一次编辑中排好顺序（第一次应用的新条目直接排到它的位置）；调整供应商顺序后，单独重排一次。Pi 1.3.0 的模型选择器按 provider key 的字母顺序排列（`modes/interactive/components/model-selector.js` 的 `sortModels`），所以这个顺序在 Pi 的界面上看不出来（版本相关）。

## 已知限制

- `openai-completions` 的推理参数格式（`compat.thinkingFormat`）由 Pi 按 provider id 和域名自动判断。经中转站访问 DeepSeek、GLM、Qwen 等时判断不出来，会按 OpenAI 格式发送 `reasoning_effort`。models.dev 没有对应数据，暂不处理。
- 内置供应商 id 列表随 Pi 版本变化。
