# omp 配置契约

依据 omp（oh-my-pi）18.12.1 的源码（tag `v18.12.1`，commit `291e055`）整理：`packages/coding-agent/src/config/models-config.ts`、`models-config-schema-bundle.ts`、`config-file.ts`、`custom-models.ts`、`resolve-config-value.ts`、`model-registry.ts`，`packages/utils/src/dirs.ts`，`packages/catalog/src/compat/provider-ids.ts`、`models.json`、`compat/resolve.ts`，`packages/ai/src/providers/*`。omp 升级后需要重新核对标了「版本相关」的条目。

## 读写的文件

| 文件 | 读 | 写 | 说明 |
|---|---|---|---|
| `<agentDir>/models.yml`（或 `models.yaml`） | 是 | 是 | 每个 profile 一份，写入 `providers` |
| `<agentDir>/models.json` | 是（只看是否存在） | 否 | 旧格式，omp 启动时迁移为 `models.yml` |
| `<agentDir>/config.yml`、`agent.db`、`models.db` 等 | 否 | 否 | 设置、登录凭据和缓存不碰 |

- 配置根目录是 `~/<PI_CONFIG_DIR>`（未设置时为 `~/.omp`；omp 总是把它拼在 home 下）。默认 profile 的 agent 目录是 `<根目录>/agent`，`PI_CODING_AGENT_DIR` 是绝对路径时以它为准（omp 还接受相对路径，按启动目录解析，ohmyswitch 无法知道启动目录，忽略）。注意 Pi 也读这个变量。
- 命名 profile 的 agent 目录是 `<根目录>/profiles/<name>/agent`，`<name>` 符合 `^[a-z0-9][a-z0-9._-]{0,63}$` 且不以 `.` 结尾。omp 用 `OMP_PROFILE`、`PI_PROFILE` 选择 profile；ohmyswitch 写入默认 profile 和每个已有 agent 目录的命名 profile，与 DSH 的多个 profile 相同。见 `src/core/harness-omp/descriptor.ts`。
- 每个 agent 目录中，`models.yml` 存在时用它，否则 `models.yaml` 存在时用它，都不存在时新建 `models.yml`（与 omp 的 `ConfigFile` 相同）。
- 两个 YAML 文件都不存在而 `models.json` 存在时，omp 会在下次启动时把它迁移为 `models.yml`；此时 ohmyswitch 新建 `models.yml` 会让 `models.json` 永远不被迁移，所以停止并提示先启动一次 omp。
- omp 自己只在迁移时写这个文件，没有文件锁。
- 一个 agent 目录都没有时（从未启动过 omp），不能应用。

## models.yml 的格式

- YAML，顶层是对象，ohmyswitch 只读写 `providers`。写入时保留注释和其他内容；整个文件按 YAML 库的格式重新输出，其他条目里的行内集合会规范为 `[ a, b ]` 的写法，数据不变。
- omp 校验整个文件，**任何一处不合法，所有自定义供应商都不生效**（只剩内置的）。所以写出的内容必须合法；现有文件无法解析时不写入。
- 有模型的自定义供应商必须有非空的 `baseUrl`、非空的 `apiKey`（`auth` 为 `none`、`oauth` 时除外），以及 `api`；模型的 `id`、`name` 不能为空，`contextWindow`、`maxTokens` 必须为正数，`input` 只能是 `text`、`image`。
- omp 在查看模型时比较文件的修改时间，变了就重新读取，不需要重启。
- 新建的文件权限为 `0600`（含 API Key）。

## ohmyswitch 负责的条目

每个应用到 omp 的 ohmyswitch 供应商对应 `providers` 下的一个键（下称 key），key 就是 omp 中的 provider id，模型以 `<key>/<模型 id>` 引用。omp 的供应商没有显示名称字段，ohmyswitch 供应商的名称不写入。

### key 的限制

key 与 omp 认识的供应商 id 相同时，条目是对内置供应商的覆盖（改地址、Key 或补充模型），不是新的供应商。所以 key 不能使用（版本相关，omp 18.12.1，`KnownProvider`、内置模型目录和本地供应商的并集）：

