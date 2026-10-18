# 开发约定

## 项目

- ohmyswitch 采用「供应商优先」的设计：先导入供应商（Base URL、API Key、端点、模型），再按需应用到各个 Harness 的配置文件。不做官方账号登录、请求代理和用量统计。
- 支持的 Harness：OpenCode、Pi、DeepSeek Harness（文档和代码中简称 DSH，界面上显示全称 DeepSeek Harness）、omp（oh-my-pi，界面上也显示 omp）。每个 Harness 是 `src/core/harness-<id>/` 中的一个插件，包含它的位置、路径规则和读写逻辑；`index.ts` 用 `harnessPlugin(descriptor)` 导出插件，插件加载时把 `HarnessDescriptor` 注册到 `HarnessService`。Harness 插件默认启用，启用哪些由 `plugins.yml` 和 `plugins.patch.yml` 决定（契约见 `docs/plugins.md`）。只有注册了的 Harness 才列出，都能写入；Harness 之间相互独立，按名称排列。新增 Harness 就是写契约文档、新建一个 `harness-<id>` 目录、把插件加进 `core/plugins/builtins.ts`（GUI 和 CLI 共用的内置插件列表），并在 `docs/plugins.md` 中列出，`HarnessService` 不用改。未注册（包括已停用）的 Harness 在 `store.json` 中的应用记录原样保留，但不显示、不同步，也不阻止删除供应商。
- 技术栈：Electron + electron-vite、pnpm v12、TypeScript 7（只做类型检查，不负责编译）、Biome。业务逻辑组织成 cordis 插件（`cordis`、`@cordisjs/plugin-loader`、`@cordisjs/plugin-include`，都锁定精确版本），主进程用 tRPC 提供给界面；界面使用 React、React Router、TanStack Query 和 shadcn/ui（Base UI + Tailwind v4）。不引入其他 UI 框架。
- 代码注释和标识符用英文，界面文案用中文。
- 只在开发者要求时修改 `README.md`。

## 目录与依赖方向

- `src/core/`：与 Electron 无关的部分，GUI 和 CLI 共用，Node 可以直接运行。只依赖 Node 内置模块、zod、jsonc-parser（编辑带注释的 JSON 配置）、yaml（编辑带注释的 YAML 配置）、js-yaml（按 cordis Include 的方言读取插件配置）和 cordis。
  - 顶层文件是共享的纯逻辑：供应商 schema、错误、路径、原子写入、文件锁等。`cordis.ts` 放 cordis 的辅助定义（如 `FiberState` 的取值）。
  - 每个子目录是一个插件模块：`store`、`http`（只定义服务）、`models-dev`、`icons`（供应商图标的查找和缓存）、`providers`、`deep-links`（`ohmyswitch://` 导入链接，契约见 `docs/deep-link.md`）、`harnesses`（注册表和写入流程）、`plugins`（`plugins.yml` 和 `plugins.patch.yml`，契约见 `docs/plugins.md`）、`harness-<id>`（每个 Harness 一个）。
  - 只有模块的 `index.ts`、`service.ts` 依赖 cordis，其余文件都是纯逻辑。core 不依赖 Electron 和 tRPC。由 Biome 检查。
