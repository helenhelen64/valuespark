import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PROVIDER_IDS = new Set([
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "kimi",
  "openrouter"
]);

export function accountConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = String(
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ""
  ).trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const encryptionSecret = String(process.env.ACCOUNT_KEY_ENCRYPTION_SECRET || "");
  return {
    enabled: Boolean(url && publishableKey && serviceRoleKey && encryptionSecret.length >= 32),
    url,
    publishableKey,
    serviceRoleKey,
    encryptionSecret
  };
}

export function publicAuthConfig() {
  const config = accountConfig();
  return {
    enabled: config.enabled,
    url: config.enabled ? config.url : "",
    publishableKey: config.enabled ? config.publishableKey : "",
    methods: {
      email: config.enabled && process.env.AUTH_EMAIL_ENABLED !== "false",
      phone: config.enabled && process.env.AUTH_PHONE_ENABLED === "true",
      social: config.enabled ? parseSocialProviders(process.env.AUTH_SOCIAL_PROVIDERS) : []
    }
  };
}

export function parseSocialProviders(value = "") {
  const labels = {
    google: "Google",
    apple: "Apple",
    twitter: "X / Twitter",
    facebook: "Facebook",
    github: "GitHub",
    wechat: "微信",
    qq: "QQ",
    instagram: "Instagram"
  };
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((item) => {
      const [id, provider = id, customLabel = ""] = item.split(":").map((part) => part.trim());
      return {
        id: cleanIdentifier(id),
        provider: cleanIdentifier(provider),
        label: cleanLabel(customLabel || labels[id] || id)
      };
    })
    .filter((item) => item.id && item.provider && item.label);
}

export async function authenticateRequest(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const config = accountConfig();
  if (!config.enabled) throw httpError(503, "账户服务尚未配置。");

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(8_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(401, "登录状态已失效，请重新登录。");
  return payload;
}

export async function resolveAccountApiKey(req, provider) {
  if (!bearerToken(req)) return "";
  if (!PROVIDER_IDS.has(provider)) return "";
  const user = await authenticateRequest(req);
  const row = await findKeyRow(user.id, provider);
  return row ? decryptApiKey(row, user.id, provider) : "";
}

export async function listAccountKeyStatus(userId) {
  const response = await databaseRequest(
    `/rest/v1/account_api_keys?select=provider,key_hint,updated_at&user_id=eq.${encodeURIComponent(userId)}`
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw databaseError(response.status, rows);
  return Object.fromEntries(
    rows.map((row) => [
      row.provider,
      { saved: true, hint: row.key_hint || "", updatedAt: row.updated_at || "" }
    ])
  );
}

export async function saveAccountApiKey(userId, provider, apiKey) {
  assertProvider(provider);
  const cleanKey = cleanSecret(apiKey);
  if (!cleanKey) throw httpError(400, "请填写有效的 API Key。");
  const encrypted = encryptApiKey(cleanKey, userId, provider);
  const response = await databaseRequest(
    "/rest/v1/account_api_keys?on_conflict=user_id,provider",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        provider,
        ...encrypted,
        key_hint: cleanKey.slice(-4),
        updated_at: new Date().toISOString()
      })
    }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw databaseError(response.status, payload);
  }
  return { saved: true, hint: cleanKey.slice(-4) };
}

export async function deleteAccountApiKey(userId, provider) {
  assertProvider(provider);
  const response = await databaseRequest(
    `/rest/v1/account_api_keys?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw databaseError(response.status, payload);
  }
}

export function encryptApiKey(apiKey, userId, provider) {
  const config = accountConfig();
  if (!config.encryptionSecret) throw httpError(503, "密钥加密服务尚未配置。");
  const key = createHash("sha256").update(config.encryptionSecret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${userId}:${provider}:v1`));
  const cipherText = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    cipher_text: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    key_version: 1
  };
}

export function decryptApiKey(row, userId, provider) {
  const config = accountConfig();
  if (!config.encryptionSecret) throw httpError(503, "密钥解密服务尚未配置。");
  const key = createHash("sha256").update(config.encryptionSecret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(row.iv, "base64"));
  decipher.setAAD(Buffer.from(`${userId}:${provider}:v${row.key_version || 1}`));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.cipher_text, "base64")),
    decipher.final()
  ]).toString("utf8");
}

async function findKeyRow(userId, provider) {
  assertProvider(provider);
  const response = await databaseRequest(
    `/rest/v1/account_api_keys?select=cipher_text,iv,auth_tag,key_version&user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&limit=1`
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw databaseError(response.status, rows);
  return rows[0] || null;
}

async function databaseRequest(path, options = {}) {
  const config = accountConfig();
  if (!config.enabled) throw httpError(503, "账户服务尚未配置。");
  return fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(8_000)
  });
}

function bearerToken(req) {
  const value = String(req.headers?.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function assertProvider(provider) {
  if (!PROVIDER_IDS.has(provider)) throw httpError(400, "AI 供应商无效。");
}

function cleanSecret(value) {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 1_024)
    : "";
}

function cleanIdentifier(value) {
  return /^[a-z0-9_-]{1,48}$/i.test(value || "") ? value.toLowerCase() : "";
}

function cleanLabel(value) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, 32);
}

function databaseError(status, payload) {
  const error = httpError(status >= 500 ? 502 : 500, "账户密钥存储暂时不可用。");
  error.cause = payload;
  return error;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