`abliteration aiand aimlapi alibaba-coding-plan alibaba-token-plan amazon-bedrock anthropic apple azure baseten bedrock-mantle cerebras charm-hyper cline-pass cloudflare-ai-gateway cloudflare-workers-ai commandcode coralbricks coreweave cursor deepinfra deepseek devin factory-droid firepass fireworks github-copilot gitlab-duo gitlab-duo-agent gmi-cloud google google-antigravity google-gemini-cli google-vertex groq helmcode huggingface kilo kimi-code litellm llama.cpp lm-studio local meta minimax minimax-cn minimax-code minimax-code-cn mistral moonshot muse-code nanogpt novita nvidia ollama ollama-cloud openai openai-codex opencode-go opencode-zen openrouter qianfan qwen-portal sakana sambanova siliconflow siliconflow-cn singularityapi-dev singularityapi-tech snowflake stepfun synthetic together typesafe umans venice vercel-ai-gateway vllm wafer-serverless web xai xai-oauth xiaomi xiaomi-token-plan-ams xiaomi-token-plan-cn xiaomi-token-plan-sgp yolo-auto zai zenmux zhipu-coding-plan`

omp 从 models.dev 刷新的目录只补充已有供应商的模型，不会增加供应商，所以不需要像 OpenCode 那样保留整个 models.dev 目录。扩展注册的供应商无法预知，不做检查。

### 供应商字段

| 字段 | 写入的值 |
|---|---|
| `baseUrl` | 由端点决定，见下表 |
| `api` | 由端点决定，见下表 |
| `apiKey` | API Key（原样），见下文 |
| `auth` | `apiKey` |
| `models` | 见下文 |

provider 级的其他字段（`headers`、`authHeader`、`compat`、`discovery`、`modelOverrides`、`disableStrictTools` 等）ohmyswitch 不写，用户手动加的保留。

| ohmyswitch 端点 | `api` | `baseUrl` | 依据 |
|---|---|---|---|
| `/v1/chat/completions` | `openai-completions` | `<Base URL>/v1` | 请求 `<baseUrl>/chat/completions` |
| `/v1/responses` | `openai-responses` | `<Base URL>/v1` | 请求 `<baseUrl>/responses` |
| `/v1/messages` | `anthropic-messages` | `<Base URL>` | 请求 `<baseUrl>/v1/messages` |
| `/v1beta/generateContent` | `google-generative-ai` | `<Base URL>/v1beta` | `baseUrl` 已含版本段（默认 `https://generativelanguage.googleapis.com/v1beta`） |

- `auth` 不写时，`anthropic-messages` 的自定义供应商会按 Claude Code 的 OAuth 方式构造请求（`custom-models.ts` 的 `resolveCustomModelIsOAuth`）；写 `apiKey` 才是标准的 API Key 请求。其他协议写不写效果相同，统一写上。
- models.yml 的 `apiKey` 优先于 omp 中存储的登录凭据。

### apiKey

omp 解析 `apiKey` 的规则（`resolveConfigValue`）：以 `!` 开头时当作命令执行，取输出；否则先当作环境变量名，该变量存在且非空时用它的值，否则用字面值。没有转义写法，所以：

- 以 `!` 开头的 Key 不能写入，报错。
- 其他 Key 原样写入。Key 恰好是一个已设置的环境变量的名字时会被替换，实际的 Key 不会是这种形式，不做处理。

### 模型字段

`models` 按 ohmyswitch 的模型列表生成，按 `id` 对应：ohmyswitch 删除的模型从数组中删除，新增的追加。每个模型中 ohmyswitch 负责下表的字段，其他字段（`thinking`、`cost`、`headers`、`api`、`maxContextWindow`、`compat` 中的其他键等）用户手动加的保留。

| omp 字段 | 来源 | 未知时 |
|---|---|---|
| `id` | `id` | — |
| `name` | `name` | 不写（omp 用 id） |
| `reasoning` | `reasoning` | 不写（omp 从内置目录中同 id 的模型推断，没有则为 false） |
| `input` | `input` 中的 `text`、`image`（不支持 `pdf`） | 不写（同上，没有则仅 text） |
| `contextWindow` | `contextWindow` | 不写（同上，没有则 128000） |
| `maxTokens` | `maxOutput` | 不写（同上，没有则 16384） |
| `supportsTools` | `toolCall` | 不写 |
| `compat.reasoningContentField` | `openai-completions`、`reasoning` 为 `true` 且 `interleaved.field` 是 `reasoning_content`、`reasoning`、`reasoning_text` 之一时为该字段 | 不写 |
| `compat.requiresReasoningContentForToolCalls` | 同上条件时为 `true` | 不写 |

