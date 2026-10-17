# DeepSeek Harness（DSH）配置契约

依据 DSH 0.2.0-rc.2 的源码（tag `dsh-v0.2.0-rc.2`，commit 639ed01）整理，内置的 pi-ai 为 0.87.1。涉及的文件：`packages/boot/app-boot`（profile 与 patch 的叠加）、`vendor/include`（patch 算法）、`packages/boot/config-editor`（Web UI 如何写 patch）、`packages/llm/llm-pi-ai`（供应商配置）、`packages/credentials/credentials-local`（凭据文件）、`packages/util/atomic-write`（文件锁）、`packages/util/home-paths`。DSH 升级后需要重新核对标了「版本相关」的条目。

## 读写的文件

| 文件 | 读 | 写 | 说明 |
|---|---|---|---|
| `<home>/profiles/<profile>/cordis.patch.yml` | 是 | 是 | 每个目标 profile 一份，写入 `llm-pi-ai` 的供应商 |
| `<home>/.credentials.yaml` | 是 | 是 | 只增删 ohmyswitch 自己的 `refs` 条目，存放 API Key |
| `<home>/profiles/<profile>/package.json` | 是 | 否 | 判断 profile 是否加载 `llm-pi-ai` |
| `<home>/cordis.patch.yml` | 是 | 否 | home 层 patch，只检查它是否覆盖了 `llm-pi-ai` |
| `<home>/.env`、各 profile 的其他文件 | 否 | 否 | |

`<home>` 是 `DSH_HOME`（支持绝对路径和 `~/`；DSH 自己还接受相对路径，按启动目录解析，ohmyswitch 无法知道启动目录，忽略），未设置时为 `~/.dsh`。见 `src/core/harness-dsh/descriptor.ts`。

## patch 的叠加规则

- 每个 profile 由若干 bundle 的 patch 层组成，之后依次叠加 profile 自己的 `cordis.patch.yml` 和 home 层的 `<home>/cordis.patch.yml`（home 层优先级最高）。
- patch 文件是顶层 YAML 数组，元素是按 `id` 定位条目的 patch，可以写 `!!js` 表达式。空文件或只有注释的文件会导致 DSH 启动失败（模板里写的是 `[]`）。
- 按 `id` 定位的 patch 会**整块替换**条目的 `config`（`target.config = value`），不做合并。同一层里有多条匹配时，后面的生效。
- Web UI（config-editor）只写当前 profile 的 patch，home 层只读。它定位条目的规则是：最后一个 `id` 匹配、不含 `insert`、没有 `name` 或 `name` 一致的元素。保存时以当前生效的配置为起点重写整个 `config`。

### 为什么写 profile 层，而不是 home 层

home 层的 `llm-pi-ai` 会整块覆盖每个 profile 里的 `llm-pi-ai`：用户在 Web UI 里配置的供应商会全部失效，之后在 Web UI 里修改也不会生效（config-editor 会报「被 home patch 覆盖」）。所以 ohmyswitch 不写 home 层，而是写进每个目标 profile 的 patch，与 Web UI 的条目共存。

home 层已经有 `llm-pi-ai` 的 `config` 时，profile 层的写入不会生效，ohmyswitch 停止并提示。

### 目标 profile

`<home>/profiles/` 下的每个目录（`node_modules` 除外），其 `package.json` 的 `dsh.profile.bundles` 包含 `@deepseek-ai/dsh-base`。只有 base bundle 加载 `llm-pi-ai`，且没有给它任何 `config`（版本相关），所以 profile 层新建的 `llm-pi-ai` 条目整块替换时不会丢失内容。

本机通常有 `web`（`dsh web`，热重载）和 `desktop`（桌面版）。热重载的 profile 立即生效，其他 profile 下次启动时生效。一个目标 profile 都没有时（从未启动过 DSH），不能应用。

## llm-pi-ai 的供应商格式

`config.providers` 是字典，key 就是 route 名（下称 key）。DSH 用 schemastery 校验；**配置热重载时，任何一个变化的供应商不合法，整个 patch 的更新都会被拒绝**，用户其他的修改也跟着不生效。所以写出的条目必须合法：

- 手动声明的 route（key 不是内置目录中的 id）必须有 `api`、`baseURL` 和非空的 `models`。没有模型的供应商不能应用到 DSH。
- `reasoningEfforts` 至少要有一个 `off` 以外的档位，且除 `off` 外每个档位都要有值。
- `contextWindow`、`maxTokens` 为正整数；`input` 只能是 `text`、`image`。

### key 的限制

