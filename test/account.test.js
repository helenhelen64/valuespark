import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptApiKey,
  encryptApiKey,
  parseSocialProviders,
  publicAuthConfig
} from "../api/_lib/account.js";

test("账户 API Key 可以完成 AES-GCM 加密往返", () => {
  const previous = process.env.ACCOUNT_KEY_ENCRYPTION_SECRET;
  process.env.ACCOUNT_KEY_ENCRYPTION_SECRET = "test-secret-with-at-least-thirty-two-characters";
  try {
    const encrypted = encryptApiKey("sk-deepseek-secret", "user-1", "deepseek");
    assert.notEqual(encrypted.cipher_text, "sk-deepseek-secret");
    assert.equal(encrypted.key_version, 1);
    assert.equal(
      decryptApiKey(encrypted, "user-1", "deepseek"),
      "sk-deepseek-secret"
    );
    assert.throws(() => decryptApiKey(encrypted, "user-2", "deepseek"));
  } finally {
    if (previous === undefined) delete process.env.ACCOUNT_KEY_ENCRYPTION_SECRET;
    else process.env.ACCOUNT_KEY_ENCRYPTION_SECRET = previous;
  }
});

test("社交登录配置只输出经过清洗的入口", () => {
  assert.deepEqual(
    parseSocialProviders("google, twitter, wechat:custom_wechat:微信登录, <bad>"),
    [
      { id: "google", provider: "google", label: "Google" },
      { id: "twitter", provider: "twitter", label: "X / Twitter" },
      { id: "wechat", provider: "custom_wechat", label: "微信登录" }
    ]
  );
});

test("账户公开配置不暴露服务端密钥", () => {
  const previous = { ...process.env };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
  process.env.ACCOUNT_KEY_ENCRYPTION_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.AUTH_SOCIAL_PROVIDERS = "google,apple,twitter";
  try {
    const config = publicAuthConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.publishableKey, "sb_publishable_test");
    assert.equal(JSON.stringify(config).includes("service-role-secret"), false);
    assert.equal(JSON.stringify(config).includes("test-secret"), false);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});
