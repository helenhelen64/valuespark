import {
  authenticateRequest,
  deleteAccountApiKey,
  listAccountKeyStatus,
  saveAccountApiKey
} from "./_lib/account.js";

const MAX_BODY_BYTES = 4 * 1024;

export default async function handler(req, res) {
  setHeaders(res);
  try {
    const user = await authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: "请先登录账户。" });

    if (req.method === "GET") {
      return sendJson(res, 200, {
        user: publicUser(user),
        keys: await listAccountKeyStatus(user.id)
      });
    }

    if (req.method === "PUT") {
      const body = await readJsonBody(req);
      const result = await saveAccountApiKey(user.id, cleanProvider(body.provider), body.apiKey);
      return sendJson(res, 200, result);
    }

    if (req.method === "DELETE") {
      const body = await readJsonBody(req);
      await deleteAccountApiKey(user.id, cleanProvider(body.provider));
      return sendJson(res, 200, { saved: false });
    }

    res.setHeader("Allow", "GET, PUT, DELETE");
    return sendJson(res, 405, { error: "请求方法无效。" });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    console.error("[ValueSpark Account]", {
      status,
      name: error?.name || "Error",
      message: error?.message || "unknown"
    });
    return sendJson(res, status, {
      error: status >= 500 ? "账户服务暂时不可用，请稍后再试。" : error.message
    });
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email || "",
    phone: user.phone || "",
    name: user.user_metadata?.full_name || user.user_metadata?.name || ""
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      const error = new Error("请求内容过大。");
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    const error = new Error("请求 JSON 无效。");
    error.status = 400;
    throw error;
  }
}

function cleanProvider(value) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 48) : "";
}

function setHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
