# Cloudflare 部署 / Cloudflare deployment

此 fork 提供中文和英文界面，顶部可随时切换。首次访问按浏览器语言选择，选择会保存在本浏览器，也可用 `?lang=zh` 或 `?lang=en` 指定。界面语言与语音对话语言独立；切换界面不会翻译或覆盖用户资料、记忆、电话草稿与对话记录。

This fork supports Chinese and English UI. Use the language switch in the header, or `?lang=zh` / `?lang=en`. Your preference is saved in this browser. UI language is independent of conversation language, and switching it preserves user content.

## 架构 / Architecture

- Cloudflare Worker serves the Vite frontend and protects pages and API routes with Basic authentication.
- SQLite-backed Durable Objects persist memory, recent conversations, and cloned voice metadata. Account writes are serialized; large records are split into chunks within a transaction.
- Bailian conversations use WebRTC. The server exchanges SDP using server-only credentials.
- Doubao conversations use a native Cloudflare WebSocket bridge with authenticated upstream handshakes, a 5-minute limit, and a 4-call concurrency limit.
- Voice previews use a Cloudflare WebSocket compatibility adapter.
- Temporary cloning samples are stored in chunks and deleted after the provider request; an alarm cleans up abandoned samples after 15 minutes. Only random sample download URLs are exempt from login.
- Existing standalone Node deployment remains available through `npm start`.

## 部署 / Deploy

Use Node.js 24 (or a supported Node release with native TypeScript stripping).

```bash
npm ci
npm run build:cloudflare
npx wrangler login
npx wrangler deploy
npx wrangler secret put VOICE_PASSWORD
```

`VOICE_USERNAME` defaults to `admin` in `wrangler.jsonc`. The password must have at least 12 characters. Before setting the password, the Worker returns a configuration error and does not expose the site. Save secrets in Cloudflare, never in the repository.

The deployment prints a `https://voice-lab.<your-subdomain>.workers.dev` URL. The application is at `/voice-lab/`, and the phone draft page is at `/voice-lab/phone/`. The Worker uses the actual request origin; no `PUBLIC_ORIGIN` secret is needed for this deployment.

至少配置一家语音服务后才可真实对话。没有凭据时，网站、语言切换和账号记忆仍可使用，语音按钮显示未配置。

Configure at least one voice provider to enable real conversations. Without credentials, the site and memory remain usable while voice controls indicate that the provider is not configured.

```bash
npx wrangler secret put DASHSCOPE_API_KEY
npx wrangler secret put DASHSCOPE_WORKSPACE_ID
# Optional alternative / 可只配置豆包
npx wrangler secret put VOLCENGINE_APP_ID
npx wrangler secret put VOLCENGINE_ACCESS_KEY
```

Adjust non-secret region and model values in `wrangler.jsonc` to match provider permissions. A provider marked configured does not prove model permission, quota, or audio quality. Verify preview and an actual conversation with your account.

## 本地验证 / Local verification

Create an ignored `.dev.vars` file with a test password:

```dotenv
VOICE_PASSWORD=your-local-test-password
```

Then run:

```bash
npm run build:cloudflare
npx wrangler dev --port 8787
# In another terminal / 在另一个终端
node tests/cloudflare/integration.mjs
```

The integration checks use synthetic content, modify only the local emulator's account, and do not make paid model requests. They verify authentication, static routes, secret isolation, forged account headers, origin checks, durable storage including large histories, and unavailable-provider behavior.

```bash
npm test
npx tsc --noEmit
npx wrangler deploy --dry-run
```

Full-repository lint currently includes inherited errors in UI components and hooks. This fork does not change unrelated components to suppress them.

电话页仍是配置草稿，不会拨打或接听真实电话。 / The phone page remains a configuration draft and does not place or receive real calls.
