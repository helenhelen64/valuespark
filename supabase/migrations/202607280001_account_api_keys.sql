create table if not exists public.account_api_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  cipher_text text not null,
  iv text not null,
  auth_tag text not null,
  key_hint text not null default '',
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  constraint account_api_keys_provider_check
    check (provider in ('openai', 'anthropic', 'gemini', 'deepseek', 'kimi', 'openrouter'))
);

alter table public.account_api_keys enable row level security;

revoke all on table public.account_api_keys from anon, authenticated;

comment on table public.account_api_keys is
  'ValueSpark account-scoped AI API keys. Ciphertext is encrypted by the server before insert.';
