const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 20;
const REQUEST_TIMEOUT_MS = 55_000;
const rateLimits = new Map();

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    envModel: "OPENAI_MODEL",
    models: [
      ["gpt-5.6-sol", "GPT-5.6 Sol"],
      ["gpt-5.6-terra", "GPT-5.6 Terra"],
      ["gpt-5.6-luna", "GPT-5.6 Luna"]
    ]
  },
  {
    id: "anthropic",
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    envModel: "ANTHROPIC_MODEL",
    models: [
      ["claude-sonnet-5", "Claude Sonnet 5"],
      ["claude-opus-5", "Claude Opus 5"],
      ["claude-fable-5", "Claude Fable 5"],
      ["claude-haiku-4-5", "Claude Haiku 4.5"]
    ]
  },
  {
    id: "gemini",
    label: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    envModel: "GEMINI_MODEL",
    models: [
      ["gemini-3.6-flash", "Gemini 3.6 Flash"],
      ["gemini-3.5-flash", "Gemini 3.5 Flash"],
      ["gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite"]
    ]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    envModel: "DEEPSEEK_MODEL",
    models: [
      ["deepseek-v4-pro", "DeepSeek V4 Pro"],
      ["deepseek-v4-flash", "DeepSeek V4 Flash"]
    ]
  },
  {
    id: "kimi",
    label: "Kimi",
    envKey: "MOONSHOT_API_KEY",
    envModel: "MOONSHOT_MODEL",
    models: [
      ["kimi-k2.6", "Kimi K2.6"],
      ["kimi-k2.5", "Kimi K2.5"]
    ]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    envModel: "OPENROUTER_MODEL",
    models: [["openrouter/auto", "OpenRouter Auto"]]
  },
  {
    id: "ollama",
    label: "Ollama 本地",
    envKey: "OLLAMA_BASE_URL",
    envModel: "OLLAMA_MODEL",
    models: [
      ["qwen3", "Qwen 3"],
      ["gpt-oss:20b", "GPT-OSS 20B"],
      ["gemma3", "Gemma 3"]
    ]
  }
];

const chatSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "followUpQuestions", "thinkingPath"],
  properties: {
    reply: { type: "string" },
    followUpQuestions: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" }
    },
    thinkingPath: {
      type: "object",
      additionalProperties: false,
      required: ["observation", "coreQuestion", "keyAssumption", "challenge", "emergingInsight"],
      properties: {
        observation: { type: "string" },
        coreQuestion: { type: "string" },
        keyAssumption: { type: "string" },
        challenge: { type: "string" },
        emergingInsight: { type: "string" }
      }
    }
  }
};

const insightSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "coreQuestion",
    "keyAssumptions",
    "challenges",
    "emergingInsight",
    "nextActions",
    "finalSummary"
  ],
  properties: {
    coreQuestion: { type: "string" },
    keyAssumptions: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    },
    challenges: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    },
    emergingInsight: { type: "string" },
    nextActions: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    },
    finalSummary: { type: "string" }
  }
};

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method === "GET") {
    return sendJson(res, 200, runtimeStatus());
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "仅支持 GET 和 POST。" });
  }

  if (!consumeRateLimit(clientAddress(req))) {
    return sendJson(res, 429, { error: "请求过于频繁，请稍后再试。" });
  }

  try {
    const body = sanitizeRequest(await readJsonBody(req));
    const selection = resolveSelection(body.provider, body.model);
    if (!selection.configured) {
      const data = body.action === "chat" ? buildMockChat(body) : buildMockInsight(body);
      return sendJson(res, 200, {
        mode: "mock",
        provider: selection.publicProvider,
        model: selection.model,
        data
      });
    }

    const data = await requestProvider(body, selection);
    return sendJson(res, 200, {
      mode: "live",
      provider: selection.publicProvider,
      model: selection.model,
      data
    });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const message = status >= 500 ? "AI 服务暂时不可用，请稍后再试。" : error.message;
    console.error("[ValueSpark AI]", error);
    return sendJson(res, status, { error: message });
  }
}

