# 开发约定

## 项目

- ohmyswitch 采用「供应商优先」的设计：先导入供应商（Base URL、API Key、端点、模型），再按需应用到各个 Harness 的配置文件。不做官方账号登录、请求代理和用量统计。
- 支持的 Harness：OpenCode、Pi、DeepSeek Harness（代码和文档中简称 DSH，界面上显示全称）、omp（oh-my-pi，界面上也显示 omp）。每个 Harness 是 `src/core/harness-<id>/` 中的一个插件。新增 Harness：先在 `docs/harness/<id>.md` 写契约，再新建目录、加进 `core/plugins/builtins.ts`，并在 `docs/plugins.md` 中列出。未注册（包括已停用）的 Harness 在 `store.json` 中的应用记录原样保留，但不显示、不同步，也不阻止删除供应商。
- 技术栈：Electron + electron-vite、pnpm v12、TypeScript 7（只做类型检查）、Biome；业务逻辑是 cordis 插件（cordis 相关的包锁定精确版本），主进程用 tRPC 提供给界面；界面用 React、React Router、TanStack Query 和 shadcn/ui（Base UI + Tailwind v4），不引入其他 UI 框架。
- 代码注释和标识符用英文，界面文案用中文，CLI 的输出用英文。
- 只在开发者要求时修改 `README.md` 和 `AGENTS.md`。实现变了不需要改 `AGENTS.md`；觉得某条约定需要增改时，先问开发者。

## 目录与依赖方向

- `src/core/`：与 Electron 无关、GUI 和 CLI 共用的部分。只依赖 Node 内置模块、zod、jsonc-parser、yaml、js-yaml 和 cordis，不依赖 Electron 和 tRPC。顶层文件是共享的纯逻辑；每个子目录是一个插件模块，其中只有 `index.ts`、`service.ts` 依赖 cordis。
- `src/main/`：Electron 主进程，只做组装和 Electron 专用的部分。`app.ts` 是唯一的组装入口，`plugins/` 只放 Electron 专用插件，`trpc/routes/` 每个模块一个文件。
- `src/renderer/`：`routes/` 只放页面，页面之间不互相导入；共享界面在 `components/`；`lib/` 只放数据和工具函数，不依赖界面。
- `src/cli/`：oms 命令行，只依赖 core。
- 依赖只能单向：renderer →（仅类型）main → core，cli → core。`src/core`、`src/main`、`src/cli` 中离开当前目录就用 subpath imports（`#core/*` 等，写 `.ts` 后缀，不写 `../`）；渲染进程用 `@/`，不写后缀。
- ohmyswitch 的文件位置由 `core/paths.ts` 的 `appDirs` 决定，遵循各平台的约定，不在 home 下建点目录。本地运行时把 `OHMYSWITCH_HOME` 设为另一个目录，就不影响已安装的应用。

## 插件

- 插件框架是 cordis。npm 包只带编译产物，行为以 cordiverse/cordis 中对应版本的源码为准。
- 模块 `core/<name>/`：`service.ts` 是继承 cordis `Service` 的 `XxxService`；`schemas.ts` 是输入校验，RPC 和 CLI 共用；其余文件是纯逻辑。tRPC 路由只把校验后的输入交给 service。业务代码出错时抛 `core/errors.ts` 的 `AppError`。
- service 的注意事项：
  - 依赖其他模块的服务时，按 `inject` 逐个 `import type {} from '#core/<module>/service.ts'`，否则界面推导出的类型会丢失。
  - 不用 `#private` 字段：cordis 通过 Proxy 访问 service。
  - 异步准备、对外的副作用和资源释放写在 `[Service.init]()` 里，执行顺序由 `inject` 决定，不手动安排。
  - 提供给其他插件的注册方法用 `ctx.effect()` 登记，撤销时先停止接收新的操作，再等进行中的操作完成。
- 配置在启动时读取一次，由组装入口作为插件参数传入；插件不读全局配置，也不直接读 `process.env`。需要 Electron 的能力在 core 中定义服务，由 main 提供实现（如 `ctx.http`）。
- `plugins.yml` 和 `plugins.patch.yml` 的组合、写回、冲突合并都用 cordis Include 的原生能力，不自己实现，也不手动编辑 YAML。只加载内置插件，不 import 任意模块。行为与 `docs/plugins.md` 一致。
- 状态的归属：业务数据在 `store.json`，只通过 `StoreService.update` 修改；插件的启用状态在 `plugins.yml`，只通过 `PluginService` 修改；`plugins.patch.yml` 属于用户和 agent，ohmyswitch 只读。
- GUI 和 CLI 会同时写 `store.json`，`update` 会在文件的最新数据上执行修改，所以传给它的函数只能依据 `draft` 判断，不依据调用前读到的数据。结构有变化时升级 `version` 并编写迁移。
- API Key 明文保存在 `store.json` 中（文件权限 `0600`），不加密，也不接系统钥匙串：Key 最终会明文写进 Harness 的配置，而且钥匙串在 Linux 上不可靠。API Key 不写入日志，不需要展示 Key 的接口不返回它。
- 写 Harness 配置时：
  - 只改 ohmyswitch 负责的条目，其他内容原样保留，能保留注释就保留。
  - 原子写入；写入前比对文件内容，发现外部改动就停下。Harness 自己有跨进程锁的，使用同样的锁。
  - 不写默认供应商和默认模型。
  - ohmyswitch 的条目按供应商列表排序，只在它们已占据的位置之间调换。
  - 不碰 Harness 的登录凭据。Harness 只能从凭据库读 API Key 时，只增删 ohmyswitch 自己的条目，其他条目不读取其值。
  - 契约以 Harness 的源码为准，注明核对的版本；实现与 `docs/harness/<id>.md` 保持一致。

