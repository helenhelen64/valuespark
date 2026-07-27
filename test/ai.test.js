import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMockChat,
  buildMockInsight,
  extractOutputText,
  getProviderCatalog,
  parseJsonText,
  requestProvider,
  resolveSelection,
  runtimeStatus,
  sanitizeRequest
} from "../api/ai.js";

const request = {
  action: "chat",
  spark: { title: "验证一个产品想法", content: "我想帮助用户整理模糊想法。" },
  userMessage: "用户第一次使用时应该看到什么？",
  messages: [{ role: "user", content: "先看具体场景。" }]
};

test("无密钥时报告 mock 模式", () => {
  const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "MOONSHOT_API_KEY", "OPENROUTER_API_KEY", "OLLAMA_BASE_URL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  assert.equal(runtimeStatus().mode, "mock");
  keys.forEach((key) => {
    if (previous[key]) process.env[key] = previous[key];
  });
});

test("供应商目录包含 Kimi 与主流服务", () => {
  const ids = getProviderCatalog().map((provider) => provider.id);
  assert.deepEqual(ids, ["openai", "anthropic", "gemini", "deepseek", "kimi", "openrouter", "ollama"]);
  const kimi = getProviderCatalog().find((provider) => provider.id === "kimi");
  assert.equal(kimi.models[0].id, process.env.MOONSHOT_MODEL || "kimi-k2.6");
});

test("选择未配置的 Kimi 会保留模型并进入演示模式", () => {
  const previous = process.env.MOONSHOT_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  const selection = resolveSelection("kimi", "kimi-k2.5");
  assert.equal(selection.id, "kimi");
  assert.equal(selection.model, "kimi-k2.5");
  assert.equal(selection.configured, false);
  if (previous) process.env.MOONSHOT_API_KEY = previous;
});

test("请求清洗会限制历史并规范角色", () => {
  const clean = sanitizeRequest({
    ...request,
    apiKey: "  sk-session-test  ",
    messages: Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "ai" : "user", content: `消息 ${index}` }))
  });
  assert.equal(clean.messages.length, 16);
  assert.equal(clean.messages.at(-1).role, "assistant");
  assert.equal(clean.apiKey, "sk-session-test");
});

test("当前会话 API Key 可以启用未配置的供应商", () => {
  const previous = process.env.MOONSHOT_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  const selection = resolveSelection("kimi", "kimi-k2.5", "session-kimi-key");
  assert.equal(selection.configured, true);
  assert.equal(selection.apiKey, "session-kimi-key");
  if (previous) process.env.MOONSHOT_API_KEY = previous;
});

test("mock 对话包含回复、追问和思考路径", () => {
  const data = buildMockChat(sanitizeRequest(request));
  assert.ok(data.reply.length > 10);
  assert.equal(data.followUpQuestions.length, 3);
  assert.ok(data.thinkingPath.coreQuestion);
});

test("mock 洞见满足前端结构", () => {
  const data = buildMockInsight(sanitizeRequest({ ...request, action: "insight" }));
  assert.equal(data.keyAssumptions.length, 3);
  assert.equal(data.nextActions.length, 3);
  assert.ok(data.finalSummary);
});

test("可从 Responses API 原始响应提取文本", () => {
  const text = extractOutputText({
    output: [{ type: "message", content: [{ type: "output_text", text: "{\"ok\":true}" }] }]
  });
  assert.equal(text, "{\"ok\":true}");
});

test("兼容供应商的 JSON 代码块可以被解析", () => {
  assert.deepEqual(parseJsonText("```json\n{\"ok\":true}\n```"), { ok: true });
});

test("Kimi 适配器使用 Moonshot 端点与所选模型", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.MOONSHOT_API_KEY;
  let captured;
  process.env.MOONSHOT_API_KEY = "test-key";
  globalThis.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(buildMockChat(sanitizeRequest(request))) } }]
      })
    };
  };

  try {
    const selection = resolveSelection("kimi", "kimi-k2.6");
    const data = await requestProvider(sanitizeRequest({ ...request, provider: "kimi", model: "kimi-k2.6" }), selection);
    assert.equal(captured.url, "https://api.moonshot.ai/v1/chat/completions");
    assert.equal(captured.options.headers.Authorization, "Bearer test-key");
    assert.equal(captured.body.model, "kimi-k2.6");
    assert.deepEqual(captured.body.thinking, { type: "disabled" });
    assert.equal(captured.body.max_completion_tokens, 2200);
    assert.ok(data.reply);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.MOONSHOT_API_KEY = previousKey;
    else delete process.env.MOONSHOT_API_KEY;
  }
});
