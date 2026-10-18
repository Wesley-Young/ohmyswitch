# 插件配置

ohmyswitch 的 Harness 都是内置插件，默认全部启用。启用哪些由配置目录中的两个文件决定（Linux 是 `~/.config/ohmyswitch`，macOS 是 `~/Library/Application Support/ohmyswitch`，Windows 是 `%APPDATA%\ohmyswitch`；设置了 `OHMYSWITCH_HOME` 时是其中的 `config/`），组合方式和 DeepSeek Harness profile 的 `cordis.yml`、`cordis.patch.yml` 相同：

| 文件 | 内容 | 谁来写 |
|---|---|---|
| `plugins.yml` | 插件列表，每个插件一项 | ohmyswitch 通过 cordis Loader 维护，界面上的启用、停用写在这里。也可以手动编辑 |
| `plugins.patch.yml` | 叠在 `plugins.yml` 上的 patch，可选 | 用户或 agent。ohmyswitch 只读不写 |

两个文件保存后都会立即应用，不用重启。由 `src/core/plugins/service.ts` 的 `PluginService` 负责：它用 cordis Include 挂载 `plugins.yml`，把 `plugins.patch.yml` 作为 patches 交给它，按 Include 的 patch 语义组合。

## plugins.yml

```yaml
- id: opencode
  name: cordis:harness-opencode
- id: pi
  name: cordis:harness-pi
  disabled: true
- id: dsh
  name: cordis:harness-dsh
- id: omp
  name: cordis:harness-omp
```

文件的顶层是一个列表，每一项对应一个插件：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 否 | 这一项的标识，在文件中唯一，不能包含 `:`。省略时 Loader 会分配一个，下次写入文件时补上 |
| `name` | 是 | 加载哪个插件，取值见下表 |
| `disabled` | 否 | 为 `true` 时停用 |

| `name` | 插件 |
|---|---|
| `cordis:harness-opencode` | OpenCode |
| `cordis:harness-pi` | Pi |
| `cordis:harness-dsh` | DeepSeek Harness |
| `cordis:harness-omp` | omp |

- 文件不存在时，ohmyswitch 按上表创建。文件中缺少的内置插件会在启动时补到末尾（新版本附带的插件也是这样出现的），所以停用插件请写 `disabled: true`，删掉的项下次启动会回来。
- ohmyswitch 写回这个文件时会重新生成整个文件，注释不会保留。需要注释时请写在 `plugins.patch.yml` 中。
- 只能加载上表中的内置插件。其他 `name`（包括文件路径和 npm 包名）不会被加载，在插件页面显示为错误。同一个插件出现两次时，后加载的那一项会失败。

## plugins.patch.yml

```yaml
# 不用 DeepSeek Harness
- id: dsh
  disabled: true
```

文件的顶层是一个 patch 列表，文件不存在或为空时等于空列表。每个 patch 按 `id` 指向 `plugins.yml` 中的一项，覆盖其中的字段；同一个 `id` 有多个 patch 时，后面的覆盖前面的。指向不存在的 `id` 的 patch 会被忽略，并记录一条警告。patch 也可以用 `insert` 插入新的项，同样只能加载内置插件。

- patch 覆盖了某个插件的 `disabled` 时，这个插件是否启用由 patch 决定，界面上的开关不可用，显示「由 plugins.patch.yml 决定」。patch 插入的项也是这样。要在界面上切换，先删掉对应的 patch。
- ohmyswitch 不写这个文件，注释和格式都保持原样。

两个文件都不要写 `!!js` 标签：Loader 会把它当作 JavaScript 执行。Harness 之间相互独立，按名称排列，不提供排序。

## 停用 Harness 的效果

停用一个 Harness 后，它不再列出，也不再同步。已应用的供应商在 `store.json` 中的记录原样保留，它的配置文件不会被修改。重新启用后，这些记录照常显示和同步。

## 出错

- 任一文件格式有误（YAML 无法解析、顶层不是列表或某一项不是映射）时，ohmyswitch 记录警告，继续使用上次读取的配置，插件页面显示错误，此时界面上不能启用或停用插件。修正并保存后自动生效。
- 启动时任一文件就有误的，先不加载任何插件，以免把用户停用的 Harness 重新启用。
- `plugins.yml` 的写回由 Include 负责：原子写入，写入前比对文件内容，文件被改动过时先重新读取再合并，冲突时以文件为准。
