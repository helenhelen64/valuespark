# ValueSpark

ValueSpark 是一个私人 AI 思考工作台。它帮助用户捕捉灵感，在对话中澄清问题、识别假设、挑战盲区，并生成结构化洞见。

产品界面沿用原始 ValueSpark 设计资料中的品牌 Logo、暖米色视觉令牌，以及“捕捉 → 图书馆 → 双栏 Thread → 洞见”的核心信息架构。正式品牌图片位于 `assets/logo/`。

## AI 运行模式

应用会访问同源服务端代理 `/api/ai`，目前支持：

- OpenAI：GPT-5.6 Sol / Terra / Luna
- Anthropic：Claude Fable 5 / Opus 5 / Sonnet 5 / Haiku 4.5
- Google：Gemini 3.6 Flash / 3.5 Flash / 3.5 Flash-Lite
- DeepSeek：V4 Pro / V4 Flash
- Kimi：K2.6 / K2.5
- OpenRouter：Auto 或通过 `OPENROUTER_MODEL` 指定任意模型
- Ollama：Qwen 3、GPT-OSS、Gemma 3，支持环境变量指定已安装模型

设置页可以选择供应商和模型。真实 AI 有两种启用方式：

- 站点密钥：管理员在 Vercel 或本地服务端环境变量中配置，访客直接使用。
- 自带密钥：用户在设置页填写自己的 API Key。密钥只写入当前标签页的 `sessionStorage`，经 HTTPS 随每次模型请求发送给同源服务端代理，关闭标签页后由浏览器清除。服务端不会持久化、返回或记录密钥。

设置流程固定为“选择供应商 → 选择模型 → 填写 API Key”。缺少任一步时，聊天和洞见操作会返回设置页提示补全。升级前曾保存在 `localStorage` 的 Key 会由应用自动清除。

`AI_PROVIDER=auto` 会选择第一个已配置供应商。每个供应商都支持专属模型环境变量。界面中的“思考路径”是面向用户的结构摘要，包含观察、核心问题、关键假设、挑战和浮现洞见。

## 本地开发

要求 Node.js 20.6 或更高版本。

启动本地界面：

```bash
npm run dev
```

云端真实 AI：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，保留准备使用的供应商：

```dotenv
AI_PROVIDER=kimi
MOONSHOT_API_KEY=your-kimi-key
MOONSHOT_MODEL=kimi-k2.6
```

然后启动：

```bash
npm run dev
```

打开 [http://localhost:4173](http://localhost:4173)。设置页会列出全部供应商、配置状态和模型。

Ollama 本地模式：

```bash
ollama pull qwen3
```

在 `.env.local` 中填写：

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3
```

常用命令：

```bash
npm test
npm run build
npm start
```

## Vercel 部署

1. 将 `valuespark` 目录推送到 GitHub。
2. 在 Vercel 导入仓库，项目根目录指向 `valuespark`。
3. 构建命令使用 `npm run build`，输出目录使用 `dist`。
4. 在 Project Settings → Environment Variables 添加准备使用的供应商密钥，例如：
   - `MOONSHOT_API_KEY`：Kimi。
   - `OPENAI_API_KEY`：OpenAI。
   - `ANTHROPIC_API_KEY`：Claude。
   - `GEMINI_API_KEY`：Gemini。
   - `DEEPSEEK_API_KEY`：DeepSeek。
   - `OPENROUTER_API_KEY`：OpenRouter。
   - `AI_PROVIDER`：可选，设置默认供应商。
5. 重新部署，让环境变量进入新的 Serverless Function 版本。
6. 打开 `/#/settings`，确认显示“真实 AI”和预期模型。

`vercel.json` 已配置静态构建和 `/api/ai.js` Serverless Function，函数最长运行 60 秒。

## 安全与生产建议

- `.env.local` 已被 `.gitignore` 排除，仓库只保留 `.env.example`。
- 自带密钥适合个人使用；共享设备使用完成后请在设置页点击“清除”，并关闭标签页。
- 服务端限制请求体大小、对话历史长度、单字段长度，并包含每实例的轻量请求频率限制。
- 公开部署会让任何访客消耗项目的 API 配额。正式开放前建议增加登录鉴权，并在 Vercel 防火墙或网关配置持久限流和用量告警。
- 服务端向浏览器返回通用错误，详细提供方错误只写入服务端日志。

## 数据保存

Spark、对话、思考路径和洞见保存在当前浏览器的 localStorage。换浏览器或设备会得到独立数据。

## 主要文件

```text
api/ai.js       多供应商 AI 代理与结构化输出
app.js          前端状态、对话、追问、思考路径和洞见交互
server.mjs      本地静态站点与 API 开发服务器
test/ai.test.js 服务端清洗、供应商适配和响应解析测试
vercel.json     Vercel 构建与函数配置
```
