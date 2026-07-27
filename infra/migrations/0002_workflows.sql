-- Automation subsystem: scheduled/manual pipelines of tool calls.
-- Same tenant-isolation model as 0001_init.sql — explicit tenant_id filtering in
-- every repository query is what's actually enforced today; RLS below is
-- defense-in-depth (see the note at the top of 0001_init.sql).

create table workflows (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by_user_id uuid not null references users(id),
  name text not null,
  cron_expression text,
  steps jsonb not null,
  enabled boolean not null default true,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index workflows_due_lookup on workflows (next_run_at) where enabled = true and next_run_at is not null;
create index workflows_tenant_lookup on workflows (tenant_id);

create table workflow_runs (
  id uuid primary key,
  workflow_id uuid not null references workflows(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('success', 'partial_failure', 'failure')),
  step_results jsonb not null
);
create index workflow_runs_by_workflow on workflow_runs (workflow_id, started_at desc);

alter table workflows enable row level security;
alter table workflow_runs enable row level security;

create policy tenant_isolation on workflows using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation on workflow_runs using (tenant_id::text = current_setting('app.tenant_id', true));
