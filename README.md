# ohmyswitch

Provider-first config manager for AI coding harnesses.

## 安装

### CLI

```sh
npm i -g ohmyswitch
```

需要 Node.js 24.14+ 和 npm，支持 Windows、macOS、Linux。安装后使用 `ohmyswitch` 或 `oms` 命令启动。

### App

暂无稳定版本，目前请前往 [Actions](https://github.com/Wesley-Young/ohmyswitch/actions/workflows/build-app.yml) 下载最新的构建产物。仅支持 Windows (x64) 和 macOS (arm64)。

## 开发

需要 Node.js 24.14+ 和 pnpm v12。

```sh
pnpm install
pnpm dev
```

## 常用命令

```sh
pnpm typecheck      # 类型检查
pnpm lint           # Biome 检查
pnpm format         # 格式化
pnpm build          # 构建主进程和界面
pnpm package        # 打包为未签名的本地应用（dist/）
pnpm ui:add <name>  # 添加 shadcn/ui 组件
```
