import { publicAuthConfig } from "./_lib/account.js";

export default async function handler(req, res) {
  setHeaders(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "仅支持 GET。" });
  }
  return sendJson(res, 200, publicAuthConfig());
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