- `src/main/`：Electron 主进程，只做组装和 Electron 专用的部分。`index.ts` 只管进程级生命周期（单实例锁、启动、退出、接收 `ohmyswitch://` 链接）；`app.ts` 把 core 的插件和 `plugins/` 中的插件组装起来，是唯一的组装入口（Harness 插件作为 `PluginService` 的内置插件传入，由它加载）；`plugins/` 只放 Electron 专用插件（`http`、`protocol`、`window`）；`trpc/` 是 RPC 层，`routes/` 下每个模块一个文件，由 `router.ts` 汇总。
- `src/renderer/`：渲染进程。`routes/` 只放页面，由 `main.tsx` 装配，页面之间不互相导入；共享界面放在 `components/`，其中 `components/ui/` 是 shadcn 生成的组件；`lib/` 只放数据和工具函数，不依赖界面。
- `src/cli/`：oms 命令行，见下文「CLI」。只依赖 core，与 main 互不依赖。
- 依赖只能单向：renderer →（仅类型）main → core，cli → core。由 Biome 的 `noImportCycles` 和 `noRestrictedImports` 检查。
- `src/core`、`src/main`、`src/cli` 中只有同目录的文件用相对导入（`./x.ts`），离开当前目录就用 `package.json` 的 subpath imports：`#core/*`、`#main/*`、`#cli/*`、`#build/*`（窗口图标等构建资源），都写 `.ts` 后缀，不写 `../`。渲染进程用 `@/` 别名，不写后缀。
- ohmyswitch 的文件按性质分目录，遵循各平台的约定，由 `core/paths.ts` 的 `appDirs` 决定，GUI 和 CLI 共用。不在 home 下建点目录。

  | 目录 | 内容 | Linux | macOS | Windows |
  |---|---|---|---|---|
  | config | `plugins.yml`、`plugins.patch.yml` | `$XDG_CONFIG_HOME/ohmyswitch` | `~/Library/Application Support/ohmyswitch` | `%APPDATA%\ohmyswitch` |
  | data | `store.json` | `$XDG_DATA_HOME/ohmyswitch` | 同上 | `%APPDATA%\ohmyswitch` |
  | cache | models.dev、图标，删掉会重新获取 | `$XDG_CACHE_HOME/ohmyswitch` | `~/Library/Caches/ohmyswitch` | `%LOCALAPPDATA%\ohmyswitch\Cache` |
  | state | `electron/`（Electron 的 userData：Chromium 状态和单实例锁） | `$XDG_STATE_HOME/ohmyswitch` | `~/Library/Application Support/ohmyswitch` | `%LOCALAPPDATA%\ohmyswitch` |
  | logs | `ohmyswitch.log`，超过 5 MB 时轮转为 `ohmyswitch.old.log` | `$XDG_STATE_HOME/ohmyswitch/logs` | `~/Library/Logs/ohmyswitch` | `%LOCALAPPDATA%\ohmyswitch\Logs` |

- 本地运行时可以把 `OHMYSWITCH_HOME` 设为另一个目录，各类目录都放到它下面的 `config/`、`data/`、`cache/`、`state/`（日志在 `state/logs/`）中，同时隔离 userData 和单实例锁，不影响已安装的应用。

## 插件

- 插件框架是 cordis。npm 包只带编译产物，行为以 cordiverse/cordis 中对应版本的源码为准：服务按名字注册在 `ctx` 上，`inject` 声明的服务都就绪后插件才加载，依赖的服务消失时插件跟着卸载；卸载时依赖方先于被依赖的服务清理。
- 模块 `core/<name>/` 的文件分工：`service.ts` 是主 service，命名为 `XxxService`，继承 cordis 的 `Service`，它本身就是插件；`schemas.ts` 是 service 的输入校验，RPC 和 CLI 共用；只有不是单个 service 的插件（如 Harness 插件）才需要 `index.ts`；其余文件是这个模块的纯逻辑。tRPC 路由写在 `main/trpc/routes/<name>.ts`，只把校验后的输入交给 service。业务代码不依赖 tRPC，出错时抛 `core/errors.ts` 的 `AppError`。
- service 的写法：
  - 构造函数是 `(ctx, options)`，调用 `super(ctx, '<name>')` 注册为 `ctx.<name>`，并用 `declare module 'cordis' { interface Context { <name>: XxxService } }` 声明类型。
  - 依赖写在 `static inject`，方法里通过 `this.ctx.<name>` 使用；core 的 service 依赖其他模块的服务时，按 `inject` 逐个 `import type {} from '#core/<module>/service.ts'`：界面的类型检查只沿导入链看到 core，缺了它们，推导出的返回类型会丢失。已经具名导入了 service 类型的文件（如 `main/trpc/router.ts` 和引用它的插件）不用再写。日志用构造函数里创建的 `ctx.logger('<name>')`。
  - 插件参数用 zod 定义为 `static Config`，同时导出 `XxxOptions` 类型。
  - 不用 `#private` 字段：cordis 通过 Proxy 访问 service，`#private` 在 Proxy 上不可用。