export function getProviderCatalog() {
  return PROVIDERS.map((provider) => {
    const override = cleanText(process.env[provider.envModel], 160);
    const models = [...provider.models];
    if (override && !models.some(([id]) => id === override)) {
      models.unshift([override, `${override}（环境变量）`]);
    }
    return {
      id: provider.id,
      label: provider.label,
      configured: Boolean(process.env[provider.envKey]),
      models: models.map(([id, label]) => ({ id, label }))
    };
  });
}

export function runtimeStatus() {
  const providers = getProviderCatalog();
  const preferred = cleanText(process.env.AI_PROVIDER, 32);
  const active = providers.find((item) => item.id === preferred && item.configured)
    || providers.find((item) => item.configured);
  return {
    mode: active ? "live" : "mock",
    provider: active ? { id: active.id, label: active.label } : { id: "mock", label: "ValueSpark Mock" },
    model: active ? active.models[0].id : "ValueSpark Mock",
    providers
  };
}

export function sanitizeRequest(input) {
  if (!input || typeof input !== "object") throw httpError(400, "请求内容无效。");
  const action = input.action;
  if (action !== "chat" && action !== "insight") throw httpError(400, "未知的 AI 操作。");

  const spark = input.spark;
  if (!spark || typeof spark !== "object") throw httpError(400, "缺少 Spark。");
  const title = cleanText(spark.title, 240);
  const content = cleanText(spark.content, 8_000);
  if (!title || !content) throw httpError(400, "Spark 标题和内容不能为空。");

  const messages = Array.isArray(input.messages)
    ? input.messages.slice(-16).map((message) => ({
        role: message?.role === "ai" ? "assistant" : "user",
        content: cleanText(message?.content, 4_000)
      })).filter((message) => message.content)
    : [];

  return {
    action,
    spark: { title, content },
    messages,
    userMessage: cleanText(input.userMessage, 4_000),
    provider: cleanText(input.provider, 32) || "auto",
    model: cleanText(input.model, 160)
  };
}

export function resolveSelection(requestedProvider = "auto", requestedModel = "") {
  const catalog = getProviderCatalog();
  const preferred = requestedProvider === "auto"
    ? cleanText(process.env.AI_PROVIDER, 32)
    : requestedProvider;
  const provider = catalog.find((item) => item.id === preferred)
    || catalog.find((item) => item.configured)
    || catalog[0];
  const model = provider.models.some((item) => item.id === requestedModel)
    ? requestedModel
    : provider.models[0].id;
  return {
    id: provider.id,
    label: provider.label,
    configured: provider.configured,
    model,
    publicProvider: { id: provider.id, label: provider.label }
  };
}

export async function requestProvider(body, selection) {
  if (selection.id === "openai") return requestOpenAI(body, selection.model);
  if (selection.id === "anthropic") return requestAnthropic(body, selection.model);
  if (selection.id === "gemini") return requestGemini(body, selection.model);
  if (selection.id === "ollama") return requestOllama(body, selection.model);
  return requestOpenAICompatible(body, selection);
}

async function requestOpenAI(body, model) {
  const schema = schemaFor(body.action);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: jsonHeaders(process.env.OPENAI_API_KEY),
    body: JSON.stringify({
      model,
      reasoning: { effort: body.action === "chat" ? "medium" : "high" },
      input: buildModelInput(body),
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: body.action === "chat" ? "valuespark_dialogue" : "valuespark_insight",
          strict: true,
          schema
        }
      },
      max_output_tokens: body.action === "chat" ? 1800 : 2600
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await parseProviderResponse(response, "OpenAI");
  return parseJsonText(extractOutputText(payload));
}

