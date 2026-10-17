# 开发约定

## 项目

- ohmyswitch 采用「供应商优先」的设计：先导入供应商（Base URL、API Key、端点、模型），再按需应用到各个 Harness 的配置文件。不做官方账号登录、请求代理和用量统计。
- 支持的 Harness：OpenCode、Pi、DeepSeek Harness（文档和代码中简称 DSH，界面上显示全称 DeepSeek Harness）。各自的位置、路径规则和读写逻辑在 `src/core/harness/` 中定义。列表里的 Harness 都能写入，尚未接入的不列出。
- 技术栈：Electron + electron-vite、pnpm v12、TypeScript 7（只做类型检查，不负责编译）、Biome。主进程使用 `@fraqjs/kernel` 插件和 tRPC；界面使用 React、React Router、TanStack Query 和 shadcn/ui（Base UI + Tailwind v4）。不引入其他 UI 框架。
- 代码注释和标识符用英文，界面文案用中文。
- 只在开发者要求时修改 `README.md`。

## 目录与依赖方向

- `src/core/`：与 Electron 无关的领域模型和纯逻辑，包括供应商 schema、Harness 描述、配置投影和原子写入。只依赖 Node 内置模块、zod、jsonc-parser（编辑带注释的 JSON 配置）和 yaml（编辑带注释的 YAML 配置），Node 可以直接运行。
- `src/main/`：主进程。`index.ts` 管理 Electron 生命周期，`app.ts` 装配插件，`plugins/` 按业务模块划分，`trpc/` 汇总路由。
- `src/renderer/`：渲染进程。`routes/` 只放页面，由 `main.tsx` 装配，页面之间不互相导入；共享界面放在 `components/`，其中 `components/ui/` 是 shadcn 生成的组件；`lib/` 只放数据和工具函数，不依赖界面。
- 依赖只能单向：renderer →（仅类型）main → core。由 Biome 的 `noImportCycles` 和 `noRestrictedImports` 检查。
- `src/core`、`src/main` 中的相对导入写 `.ts` 后缀；渲染进程用 `@/` 别名，不写后缀。
- ohmyswitch 的数据目录是 `~/.ohmyswitch`（`store.json`、`cache/`），由 `core/paths.ts` 决定，GUI 和以后的 CLI/TUI 共用。Electron 的 userData 只放 Chromium 状态和单实例锁。
- 本地运行时可以把 `OHMYSWITCH_HOME` 设为另一个目录，它会同时隔离数据目录、userData 和单实例锁，不影响已安装的应用。

## 主进程

- 每个模块 `plugins/<name>/` 的文件分工：`index.ts` 装配插件，显式声明 `inject` 和 `provides`；`service.ts` 是主 service，命名为 `XxxService`；`schemas.ts` 是 RPC 输入校验；`router.ts` 是 tRPC 路由。业务代码不依赖 tRPC，出错时抛 `core/errors.ts` 的 `AppError`。
- 有状态的服务以实例注册。插件没有 stop 钩子，需要释放的资源在 service 的 `dispose()` 中释放。
- 配置在启动时由 `loadConfig()` 读取一次，插件通过 `ctx.config` 使用，不直接读 `process.env`。
- 渲染进程和 RPC 都由 `app://ohmyswitch` 提供（`plugins/protocol`）：`/api/trpc` 交给 tRPC 的 fetch 适配器，其余路径是界面资源，开发时代理到 Vite dev server。不使用 preload 和 `ipcMain`，新增能力一律写成 tRPC 过程。
- ohmyswitch 自己的状态只通过 `StoreService.update` 修改，它负责校验、原子写入和串行化；逻辑在 `core/store.ts`，不依赖 Electron，以便 CLI/TUI 复用。目前只在进程内串行化，多个进程同时写入前需要加跨进程锁和写前比对。`store.json` 的结构有变化时，升级 `version` 并编写迁移。
- API Key 明文保存在 `store.json` 中，文件权限为 `0600`。不加密，也不接系统钥匙串：Key 最终会明文写进 Harness 的配置文件，而且钥匙串在 Linux 上并不可靠。API Key 不写入日志，列表等不需要展示 Key 的接口也不返回它。
- 写 Harness 配置时：
  - 只改 ohmyswitch 负责的条目，其他内容原样保留，能保留注释的格式就保留注释。
  - 使用原子写入。写入前比对文件内容，发现外部改动过就停下来重新读取。
  - 不写默认供应商和默认模型。
  - 不碰 Harness 的登录凭据（如 Pi 的 `auth.json`、DSH 凭据文件中的 `records`）。Harness 只能从凭据库读取 API Key 时（如 DSH 的 `.credentials.yaml`），可以在其中增删 ohmyswitch 自己的 Key 条目，其他条目不读取其值、不修改。
  - 实现某个 Harness 之前，先在 `docs/harness/<id>.md` 写明它的原生配置契约（读写哪些文件和字段、明确不碰哪些）。契约以 Harness 的源码为准，注明核对的版本。
  - Harness 写入哪些文件由它的 `HarnessDescriptor.configFiles` 决定（可以有多个，如 DSH 的每个 profile 和凭据文件）。每个文件的读写逻辑是 `core/harness/` 中的一个 `HarnessAdapter`（只做文本到文本的转换），文件读写、加锁、写前比对和记录在 `HarnessService` 中。Harness 自己写文件时有跨进程锁的，写入时使用同样的锁（`core/file-lock.ts`）。保持实现与契约文档一致。

## 渲染进程

- 服务端数据用 TanStack Query 管理，使用 `@/lib/trpc` 的 `trpc` 提供的 `queryOptions`、`mutationOptions` 和缓存失效接口，不自己写请求或状态 hooks。数据变更后的缓存刷新放在 `lib/cache.ts`。
- 只有 `lib/trpc.ts` 引用主进程，且只引用类型。与后端对应的枚举从 `RouterOutputs` 派生；文案表用 `satisfies Record<..., string>` 覆盖全部取值。
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

## 测试与验证

- 日常验证：`pnpm typecheck`、`pnpm lint`、`pnpm build`。
- 不写测试，也不运行任何 e2e 或界面自动化脚本。测试只能证明流程走得通，覆盖不了真正要紧的 UX 质量。