- 加载时的异步准备、对外的副作用（处理 `app://` 请求、打开窗口）和资源释放写在 `[Service.init]()` 里：返回或 yield 的函数就是清理逻辑。执行顺序由 `inject` 决定，不手动安排。
- 注册是 effect：service 提供给其他插件的注册方法（如 `HarnessService.register`）在 `this.ctx.effect()` 中登记并返回撤销函数，登记归属调用方的插件，它卸载时自动撤销。撤销时先停止接收新的操作，再等进行中的操作完成，然后才释放它们用到的资源。
- 配置在启动时由 `loadConfig()` 读取一次，`app.ts` 在 `ctx.plugin()` 时把每个插件需要的部分作为插件参数传入。插件不读全局配置，也不直接读 `process.env`。
- 需要 Electron 的能力在 core 中定义服务，由 `main/plugins` 中的插件提供：网络请求注入 `ctx.http`（`core/http` 的抽象类 `HttpService`），main 的子类用会走系统代理的 `net.fetch` 实现它，CLI 的子类用 Node 的 fetch（代理取自 `HTTP_PROXY` 等环境变量）。
- 插件的组合方式和 DeepSeek Harness profile 的 `cordis.yml`、`cordis.patch.yml` 相同：`PluginService` 用 Include 挂载 `plugins.yml`（插件列表），把 `plugins.patch.yml`（用户和 agent 写的 patch）作为 patches 交给它，组合、写回、冲突合并都用 cordis 的原生能力，不自己实现，也不手动编辑 YAML。界面上的启用、停用通过 Loader 改 `plugins.yml`，由 Include 写回；`disabled` 被 patch 接管的插件（用 Include 的 `PatchIndex` 判断）不能在界面上切换。`plugins.patch.yml` 只读不写。上游 include 1.1.1 没有导出 `PatchIndex` 和 `entryListSchema`，用 pnpm patch（`patches/@cordisjs__plugin-include@1.1.1.patch`）补上，上游导出后删掉这个 patch。只加载内置插件，不 import 任意模块；两个文件被外部修改后立即应用；文件有误时沿用上次读取的配置。行为与 `docs/plugins.md` 保持一致。
- ohmyswitch 自己的状态有两个归属方：供应商等业务数据在 `store.json`，只通过 `StoreService.update` 修改；插件的启用状态在 `plugins.yml`，ohmyswitch 中只通过 `PluginService` 修改；`plugins.patch.yml` 属于用户和 agent，ohmyswitch 不写。`StoreService.update` 负责校验、原子写入和串行化，逻辑在 `core/store/store.ts`。GUI 和 CLI 会同时写 `store.json`：每次 `update` 都持有跨进程锁（`store.json.lock`，`core/file-lock.ts`），重新读取文件，在文件当前的数据上执行修改，所以别的进程刚写入的内容不会被覆盖；文件有误或版本比当前程序新时拒绝写入。因此传给 `update` 的修改函数只能依据 `draft` 判断（在其中查找供应商、检查重名），不依据调用前读到的数据。GUI 监听 `store.json`（`StoreService` 的 `watch` 参数），别的进程写入后立即读入，并通过 `store.events` 通知界面刷新；CLI 不监听。`store.json` 的结构有变化时，升级 `version` 并编写迁移；GUI 和 CLI 分开发布，旧版本会拒绝写入新版本的文件。
- API Key 明文保存在 `store.json` 中，文件权限为 `0600`。不加密，也不接系统钥匙串：Key 最终会明文写进 Harness 的配置文件，而且钥匙串在 Linux 上并不可靠。API Key 不写入日志，列表等不需要展示 Key 的接口也不返回它。
- 写 Harness 配置时：
  - 只改 ohmyswitch 负责的条目，其他内容原样保留，能保留注释的格式就保留注释。
  - 使用原子写入。写入前比对文件内容，发现外部改动过就停下来重新读取。
  - 不写默认供应商和默认模型。
  - ohmyswitch 的条目按供应商列表的顺序排列，只在它们已经占据的位置之间调换，用户自己的条目不动（`HarnessAdapter.reorder`）。顺序没有意义的文件（如 DSH 的凭据文件）不实现它。
  - 不碰 Harness 的登录凭据（如 Pi 的 `auth.json`、DSH 凭据文件中的 `records`）。Harness 只能从凭据库读取 API Key 时（如 DSH 的 `.credentials.yaml`），可以在其中增删 ohmyswitch 自己的 Key 条目，其他条目不读取其值、不修改。
  - 实现某个 Harness 之前，先在 `docs/harness/<id>.md` 写明它的原生配置契约（读写哪些文件和字段、明确不碰哪些）。契约以 Harness 的源码为准，注明核对的版本。
  - Harness 写入哪些文件由它的 `HarnessDescriptor.configFiles` 决定（可以有多个，如 DSH 的每个 profile 和凭据文件）。每个文件的读写逻辑是一个 `HarnessAdapter`（在 `core/harness-<id>/config.ts` 中，只做文本到文本的转换）。文件读写、串行化、加锁和写前比对在 `core/harnesses/editor.ts` 的 `ConfigEditor` 中，应用状态和 key 分配是 `core/harnesses/applications.ts` 中的纯函数；`HarnessService` 只负责注册、编排和记录。Harness 自己写文件时有跨进程锁的，写入时使用同样的锁（`core/file-lock.ts`）。保持实现与契约文档一致。

