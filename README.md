# Voice Lab

一个用于体验实时语音对话的网页项目，包含浏览器端语音界面、百炼和豆包实时语音服务适配，以及独立部署所需的服务端入口。

## 本地运行

需要 Node.js 22.13 或更新版本。

```bash
npm ci
npm run dev
```

浏览器需要麦克风权限；非 `localhost` 环境请通过 HTTPS 访问。

## 配置模型

复制 `.env.example` 为 `.env`，再按需填写自己账号的模型凭据。百炼需要 `DASHSCOPE_API_KEY` 和 `DASHSCOPE_WORKSPACE_ID`；豆包实时语音需要 `VOLCENGINE_APP_ID` 和 `VOLCENGINE_ACCESS_KEY`。独立服务还需要 `PUBLIC_ORIGIN` 和 `INTERNAL_GATEWAY_TOKEN`。密钥只放在服务端环境变量中，不要提交 `.env`，也不要放到浏览器代码里。

独立服务构建命令为 `npm run build:selfhost`；运行服务前需配置 `PUBLIC_ORIGIN`、`INTERNAL_GATEWAY_TOKEN` 及所选模型的服务端凭据，然后运行 `node selfhost/server.mjs`。

## 验证

```bash
npm test
npm run build:selfhost
```

真实语音效果取决于模型账号的权限、额度和配置。本仓库只包含 Voice Lab 网站，不包含其他电话网关项目或服务器部署脚本。
