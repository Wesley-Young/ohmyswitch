# 导入链接

网站可以用 `ohmyswitch://` 链接把自己作为供应商导入 ohmyswitch。用户点击链接后，ohmyswitch 打开「导入供应商」页面并预填链接中的内容，用户确认后才保存。链接不会自动应用到任何 Harness。

## 格式

```
ohmyswitch://provider/import?name=Example
  &baseUrl=https%3A%2F%2Fapi.example.com
  &endpoint=%2Fv1%2Fmessages
  &endpoint=%2Fv1%2Fchat%2Fcompletions
  &apiKey=sk-xxx
  &iconUrl=https%3A%2F%2Fexample.com
  &model=claude-sonnet-4-5
  &model=gpt-5
```

（为了便于阅读，上面的示例分成了多行；实际链接是一行。）参数值按 `encodeURIComponent` 编码，可以用 `URLSearchParams` 生成。

| 参数 | 必填 | 可重复 | 说明 |
|---|---|---|---|
| `name` | 是 | 否 | 供应商名称，最多 128 个字符 |
| `baseUrl` | 是 | 否 | http(s) 根地址。结尾的 `/v1`、`/v1beta` 会被去掉，端点路径由 ohmyswitch 拼接 |
| `endpoint` | 是 | 是 | 支持的端点，按推荐顺序排列，导入页默认选第一个。取值见下表 |
| `apiKey` | 否 | 否 | 不提供时由用户自己填写 |
| `iconUrl` | 否 | 否 | 图标所在的网页或图片地址。不提供时使用 `baseUrl` 所在网站的图标 |
| `model` | 否 | 是 | 模型 id。模型的上下文长度等信息由 ohmyswitch 从 models.dev 补全。不提供时，用户可以在导入后获取模型 |

| `endpoint` | 协议 |
|---|---|
| `/v1/chat/completions` | OpenAI Chat Completions |
| `/v1/responses` | OpenAI Responses |
| `/v1/messages` | Anthropic Messages |
| `/v1beta/generateContent` | Google Generative AI |

- 不认识的参数和 `endpoint` 取值会被忽略。一个可用的 `endpoint` 都没有时，用户在全部端点中选择。
- 参数不合法（如 `baseUrl` 不是 http(s) 地址）不会让整个链接失效，用户在导入页的对应字段上看到错误并修改。
- 以后有不兼容的改动时会换用新的路径，`provider/import` 的含义保持不变。
- 整个链接最多 64 KB。

## 更新已有的供应商

如果已有供应商的 Base URL 与链接中的 `baseUrl` 属于同一个 origin（协议、主机、端口都相同），端点又是链接中列出的端点之一，导入页默认更新这个供应商，用户也可以改为添加新的供应商。

更新时：

- 保留原有的名称和模型，以及已经应用到的 Harness（这些 Harness 的配置会随之更新）。
- Base URL 换成链接中的。链接提供了 `apiKey`、`iconUrl` 时换成链接中的，没提供时保留原值。

适合站点为用户换了新的 API Key 后再导入一次。

## 安全

- 链接中的 API Key 会出现在网页中。请只在用户登录后的页面生成链接。
- ohmyswitch 无法知道链接来自哪个网站，所以链接中的内容都要由用户确认。用户确认之前，ohmyswitch 不会发出任何网络请求。
- ohmyswitch 不会在日志中记录链接的内容。

## 网站上的按钮

建议使用「导入到 ohmyswitch」作为按钮文案。浏览器无法得知用户是否安装了 ohmyswitch，可以在按钮旁边提示：没有反应时，请先安装 ohmyswitch。

在 Linux 上，链接能否打开取决于桌面环境是否登记了 `x-scheme-handler/ohmyswitch`。AppImage 需要借助 AppImageLauncher 等工具完成桌面集成。
