-- OmniMCP AI — initial schema.
-- Tenant isolation has two layers:
--   1. Every repository query in packages/core-infrastructure filters by tenant_id
--      explicitly — this is the layer that is actually exercised on every request today.
--   2. Row-Level Security policies below are defense-in-depth for anything that talks
--      to Postgres directly (an analyst, a future service, a bug that forgets a WHERE
--      clause). They only take effect once the connecting session runs
--      `select set_config('app.tenant_id', '<uuid>', true)` — see
--      core-infrastructure/src/db/client.ts#withTenantScope for the pattern. Wiring
--      every request through that scope is tracked as MVP follow-up; until then, layer 1
--      is the one actually protecting tenant data.

create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key,
  name text not null,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  password_hash text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  refresh_token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table api_keys (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by_user_id uuid not null references users(id),
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table connector_installations (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  connector_id text not null,
  installed_by_user_id uuid not null references users(id),
  config jsonb not null default '{}'::jsonb,
  installed_at timestamptz not null default now(),
  uninstalled_at timestamptz,
  unique (tenant_id, connector_id)
);

create table credential_grants (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  connector_id text not null,
  granted_by_user_id uuid not null references users(id),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index credential_grants_active_lookup on credential_grants (tenant_id, connector_id) where revoked_at is null;

create table permissions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  connector_id text not null,
  granted_by_user_id uuid not null references users(id),
  granted_at timestamptz not null default now(),
  primary key (tenant_id, user_id, connector_id)
);

create table audit_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid not null references users(id),
  qualified_tool_name text not null,
  params_hash text not null,
  outcome text not null check (outcome in ('success', 'denied', 'error', 'awaiting_confirmation')),
  error_message text,
  occurred_at timestamptz not null default now()
);
create index audit_events_tenant_time on audit_events (tenant_id, occurred_at desc);

-- Row-Level Security (see note at top of file for when this is actually enforced).
alter table users enable row level security;
alter table sessions enable row level security;
alter table api_keys enable row level security;
alter table connector_installations enable row level security;
alter table credential_grants enable row level security;
alter table permissions enable row level security;
alter table audit_events enable row level security;

create policy tenant_isolation on users using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation on sessions using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation on api_keys using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation on connector_installations using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation on credential_grants using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation on permissions using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation on audit_events using (tenant_id::text = current_setting('app.tenant_id', true));