## 主进程

- 不使用 preload 和 `ipcMain`，新增能力一律写成 tRPC 过程；主动通知界面用 tRPC subscription。
- 日志经 cordis 的 logger 输出；日志文件只由持有单实例锁的进程打开。

## 渲染进程

- 服务端数据用 TanStack Query 管理，通过 `@/lib/trpc` 的 `trpc` 使用，不自己写请求或状态 hooks；数据变更后的缓存刷新放在 `lib/cache.ts`。
- 只有 `lib/trpc.ts` 引用主进程，且只引用类型。与后端对应的枚举从 `RouterOutputs` 派生，文案表用 `satisfies Record<..., string>` 覆盖全部取值。Harness id 是开放的，按 id 查的表要有兜底。
- 渲染进程运行在沙箱中，不使用 Electron 和 Node API。
- 用 `pnpm ui:add` 添加 shadcn 组件；尽量不改 `components/ui/`，需要定制时在 `components/` 中组合。

## 设计

本项目采用 Vercel（Geist）的设计语言。开发者的指示优先于本节。

- 颜色只用 `styles.css` 中的语义变量，不写死色值。以黑、白、灰为主，彩色只表示状态。
- 只用系统字体（字体栈在 `styles.css` 中），组件不另设字体。URL、路径、端点、版本号等机器可读的值用 `font-mono`。
- 图标：Harness 和模型厂商用 `@lobehub/icons`（Harness 用 Mono，厂商优先用 Color），按 `@lobehub/icons/es/<Name>/components/<Variant>.js` 深导入，不从包入口导入；通用图标用 lucide。
- 布局以供应商为中心：顶部是全宽的 `TopBar`，左栏是供应商列表，右栏显示选中的供应商。Harness 只在供应商详情的「应用到」中出现，不单独成页。
- 右栏页面由 `PageHeader` 和 `PageContent` 组成；从供应商详情进入的二级页面传 `backTo`。列表放在细边框的 `rounded-lg` 容器里，用 `divide-y` 分隔；空状态用 `Empty`；附加信息用 `Badge`，不用 `·` 拼接。
- 每个页面最多一个主按钮，次要操作用 `outline` 或 `ghost`。
- 添加和编辑供应商用二级页面，小范围的编辑和选择用 `Dialog`；不可恢复的操作用 `AlertDialog` 确认；操作结果用 sonner 简短提示。
- 跟随系统的深浅色。`TopBar` 是窗口的拖动区，其中可交互的元素加 `app-no-drag`。
- 界面做减法：标题、标签、按钮能说清的，不再另加说明。只有帮助用户做决定或从错误中恢复时，才加一句说明。

## UX 自查

界面质量靠设计和自查保证，不靠测试。每次改动界面，都从用户的视角把涉及的流程走一遍：

- 每一屏只有一个明确的主任务和一个主操作。
- 加载、空数据、出错、提交中、校验失败都有处理，状态切换时布局不跳动。
- 键盘可用：焦点顺序合理，对话框打开时聚焦第一个输入框，Enter 提交，Esc 关闭。
- 在最小窗口（860×560）和深色模式下不溢出、不错位；长名称、长路径会截断。
- 把文案读一遍：能删的字删掉，同一个概念始终用同一个词。
- 不可恢复的操作有确认，每个操作都有可见的结果。

## CLI

- oms 和 GUI 分开发布，CLI 发布到 npm，两者共用根目录 `package.json` 的版本号。用 `pnpm publish:cli` 发布，开发时用 `pnpm oms <args>` 运行源码。
- core 的错误信息是中文的，CLI 的校验错误自己写英文描述；能在 CLI 中预先检查的错误先检查掉。
- CLI 组装与 GUI 相同的 core 插件，读写同一份文件；不拿单实例锁，不写日志文件。
- GUI 和 CLI 共有的业务规则放在 core 的 service 里，前端只负责呈现和收集选择。
- 命令只声明一次，交互模式只是参数的另一种来源，不写只属于某一种模式的功能。只在终端中缺参数时才提示（`--json`、`--no-input`、非 TTY、CI 都不提示）。菜单中执行完一个命令后回到进入时的那一层；Esc 返回一级，Ctrl-C 在任何地方都直接退出。
- 结果写 stdout，警告、错误和提示写 stderr；`--json` 原样输出 `run` 的结果。不可恢复的操作需要 `--yes` 或交互确认。交互完成后打印等价命令。
- 退出码是对脚本的契约，不随意改动。

## 测试与验证

- 日常验证：`pnpm typecheck`、`pnpm lint`、`pnpm build`。
- 不写测试，也不运行任何 e2e 或界面自动化脚本。测试只能证明流程走得通，覆盖不了真正要紧的 UX 质量。