- `cost` 不写（不保存价格），omp 从内置目录中同 id 的模型取价格，没有则为 0。
- **推理等级（`thinking`）不写**：omp 的 compat 引擎会按模型 id 识别模型家族、按协议和地址推导档位和请求格式（`compat/resolve.ts` 的 `resolveThinkingPolicy`），比由 models.dev 的 `reasoning_options` 推导更准确；写了 `thinking` 反而要选定 `mode`（`effort`、`anthropic-adaptive` 等），选错会发错格式。用户手写的 `thinking` 保留。

## ohmyswitch 侧的记录

与 Pi 相同（见 `docs/harness/pi.md`）：key 由名称生成并记录在 `store.json` 的 `harnesses.omp.key`；已有同名但不是 ohmyswitch 写入的条目需要确认接管；保存时自动更新，删除前先移除；状态按重新生成的条目与文件比较。有多个 profile 时，每个文件分别比较再合并，与 DSH 相同（以后新建的 profile 显示为「已被移除」，重新写入即可）。

## 写入流程

1. 确定各 profile 的文件（见上），读取（不存在视为空），解析 YAML；解析失败，或顶层、`providers` 不是对象时停止并报错。
2. 生成条目；以 `!` 开头的 Key 拒绝写入。写入任何文件之前先为每个文件生成一遍，有一个无法生成就一个都不写。
3. 只修改 `providers.<key>` 子树；文件中没有 `providers` 时新增。新建的条目使用块格式。
4. 写入前重新读取文件比对，不同则停止；原子写入，保留原文件权限，新建文件用 `0600`。

取消应用时删除 `providers.<key>` 整个条目，`providers` 为空时保留为 `{}`。

- 顺序：ohmyswitch 的条目按供应商列表的顺序排列，只在它们已经占据的位置之间调换，用户自己的条目不动；条目上方的注释跟着条目移动，空行留在原处。写入条目时在同一次编辑中排好顺序；调整供应商顺序后，单独重排一次。

## 导入

「从 Harness 导入」读取 `models.yml` 中不属于 ohmyswitch、key 不是内置供应商 id 的条目，多个 profile 中同一个 key 以第一个文件（默认 profile）为准。

| ohmyswitch 字段 | 来源 | 不能导入的情况 |
|---|---|---|
| 名称 | key（omp 的供应商没有名称） | — |
| 端点 | 按「供应商字段」中的表由 `api` 反查 | 没有 `api`，或不在表中 |
| Base URL | `baseUrl` 去掉表中该端点的版本路径 | 不以这个路径结尾，或 ohmyswitch 写回时会不同 |
| API Key | `apiKey`（原样） | 没有；以 `!` 开头（命令，不执行）；全大写的环境变量名形式（视为引用环境变量，不读取，以免接管后把 Key 明文写回） |
| 模型 | `models` 的 `id`、`name`、`contextWindow`、`maxTokens`、`reasoning`、`input`、`supportsTools`，`compat.reasoningContentField` 记为 `interleaved.field`；无效的字段不导入 | — |

- 设置了 `transport`（经 auth-gateway 转发）或 `auth` 为 `oauth`、`none` 的条目不能导入。
- `auth` 没有写的 `anthropic-messages` 条目可以导入，但接管后会写成 `auth: apiKey`，请求从 Claude Code 的 OAuth 方式变为标准方式。
- 导入后的处理与 Pi 相同（见 `docs/harness/pi.md` 的「导入」）。

## 已知限制

- 内置供应商 id 列表随 omp 版本变化。
- 新建 profile 后需要重新写入；ohmyswitch 不监听 omp 目录。
- 推理档位完全交给 omp 推导；omp 不认识的模型（中转站改过名的 id）可能不提供档位，需要用户手写 `thinking`。