- key 与 pi-ai 内置目录的 provider id 相同时，会继承目录的端点、协议和模型（用户的 web profile 里 `openai`、`anthropic` 就是这样配的）。所以 key 不能使用这些 id（版本相关，pi-ai 0.87.1）：
  `amazon-bedrock ant-ling anthropic azure-openai-responses baseten cerebras cloudflare-ai-gateway cloudflare-workers-ai deepseek fireworks github-copilot google google-vertex groq huggingface kimi-coding meta minimax minimax-cn mistral moonshotai moonshotai-cn nvidia openai openai-codex opencode opencode-go openrouter qwen-token-plan qwen-token-plan-cn qwen-token-plan-individual radius together vercel-ai-gateway xai xiaomi xiaomi-token-plan-ams xiaomi-token-plan-cn xiaomi-token-plan-sgp zai zai-coding-cn`
- `deepseek-official`、`deepseek-account` 由 DeepSeek 自己的适配器注册，同名 route 会注册失败。
- 任一目标 profile 中已有同名、但不是 ohmyswitch 写入的条目时，需要用户确认接管。

### 供应商字段

| 字段 | 写入的值 |
|---|---|
| `displayName` | ohmyswitch 供应商名称 |
| `api` | 由端点决定，见下表 |
| `baseURL` | 由端点决定，见下表 |
| `apiKeyEnv` | `OHMYSWITCH_<KEY>_API_KEY`，见「API Key」 |
| `models` | 见下文 |

provider 级的其他字段（`compat`、`headers`、`retryPolicy`、`timeoutMs` 等）ohmyswitch 不写，用户手动加的保留。

| ohmyswitch 端点 | `api` | `baseURL` | 依据 |
|---|---|---|---|
| `/v1/chat/completions` | `openai-completions` | `<Base URL>/v1` | OpenAI SDK 在 baseURL 后拼 `/chat/completions`；内置 openai 为 `https://api.openai.com/v1` |
| `/v1/responses` | `openai-responses` | `<Base URL>/v1` | 同上 |
| `/v1/messages` | `anthropic-messages` | `<Base URL>` | Anthropic SDK 自己拼 `/v1/messages`；内置 anthropic 为 `https://api.anthropic.com` |
| `/v1beta/generateContent` | — | — | DSH 只开放上面三种协议（`llm-pi-ai/src/provider.ts` 的 `PROTOCOLS`），不能应用 |

### 模型字段

`models` 按 ohmyswitch 的模型列表生成，按 `id` 对应：ohmyswitch 删除的模型从数组中删除，新增的追加。每个模型中 ohmyswitch 负责下表的字段，其他字段用户手动加的保留。

| DSH 字段 | 来源 | 未知时 |
|---|---|---|
| `id` | `id` | — |
| `name` | `name` | 不写（DSH 用 id） |
| `contextWindow` | `contextWindow` | 不写（DSH 默认 262144） |
| `maxTokens` | `maxOutput` | 不写（DSH 默认 32768）。注意：写了之后它也是每次请求的默认上限 |
| `input` | `input` 中的 `text`、`image`（不支持 `pdf`） | 不写（DSH 视为仅 text） |
| `reasoningEfforts` | `reasoning`、`reasoningOptions`，见下文 | 不写（手动声明的模型不推理） |
| `compat.forceAdaptiveThinking` | `anthropic-messages` 且有 `effort` 选项时为 `true` | 不写 |
| `compat.requiresReasoningContentOnAssistantMessages` | `openai-completions` 且 `interleaved.field` 为 `reasoning_content` 时为 `true` | 不写 |

`toolCall` 没有对应字段，不写。

### 推理等级（reasoningEfforts）

DSH 的档位是 `off minimal low medium high xhigh max`。`reasoningEfforts` 的每个 key 是可选的档位，值是发送的 effort；**没有列出的档位不提供**；只有 `off` 可以不写值，表示「可以关闭，关闭时什么都不发送」。手动声明的模型不写 `reasoningEfforts` 时不推理。

这与 Pi 的 `thinkingLevelMap`（值为 `null` 表示不提供，没列出的用默认值）正好相反，规则按 DSH 的语义重新推导，保持与 Pi 相同的效果（E 为 `effort` 的取值）：

| 情况 | reasoningEfforts |
|---|---|
| `reasoning` 不为 `true` | 不写 |
| `reasoningOptions` 未知，或只有 `budget_tokens` | `off`（无值）、`minimal`–`high`（同名），相当于 Pi 的默认档位 |
| 有 `effort` | `minimal`–`max` 中在 E 里的档位（同名）。`off`：E 含 `none` 时为 `none`；否则有 `toggle` 时不写值；都没有时不提供。没有 `off` 以外的档位时按「不可调」处理 |
| 只有 `toggle` | `off`（无值）、`high: high` |
| 空数组（不可调） | `high: high` |

E 中 DSH 没有的值（如 `default`）忽略。

## API Key