## 主进程

- 渲染进程和 RPC 都由 `app://ohmyswitch` 提供（`plugins/protocol` 的 `AppProtocol`）：`/api/trpc` 交给 tRPC 的 fetch 适配器，其余路径是界面资源，开发时代理到 Vite dev server。不使用 preload 和 `ipcMain`，新增能力一律写成 tRPC 过程。
- 日志统一经 cordis 的 logger 输出，`main/logging.ts` 的 exporter 交给 electron-log 写到 console 和 logs 目录中的日志文件（用它的 `electron-log/node` 入口，`electron-log/main` 会注册 `ipcMain`）；插件树之外的进程级错误用 `logError`。日志文件只由持有单实例锁的进程打开。
- 主窗口是 `plugins/window` 的 `WindowService`。`index.ts` 只在 `activate`、`second-instance` 和收到链接时调用它。
- 主进程需要主动通知界面时用 tRPC subscription（SSE，见 `deepLinks.events`），不用 IPC。

## 渲染进程

- 服务端数据用 TanStack Query 管理，使用 `@/lib/trpc` 的 `trpc` 提供的 `queryOptions`、`mutationOptions` 和缓存失效接口，不自己写请求或状态 hooks。数据变更后的缓存刷新放在 `lib/cache.ts`。
- 只有 `lib/trpc.ts` 引用主进程，且只引用类型。与后端对应的枚举从 `RouterOutputs` 派生；文案表用 `satisfies Record<..., string>` 覆盖全部取值。Harness id 是开放的（由插件注册），按 id 查的表要有兜底，名称从 `harnesses.list` 取。
- 渲染进程运行在沙箱中，不使用 Electron 和 Node API。
- 用 `pnpm ui:add <component...>` 添加 shadcn 组件。脚本会把组件新增的依赖移到 `devDependencies`，并格式化生成的文件。尽量不改 `components/ui/` 中的组件，需要定制时在 `components/` 中组合。

## 设计

本项目采用 Vercel（Geist）的设计语言。开发者的指示优先于本节。

- 颜色只用 `styles.css` 中定义的语义变量（`bg-background`、`text-muted-foreground`、`border` 等），不写死色值。界面以黑、白、灰为主，彩色只用来表示状态（`bg-success`、`text-destructive`）。
- 只用系统字体，不打包字体文件。无衬线字体的顺序：Apple 系统字体 > Windows 系统字体 > 其他无衬线字体 > 其他字体；等宽字体的顺序：SF Mono > JetBrains Mono > 其他等宽字体。字体栈定义在 `styles.css` 的 `--font-sans` 和 `--font-mono` 中，组件不另设字体。
- URL、路径、端点、版本号等机器可读的值用 `font-mono`。
- Harness 和模型厂商的图标用 `@lobehub/icons`：Harness 用 Mono 版本（用 `currentColor` 绘制，跟随深浅色），厂商用 Color 版本（没有 Color 版本的用 Mono）。按 `@lobehub/icons/es/<Name>/components/<Variant>.js` 深导入，不从包入口导入（入口会引入 antd）。通用图标用 lucide。
- 布局：窗口顶部是全宽的 `TopBar`（应用名、全局操作）；下方左栏是供应商列表，右栏显示选中的供应商。以供应商为中心，Harness 只在供应商详情的「应用到」中出现，不单独成页。
- 右栏的页面由 `PageHeader`（标题、右侧操作）和 `PageContent` 组成。供应商详情是一级页面；从它进入的是二级页面（如添加、编辑供应商），仍在右栏中打开，`PageHeader` 传 `backTo` 显示返回按钮，标题字号比一级页面小。列表放在细边框的 `rounded-lg` 容器里，行之间用 `divide-y` 分隔；空状态用 `Empty`；附加信息用 `Badge`，不用 `·` 拼接。
- 每个页面最多一个主按钮（默认的黑底按钮），次要操作用 `outline` 或 `ghost`。
- 添加和编辑供应商用二级页面，小范围的编辑和选择（如单个模型）用 `Dialog`；删除等不可恢复的操作用 `AlertDialog` 确认；操作结果用 sonner 简短提示。
- 跟随系统的深浅色。`TopBar` 是窗口的拖动区（`app-drag`），其中可交互的元素要加上 `app-no-drag`。
- 界面做减法。中文表意能力强，标题、标签、按钮能说清的内容，不再另加介绍文本：页面副标题、空状态说明、对话框描述、字段描述默认都不写。
- 只有两种情况才加一句说明：帮助用户做决定（例如删除确认里说明操作的后果），或帮助用户从错误中恢复。

