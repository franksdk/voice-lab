# Voice Lab

本 fork 新增中英双语界面及 Cloudflare Workers 完整部署适配，详见 [Cloudflare 部署与双语说明](CLOUDFLARE.md)。 / This fork adds Chinese/English UI and a Cloudflare Workers deployment. See [deployment instructions](CLOUDFLARE.md).

实时语音对话体验站，包含网页界面、阿里百炼与豆包实时语音适配、账号记忆、近期对话保存、音色试听和百炼音色复刻。使用独立 Node 服务和浏览器账号登录，不依赖原网站服务器或 ChatGPT 登录。

本仓库包含 Voice Lab 的前后端代码；模型推理由云厂商提供，不包含模型权重。电话页面目前用于整理接入配置草稿，**尚未实现真实电话拨打或接听**。

## 目录

- [快速启动](#快速启动)
- [模型凭据与环境变量](#模型凭据与环境变量)
- [网页使用方法](#网页使用方法)
- [记忆、知识库与数据保存](#记忆知识库与数据保存)
- [音色复刻](#音色复刻)
- [公网 HTTPS 部署](#公网-https-部署)
- [账号与访问保护](#账号与访问保护)
- [电话功能的范围](#电话功能的范围)
- [开发、验证与更新](#开发验证与更新)
- [常见问题](#常见问题)

## 快速启动

### 1. 准备环境

- Node.js **22.18 或更新版本**，建议使用 Node.js 24；低版本可能无法直接加载服务端引用的 TypeScript 文件。
- npm、Git，以及能使用麦克风的浏览器，建议先用新版 Chrome 或 Edge 验证。
- 至少一家厂商的实时语音服务凭据、对应模型权限和可用额度。两家不必同时配置。
- 电脑与服务器能够访问所选厂商的接口。百炼 WebRTC 对话还需要浏览器能够建立厂商的媒体连接。

### 2. 获取代码并安装依赖

```bash
git clone https://github.com/Zhong-fan/voice-lab.git
cd voice-lab
npm ci
```

### 3. 创建 `.env`

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

Linux / macOS：

```bash
cp .env.example .env
```

用编辑器打开项目根目录的 `.env`，至少填写：

1. `VOICE_PASSWORD`：自己设置的登录密码，至少 12 个字符；可同时修改默认用户名 `VOICE_USERNAME=demo`。
2. 所选厂商的凭据，见下方配置表。另一家的凭据可以留空。

其余字段可保留示例中的本地默认值。没有模型凭据也能启动网站、登录和测试记忆保存，但不能生成语音或进行语音对话。

### 4. 构建并启动

```bash
npm run build
npm start
```

打开 **http://localhost:8080/voice-lab/**，在浏览器弹出的登录框输入 `.env` 中的用户名和密码，再允许麦克风权限。访问根路径 `/` 也会跳转到体验页。

`npm start` 自动读取项目根目录的 `.env`，更改配置后需要重启。运行命令时应位于项目根目录；已有同名系统环境变量会优先于 `.env`。值包含 `#` 或空格时，用引号包住完整值。

> 本地请使用与 `PUBLIC_ORIGIN` 完全一致的地址：`localhost` 和 `127.0.0.1` 不是同一个源站。手机不能用它自己的 `localhost` 访问电脑服务；跨设备测试请使用下方的 HTTPS 部署方式。

## 模型凭据与环境变量

### 厂商配置

| 厂商 | 必填配置 | 获取与检查 |
| --- | --- | --- |
| 阿里百炼 | `DASHSCOPE_API_KEY`、`DASHSCOPE_WORKSPACE_ID` | 在百炼创建 API Key，确认它有目标业务空间及实时模型权限。业务空间 ID **不是** API Key 列表里的 Key ID，也不是密钥的一部分。配置地域须与业务空间对应。 |
| 豆包实时语音 | `VOLCENGINE_APP_ID`、`VOLCENGINE_ACCESS_KEY` | 使用火山引擎**语音服务**应用的 App ID 和 Access Token，开通端到端实时语音服务。普通火山方舟文本模型 API Key 不能直接替代这两个字段。 |

官方入口：[百炼 API Key 获取说明](https://help.aliyun.com/zh/model-studio/get-api-key)、[百炼实时语音使用指南](https://help.aliyun.com/zh/model-studio/qwen-audio-realtime-user-guides)、[火山语音控制台](https://console.volcengine.com/speech/app)、[豆包实时语音 API 接入文档](https://docs.volcengine.com/docs/DoubaoVoice/End-to-endreal-timespeechlargemodelAPIaccessdocument?lang=zh)。

凭据保存在服务端，浏览器不会获得长期厂商密钥。网页显示“已配置”只说明字段通过配置检查，不能证明厂商已授予权限或余额足够；这些需要实际发起对话确认。试听、对话和音色创建可能产生厂商费用。

### `.env` 字段说明

| 字段 | 默认 / 示例 | 作用与要求 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 空 | 百炼服务端 API Key；使用百炼时必填。 |
| `DASHSCOPE_WORKSPACE_ID` | 空 | 百炼业务空间 ID；使用百炼时必填。用于构造业务空间专属接口域名。 |
| `DASHSCOPE_REGION` | `cn-beijing` | 当前代码接受 `cn-beijing` 或 `ap-southeast-1`；对应地域是否开放所选模型，以厂商账号为准。 |
| `DASHSCOPE_MODEL` | `qwen-audio-3.0-realtime-flash` | 百炼实时模型名称；可选值见下文。 |
| `VOLCENGINE_APP_ID` | 空 | 火山语音应用 App ID；使用豆包时必填。 |
| `VOLCENGINE_ACCESS_KEY` | 空 | 火山语音 Access Token，对应接口的 `X-Api-Access-Key`；不是 RAM AccessKey Secret。 |
| `DEMO_ACCESS_CODE` | 空 | 保留的旧体验码配置。**必须留空**，当前网页没有输入体验码的入口。 |
| `PUBLIC_ORIGIN` | `http://localhost:8080` | 浏览器实际访问的源站，只包含协议、主机和端口，不能带 `/voice-lab/` 或尾斜杠。公网必须使用 HTTPS。 |
| `AUTH_MODE` | `basic` | `basic` 为内置单账号登录；`gateway` 为已有可信认证代理的进阶模式。 |
| `VOICE_USERNAME` | `demo` | basic 模式的用户名；1–64 个字符，仅字母、数字、下划线、短横线。也是数据隔离标识。 |
| `VOICE_PASSWORD` | 空 | basic 模式必填，至少 12 个字符；不要使用示例密码或提交到 Git。 |
| `INTERNAL_GATEWAY_TOKEN` | 空 | basic 模式可留空，由服务生成。gateway 模式必须设置随机密钥，与认证代理一致。 |
| `DATA_DIR` | `./data` | 私人数据目录；相对路径基于启动时的工作目录。生产环境建议设为固定绝对路径并确保服务用户可写。 |
| `HOST` | `127.0.0.1` | Node 监听地址；本地或反向代理部署保留回环地址即可。 |
| `PORT` | `8080` | Node 监听端口，范围 1–65535。本地改端口时须同时修改 `PUBLIC_ORIGIN`。 |

当前百炼配置白名单为 `qwen-audio-3.0-realtime-flash`、`qwen-audio-3.0-realtime-plus`、`qwen3.5-omni-flash-realtime`、`qwen3.5-omni-plus-realtime`，见 [`lib/session.ts`](lib/session.ts)。这表示代码接受这些名称，不保证每个地域、账号和音色都可用。切换模型后请重新验证试听与对话；页面的厂商卡片名称不用于反映全部模型版本。

豆包适配的模型参数在 [`selfhost/doubao.mjs`](selfhost/doubao.mjs) 中设置，当前使用 `dialog.extra.model = '1.2.1.1'`，没有对应的 `.env` 切换项。

## 网页使用方法

1. 登录后，在“选择语音模型”中选择阿里百炼或豆包语音。未配置的厂商不能开始对话。
2. 选择对话语言和顾问音色。切换语言时，网页会按当前配置筛选系统音色；完整列表在 [`lib/voice-options.ts`](lib/voice-options.ts)。
3. 点击“试听当前语言与音色”，先确认是否能生成并播放声音。如果浏览器禁止自动播放，点击音频播放器。
4. 选择企业咨询、课程沟通或客户回访场景；可在“补充产品资料”中填入本次对话的信息。
5. 点击“开始对话”，允许麦克风，像正常聊天一样说话。可中途打断模型，使用静音按钮暂停发送麦克风声音，或点击“结束通话”。
6. 单次体验最多 5 分钟。结束后可以更换厂商、语言或音色，再开始一次。

网页中列出的语种和方言是当前实现的**测试选项**，通过提示词及厂商参数影响生成语言。它们不代表所有组合都完成了真人听感验收；需要逐项检查识别、回复语言、发音与音色是否符合预期。这里的语言选择也不是同声传译模式。

## 记忆、知识库与数据保存

展开“账号记忆与音色”，填写长期记忆并点击“保存记忆”。它绑定认证用户名，服务重启后仍保存。结束或出错的对话有文字内容时，网页会尝试自动保存近期记录。

当前实现是**人工维护的记忆 + 有限近期对话上下文**，没有自动提取记忆、文档上传、向量数据库或检索知识库。补充资料和记忆可帮助模型理解业务，但不能保证它完全遵守或回答正确。

| 数据 | 当前行为 |
| --- | --- |
| 长期记忆 | 字符上限为 8000，同时保存请求的 JSON 不能超过 9000 字节；较长中文内容可能先达到字节限制。页面提供编辑和保存入口。 |
| 近期对话 | 每个账号保留最近 10 次；每次最多 40 条文字，每条最多 1000 个字符。页面显示保留次数，尚无完整历史浏览或单条删除界面。 |
| 下次对话上下文 | 选取最近 3 次对话中的最后 30 条文字，与长期记忆、本次补充资料拼接；**当前网页最终截取前 1500 个字符**，超出部分不会进入本次模型提示。 |
| 自定义音色 | 保存厂商音色 ID、名称与同步状态，每个账号最多 20 个；实际音色模型由厂商保存。 |
| 电话配置草稿 | 保存到当前浏览器的 localStorage，不属于服务端账号记忆。清除浏览器数据会删除它，可先下载草稿。 |

服务端账号文件位于 `DATA_DIR/<用户名的 SHA-256>.json`。哈希文件名用于避免直接以账号名拼路径，不代表内容加密。改变用户名会切换到另一份数据；仅更改密码不会改变账号数据。

程序不持久保存日常对话录音，但会向厂商发送语音，并按上述规则保存对话文字。复刻录音是例外，会短期写入 `DATA_DIR/voice-samples/` 供厂商读取，详见下一节。

备份时停服或在没有写入操作时复制整个 `DATA_DIR`，同时私下保留 `.env`。恢复时使用相同用户名，并让服务指向恢复后的数据目录。`.env` 和默认 `data/` 已被 Git 忽略；如把数据路径改到其他项目内目录，需要自行补充忽略规则。不要把私人备份放入公开仓库。

## 音色复刻

当前页面提供**百炼**音色创建、同步状态和删除；没有实现豆包复刻流程。

使用前需要：百炼复刻权限、与当前实时模型兼容的复刻服务，以及厂商能访问的公网 HTTPS 源站。localhost 可测试对话、记忆和试听，**无法让厂商下载复刻录音**，服务会在请求厂商前拒绝本地复刻。

操作步骤：

1. 展开“账号记忆与音色”，在“复刻新音色”填写名称。
2. 上传本人或已获授权的清晰录音，页面建议 10–20 秒，接受 WAV、MP3 或 M4A 对应的 `audio/wav`、`audio/mpeg`、`audio/mp4` MIME 类型，文件不超过 5,000,000 字节。厂商还有自己的录音质量要求。
3. 勾选声音使用授权，点击“创建音色”。成功后，新音色加入当前账号的可选列表，并自动选中。
4. 点击“同步”核对已保存音色在百炼的状态。此按钮不是导入百炼账号中的全部音色。
5. 删除时会请求百炼删除该音色，并移除当前账号的记录；页面会要求确认。

已创建音色的本地记录会随账号数据持续保存，实际可用期受厂商规则和账号状态影响。删除本地数据不等于删除厂商的音色。

录音通过随机 64 位十六进制 token 的 URL 临时提供下载。创建请求结束后会尝试立即删除录音，同时设有 10 分钟清理计时；下载接口拒绝超过 15 分钟的文件。进程异常退出可能留下文件，过期检查不等于全目录自动清扫，运维可清理遗留样本。拿到有效样本 URL 的人可在有效期内下载录音，因此不要分享或记录该 URL。

## 公网 HTTPS 部署

本地运行不需要 Nginx。公网需要自己的域名、有效 TLS 证书和支持 WebSocket 的反向代理；这些不由 `.env` 自动创建。默认 Node 仅监听回环地址，公网入口由代理提供。

### 1. 修改环境变量

```dotenv
PUBLIC_ORIGIN=https://voice.example.com
HOST=127.0.0.1
PORT=8080
AUTH_MODE=basic
```

`voice.example.com` 是占位域名，请换成自己的域名。`PUBLIC_ORIGIN` 不带路径和尾斜杠，网页仍位于 `/voice-lab/`。其余凭据、账号和数据路径仍按前文填写。

### 2. 配置反向代理

以下为 Nginx 示例，域名、证书路径须替换为实际值。`map` 放在 `http` 作用域；`server` 可放在该作用域引入的站点配置中。

```nginx
map $http_upgrade $voice_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    server_name voice.example.com;
    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location = /voice-lab {
        return 302 /voice-lab/;
    }

    location /voice-lab/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Origin $http_origin;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $voice_connection_upgrade;
        proxy_read_timeout 360s;
        proxy_send_timeout 360s;
        proxy_buffering off;
        client_max_body_size 8m;
    }
}
```

`proxy_pass` 保留请求中的 `/voice-lab/` 路径，不要在其后添加 `/` 造成路径被替换。部署前执行 `nginx -t` 检查配置，再按自己的服务器管理方式重新加载 Nginx。

使用进程管理器或系统服务运行 `npm start`，工作目录必须是项目根目录。仅向公网开放 HTTPS 入口，Node 端口保持内网可达。此示例包含请求体限制；多用户环境还需按实际规模配置代理限流和厂商消费额度。

### 3. 验证外网入口

- 用未登录浏览器打开 `https://自己的域名/voice-lab/`，确认出现账号登录框。
- 登录后验证服务状态、记忆保存、音色试听与真实语音对话；豆包需确认 WebSocket 能连接。
- 在手机上通过同一个 HTTPS 地址测试麦克风和播放权限。
- 需要复刻时，确认厂商可访问样本下载路径。不要在外部代理给该路径再次加登录拦截，也不要将整站认证取消。

## 账号与访问保护

默认 `AUTH_MODE=basic` 在 Node 服务入口保护页面、HTTP API 和豆包 WebSocket，使用 `.env` 中的**一个账号**。服务会覆盖外部传入的账号头，写入接口检查 Origin，并限制失败登录尝试。短期随机样本 GET 路径是唯一供厂商读取录音的认证例外。

这是浏览器原生 Basic Auth，不是注册系统：没有网页注册、找回密码、角色管理或退出登录按钮。浏览器可能缓存凭据，更换账号或验证未登录状态时可用无痕窗口。多人共享同一个用户名也会共享记忆和音色。

已有多账号认证代理时，可显式使用 `AUTH_MODE=gateway`：

- 设置随机 `INTERNAL_GATEWAY_TOKEN`，保持 Node 只允许可信代理访问。
- 代理先认证账号，再**覆盖** `X-Voice-Gateway` 和 `X-Voice-User`；不能透传客户端伪造的值。
- 为录音样本下载设置单独的受限规则：仅允许 GET 与规范随机 token 路径，并注入内部网关头。
- 转发正确 Origin 和 WebSocket Upgrade；不同用户使用不同且稳定的账号标识。

gateway 模式没有随仓库提供完整的多用户认证代理实现。没有这套基础设施时，保留默认 basic 模式即可。

## 电话功能的范围

`/voice-lab/phone/` 提供助手、开场白和阿里云资源标识的配置草稿，可以在本浏览器保存或下载。它**不会**验证或绑定云资源，也没有拨号按钮、真实呼入接听、PSTN/SIP/Twilio 网关或电话计费逻辑。

本仓库不包含其他项目中的独立电话网关。要实现电话客服，需要另行接入号码与线路、电话媒体桥接、音频格式转换、呼叫事件及业务工具，并进行真实通话验收。网页对话成功不能证明真实电话已经接通。

## 开发、验证与更新

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm ci` | 按锁文件安装依赖。 |
| `npm run build` | 构建完整网页到 `dist-selfhost/`。 |
| `npm start` | 加载 `.env`，启动完整 Node HTTP/WebSocket 服务。 |
| `npm run dev` | 构建后启动的快捷方式；**没有前端热更新**，修改前端后重新运行。 |
| `npm run build:selfhost` / `npm run start:selfhost` | 对应 build / start 的兼容别名。 |
| `npm test` | 运行 Node 自动测试。 |
| `npx tsc --noEmit` | TypeScript 类型检查。 |
| `npm run lint` | 运行代码静态检查。 |

### 代码结构

```text
components/                 网页语音、电话草稿与 UI 组件
hooks/use-voice.ts           百炼 WebRTC 对话
hooks/use-doubao.ts          豆包浏览器音频与 WebSocket 对话
lib/                        场景提示、模型配置、语言与音色选项
selfhost/server.mjs         独立服务启动、认证与 Origin 检查
selfhost/handler.mjs        网页静态资源和 HTTP API 路由
selfhost/account.mjs        账号数据、记忆、对话记录与百炼复刻
selfhost/doubao.mjs         豆包服务端 WebSocket 与二进制协议适配
selfhost/preview.mjs        音色试听
tests/                      自动测试
vite.selfhost.config.ts     自部署网页构建配置
.env.example                无真实凭据的配置模板
```

自部署入口是 `selfhost/server.mjs`，不能只启动另一套前端开发服务器来替代完整服务。`app/api/` 中保留的路由不是本仓库全部账号、音色和 WebSocket 能力的入口。

### 验证方式与限制

```bash
npm test
npx tsc --noEmit
npm run build
```

自动测试覆盖模型参数、协议处理、HTTP/WebSocket 认证边界、伪造账号头、跨源请求、账号数据持久化，以及从环境文件启动服务。测试使用合成凭据和测试替身，不发起真实电话或付费模型请求。

实际验收还需使用自己的账号和设备，分别验证两家厂商、所需语言与音色、插话、结束通话、重启后的记忆，以及公网音色复刻。自动测试通过不代表模型权限、听感或所有语言组合均已验收。

### 更新已有部署

先备份 `.env` 和 `DATA_DIR`，然后在项目根目录执行：

```bash
git pull --ff-only
npm ci
npm run build
```

通过原进程管理器重启服务。不要用清空项目目录的方式更新，也不要用 `git clean -xfd` 删除本地配置和数据。更新后重新确认未登录访问保护和常用对话功能。

## 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 启动提示找不到 `.env` | 确认已复制模板，且在项目根目录执行 `npm start`。 |
| 启动提示用户名、密码或 Origin 无效 | 密码至少 12 字符，用户名符合配置表规则；Origin 不含路径和尾斜杠，公网用 HTTPS。 |
| TypeScript 加载或语法报错 | 检查 `node --version`，使用 Node 22.18+；安装后重新构建。 |
| 端口占用 `EADDRINUSE` | 关闭已有服务或修改 `PORT`；本地同时修改 `PUBLIC_ORIGIN` 的端口。 |
| 页面 401 / 反复要求登录 | 使用 `.env` 中的账号密码，重启使新配置生效；排除浏览器缓存的旧凭据。代理需保留 Authorization。 |
| 已登录但百炼创建会话返回 401 | 确认 `DEMO_ACCESS_CODE` 留空，并检查服务商密钥及账号权限。 |
| 429 / Too many login attempts | 等待约一分钟后重试；检查密码是否正确。反向代理场景下失败计数按代理连接地址累计。 |
| 保存记忆或开始对话返回 403 | 地址栏源站必须与 `PUBLIC_ORIGIN` 完全一致；检查代理是否保留 Origin。不要混用 localhost、IP、不同端口或域名。 |
| 首页 404 / 页面无样式 | 先执行 `npm run build`；代理必须保留 `/voice-lab/` 路径，不能只转发 HTML 而漏掉资源。 |
| 模型显示未配置 / API 503 | 填写该厂商所需字段并重启。百炼还会检查业务空间格式、模型白名单和地域；豆包实时连接也有并发上限。 |
| 模型报错、502 或连接超时 | 检查服务权限、地域、余额与网络；百炼 WebRTC 还需排查浏览器媒体连接，豆包需检查代理 Upgrade 和长连接超时。 |
| 无法使用麦克风 | 使用 localhost 或有效 HTTPS；允许站点麦克风权限，检查设备是否被其他程序占用。普通局域网 HTTP 地址不能替代 HTTPS。 |
| 已连接但没有声音 | 检查系统输出设备、音量、网页静音和浏览器自动播放；出现“点击开启声音”时点击解锁。先用试听定位问题。 |
| 复刻提示需要公网 HTTPS | 按部署章节配置自己的公网域名，确保厂商可下载临时样本；仅修改 Origin 为不存在的域名无效。 |
| 复刻失败或上传格式不通过 | 检查复刻权限、目标模型兼容性、录音 MIME 类型、大小及清晰度；查看厂商官方录音要求。 |
| 重启后记忆或自定义音色消失 | 检查用户名是否变化、`DATA_DIR` 是否指向原目录、服务用户是否有写权限，容器部署是否挂载持久卷。 |
| 网页有电话页但不能拨号 | 当前电话页仅保存配置草稿；还未接入真实电话线路和网关。 |

排查时可以提供浏览器报错、HTTP 状态和已脱敏的服务日志，**不要提交 `.env`、密码、API Key 或复刻样本 URL**。