async function requestOpenAICompatible(body, selection) {
  const configs = {
    deepseek: {
      url: "https://api.deepseek.com/chat/completions",
      key: process.env.DEEPSEEK_API_KEY,
      extras: { thinking: { type: "disabled" } }
    },
    kimi: {
      url: "https://api.moonshot.ai/v1/chat/completions",
      key: process.env.MOONSHOT_API_KEY,
      extras: { thinking: { type: "disabled" } }
    },
    openrouter: {
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      headers: {
        "HTTP-Referer": process.env.APP_URL || "https://valuespark.local",
        "X-Title": "ValueSpark"
      },
      extras: {}
    }
  };
  const config = configs[selection.id];
  const response = await fetch(config.url, {
    method: "POST",
    headers: { ...jsonHeaders(config.key), ...config.headers },
    body: JSON.stringify({
      model: selection.model,
      messages: buildJsonMessages(body),
      response_format: { type: "json_object" },
      ...(selection.id === "kimi"
        ? { max_completion_tokens: body.action === "chat" ? 2200 : 3200 }
        : { max_tokens: body.action === "chat" ? 2200 : 3200 }),
      ...config.extras
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await parseProviderResponse(response, selection.label);
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

async function requestAnthropic(body, model) {
  const input = buildModelInput(body);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: body.action === "chat" ? 2200 : 3200,
      system: `${input[0].content}\n${jsonContract(body.action)}`,
      messages: [{ role: "user", content: input[1].content }]
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await parseProviderResponse(response, "Anthropic");
  const text = payload?.content?.find((item) => item.type === "text")?.text;
  return parseJsonText(text);
}

async function requestGemini(body, model) {
  const input = buildModelInput(body);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input[0].content }] },
      contents: [{ role: "user", parts: [{ text: input[1].content }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schemaFor(body.action),
        maxOutputTokens: body.action === "chat" ? 2200 : 3200
      }
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await parseProviderResponse(response, "Gemini");
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  return parseJsonText(text);
}

async function requestOllama(body, model) {
  const baseUrl = String(process.env.OLLAMA_BASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: buildModelInput(body),
      stream: false,
      format: schemaFor(body.action),
      think: false
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await parseProviderResponse(response, "Ollama");
  return parseJsonText(payload?.message?.content);
}

function buildJsonMessages(body) {
  const input = buildModelInput(body);
  return [
    { role: "system", content: `${input[0].content}\n${jsonContract(body.action)}` },
    { role: "user", content: input[1].content }
  ];
}

function buildModelInput(body) {
  const transcript = body.messages
    .map((message) => `${message.role === "assistant" ? "ValueSpark" : "用户"}：${message.content}`)
    .join("\n\n");
  const context = `Spark 标题：${body.spark.title}\n\n原始 Spark：${body.spark.content}\n\n已有对话：\n${transcript || "暂无"}`;

  if (body.action === "chat") {
    return [
      {
        role: "system",
        content:
          "你是 ValueSpark，一位克制、敏锐的中文思考伙伴。帮助用户澄清核心问题、识别假设、挑战盲区并形成可行动判断。回复应自然、有温度、具体。thinkingPath 是面向用户的简短推理摘要，只写关键依据和判断结构，不披露私有思维链。追问必须贴合上下文且能推动下一轮思考。"
      },
      {
        role: "user",
        content: `${context}\n\n用户最新补充：${body.userMessage || "请基于现有材料继续推进。"}`
      }
    ];
  }

  return [
    {
      role: "system",
      content:
        "你是 ValueSpark 的洞见编辑。把完整思考线程压缩成可信、具体、可回顾的结构化洞见。区分材料中的事实、假设和挑战；行动项要小而明确；避免空泛鼓励。"
    },
    { role: "user", content: context }
  ];
}

function jsonContract(action) {
  return `只返回一个符合以下 JSON Schema 的 JSON 对象。不要使用 Markdown 代码块。\n${JSON.stringify(schemaFor(action))}`;
}

function schemaFor(action) {
  return action === "chat" ? chatSchema : insightSchema;
}

async function parseProviderResponse(response, provider) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `${provider} 请求失败。`;
    const error = httpError(502, detail);
    error.providerStatus = response.status;
    throw error;
  }
  return payload;
}

export function parseJsonText(text) {
  if (typeof text !== "string" || !text.trim()) throw httpError(502, "模型没有返回文本结果。");
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // Fall through to a consistent provider error.
      }
    }
    throw httpError(502, "模型返回了无法解析的结构化结果。");
  }
}