## UX 自查

界面质量靠设计和自查保证，不靠测试。每次改动界面，都从用户的视角把涉及的流程走一遍：

- 每一屏只有一个明确的主任务和一个主操作，用户不用想就知道下一步做什么。
- 加载、空数据、出错、提交中、校验失败这些状态都有处理，状态切换时布局不跳动。
- 键盘可用：焦点顺序合理，对话框打开时聚焦第一个输入框，Enter 提交，Esc 关闭。
- 在最小窗口（860×560）和深色模式下不溢出、不错位；长名称、长路径会截断。
- 把文案读一遍：能删的字删掉，同一个概念始终用同一个词。
- 不可恢复的操作有确认，每个操作都有可见的结果。

## CLI

- oms 和 GUI 分开发布：CLI 用 tsdown 打包成 `out/cli/oms.mjs`（所有依赖都打进去，pnpm patch 才会生效），连同生成的 `package.json` 从 `out/cli` 发布到 npm。开发时用 `pnpm oms <args>` 直接运行源码。
- 输出、帮助和提示都用英文，和 GUI 区分开。core 的 schema 自带中文错误信息，CLI 根据 zod issue 的 code 自己写英文描述（`framework/validate.ts`），能在 CLI 中预先检查的错误（找不到、重名、不可选）先检查掉。
- `cli/app.ts` 是 CLI 的组装入口，组装与 GUI 相同的 core 插件，读写同一份文件。CLI 不拿单实例锁，不写日志文件，日志只在 `--verbose` 时输出到 stderr。
- GUI 和 CLI 共有的业务规则放在 core 的 service 里，前端不各写一份（如选择模型后的合并 `pickModels`、模型变化的比对 `modelChanges`，纯逻辑在 `core/providers/model-list.ts`）。前端只负责呈现和收集选择。
- 命令只用 `framework/command.ts` 声明一次：参数的类型、取值（`parse`、`choices`）和校验同时供命令行和交互提示使用，交互模式只是参数的另一种来源。在终端中缺参数时才提示（`--json`、`--no-input`、非 TTY、CI 都不提示）；`oms` 不带命令进入菜单，按命令树展开，执行完一个命令（成功或失败）后回到进入时的那一层；Esc 返回一级（放弃当前命令时留在原来的菜单），Ctrl-C 在任何地方都直接退出。直接带命令运行时只补齐参数，执行完就退出。不写只属于交互模式或只属于命令行的功能。
- 结果写 stdout，警告、错误和提示写 stderr；`run` 只返回结果，`--json` 原样输出它，`render` 给人看。不可恢复的操作用 `confirm` 声明，由 `--yes` 或交互确认；命令中途需要确认的事项（如接管同名条目）用 `RunScope.confirm` 对应到一个 flag。交互完成后打印等价命令。
- 退出码是对脚本的契约（`framework/errors.ts` 的 `exitCodes`），不随意改动。

## 测试与验证

- 日常验证：`pnpm typecheck`、`pnpm lint`、`pnpm build`。
- 不写测试，也不运行任何 e2e 或界面自动化脚本。测试只能证明流程走得通，覆盖不了真正要紧的 UX 质量。