DSH 的配置里没有填写 Key 的字段，`apiKeyEnv` 是凭据引用（环境变量名），每次请求时按以下顺序解析，先找到的生效：

1. 启动 DSH 时的环境变量；
2. `<home>/.credentials.yaml` 的 `refs`（实时监听，修改后下一次请求生效）；
3. 启动目录的 `.env`；
4. `<home>/.env`（3、4 只在启动时读取一次，而且会进入进程环境）。

ohmyswitch 把 Key 写进 `.credentials.yaml` 的 `refs`，这也是 Web UI 保存 Key 的位置：

- 引用名为 `OHMYSWITCH_<KEY>_API_KEY`，`<KEY>` 是 key 转为大写、`-` 换成 `_`（key 只含小写字母、数字和 `-`，可以一一对应回 key）。名字带前缀，不会被常用的环境变量遮住。
- 只增删这些条目。`records`（OAuth 等登录凭据）和其他 `refs` 不读取其值、不修改。
- 文件格式：顶层只能有 `version`（当前为 `1`）、`refs`、`records`；`refs` 的值必须是非空字符串。空文件视为空库，新建时写 `version: 1`。没有 `version` 但有内容的旧格式不写入（DSH 启动时会自行迁移）。
- 文件权限必须是 `0600`（其他用户可读时 DSH 拒绝加载），新建时使用 `0600`，所在目录 `0700`。
- 凭据文件路径可以在 `credentials` 条目的 `config.path` 中修改，ohmyswitch 只支持默认路径。

## 文件锁

DSH 写文件时持有跨进程锁：以 `wx` 方式创建 `<file>.lock`，内容是持有者的 PID；持有者进程已不存在时可以接管。ohmyswitch 写入时使用同样的锁：

- profile patch 锁 `<profile>/package.json.lock`（config-editor 用的锁）；
- 凭据文件锁 `<home>/.credentials.yaml.lock`。

## ohmyswitch 侧的记录

- key 的生成、接管确认、`store.json` 中的记录（`harnesses.dsh.key`）、保存后自动重写、删除前先移除，与 Pi 相同。
- 写入顺序：先凭据文件，再各 profile 的 patch（避免引用暂时找不到 Key）；移除时反过来。某个文件写入失败时，已写入的保留，key 照常记录，状态显示为异常，用户可以重新写入。
- 状态：凭据文件和每个目标 profile 分别比较，再合并：有文件无法读取为「无法读取」，有条目被修改为「已被修改」，有条目不存在为「已被移除」（以后新建的 profile 也属于这种情况），否则为「已应用」。

## 写入流程

1. 读取凭据文件和每个目标 profile 的 patch，解析 YAML（保留注释和 `!!js` 标签）；格式不对时停止并报错。
2. 对每个文件：持有锁，生成 ohmyswitch 负责的条目，只修改该 key 的子树；写入前重新读取比对，不同则停止；原子写入，保留原文件权限。
3. patch 中没有 `llm-pi-ai` 条目时，在末尾新增 `{ id: llm-pi-ai, name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: {} } }`；`[]` 改为块格式。新建的 patch 文件权限为 `0600`。
4. 移除时删除该 key 的整个条目，`providers` 为空时保留空字典 `{}`。`llm-pi-ai` 这一行与 Web UI 共用，无法分辨是谁建的，所以即使是 ohmyswitch 新建的也不删除（与没有这一行等价）。
5. 写入任何文件之前，先为每个文件生成一遍条目；有一个无法生成（如没有模型、端点不支持），就一个文件都不写。
6. 顺序：patch 中 ohmyswitch 的路由按供应商列表的顺序排列，只在它们已经占据的位置之间调换，用户自己的路由不动。路由上方的注释跟着路由移动；空行用来分隔位置，留在原处。写入路由时在同一次编辑中排好顺序；调整供应商顺序后，单独重排一次。DSH 的供应商目录按内置路由在前、声明的路由按配置顺序在后排列（`dsh-llm-pi-ai` 的 `directoryEntries`，版本相关）。凭据文件中的顺序没有意义，不调整。

## 已知限制

- pi-ai 内置目录的 provider id 和只由 base bundle 加载 `llm-pi-ai` 这两点随 DSH 版本变化。
- `openai-completions` 的推理参数格式（`compat.thinkingFormat`）由 pi-ai 按域名判断，经中转站访问 DeepSeek、GLM、Qwen 等时判断不出来，与 Pi 的限制相同。
- 新建 profile 后需要重新写入；ohmyswitch 不监听 DSH 目录。
- 通过 `--patch` 传入的临时 patch 无法检测。
- 修改 patch 时整个文件会按 YAML 库的格式重新输出：注释、`!!js` 表达式和数据保持不变，但其他条目里的行内集合会规范为 `[ a, b ]` 的写法（DSH 的 config-editor 也是如此）。