export function extractOutputText(payload) {
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  throw httpError(502, "模型没有返回文本结果。");
}

export function buildMockChat(body) {
  const source = `${body.spark.title} ${body.spark.content} ${body.userMessage}`.toLowerCase();
  const angle = /用户|user/.test(source)
    ? "用户场景"
    : /产品|product/.test(source)
      ? "产品价值"
      : /ai|人工智能|模型/.test(source)
        ? "思考质量"
        : "核心判断";
  const questions = {
    用户场景: ["哪一个场景会产生最强需求？", "用户会用什么自己的话描述这个问题？", "现有替代方式最让人不满的地方是什么？"],
    产品价值: ["第一次使用时必须发生什么，用户才会感到有用？", "十分钟后应该出现什么可见进展？", "最小验证版本只保留哪一步？"],
    思考质量: ["AI 在回答前最该确认什么？", "哪个环节最需要结构化？", "什么结果能证明思考质量真的提高了？"],
    核心判断: ["这个想法里最强的判断是什么？", "什么证据会明显增强信心？", "哪个反例最可能推翻当前判断？"]
  }[angle];

  return {
    reply: `当前材料把焦点推向了“${angle}”。先把范围收窄到一个具体场景，再命名最关键的假设，会比继续扩展想法更有推进力。你可以从下面的问题里选一个继续。`,
    followUpQuestions: questions,
    thinkingPath: {
      observation: `用户补充的信息正在把原始 Spark 收敛到${angle}。`,
      coreQuestion: "在什么具体场景下，这个想法能产生清晰、可验证的价值？",
      keyAssumption: "存在一个频繁发生且现有方法处理得不够好的真实问题。",
      challenge: "当前描述仍偏宽，缺少具体人物、时刻和可观察结果。",
      emergingInsight: "优先验证一个高强度场景，可以更快判断这个方向是否值得继续。"
    }
  };
}

export function buildMockInsight(body) {
  const corePhrase = body.spark.title.replace(/[?.!。？！]+$/, "");
  const combined = [body.spark.content, ...body.messages.filter((item) => item.role === "user").map((item) => item.content)].join(" ");
  return {
    coreQuestion: `${corePhrase}？`,
    keyAssumptions: [
      "这个想法对应一个真实、可重复出现的场景。",
      "清晰的结构能帮助用户把未完成想法继续推进。",
      "用户愿意补充背景并验证关键判断。"
    ],
    challenges: [
      "宽泛的问题容易产生正确但难以行动的结论。",
      "缺少具体场景时，很难判断需求强度。",
      "过大的行动会增加从思考进入验证的阻力。"
    ],
    emergingInsight: "这个 Spark 的价值在于把模糊直觉变成可继续工作的结构。当前最有价值的动作是选定一个真实场景，并识别最需要验证的假设。",
    nextActions: [
      "用一句话写清楚具体人物和发生时刻。",
      "列出一个关键假设与一个可能反例。",
      "设计一个十分钟内可以完成的小验证。"
    ],
    finalSummary: `${summarize(combined)} 当前应围绕具体场景、关键假设和小型验证形成下一步判断。`
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw httpError(413, "请求内容过大。");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw httpError(400, "请求 JSON 无效。");
  }
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function summarize(value) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 132 ? `${text.slice(0, 129).trim()}...` : text;
}

function jsonHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}

function clientAddress(req) {
  return String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "local").split(",")[0].trim();
}

function consumeRateLimit(key) {
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT_REQUESTS;
}

function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
