create table if not exists public.user_plugin_connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check (provider in ('github','supabase','vercel','netlify','stripe','figma','google_drive')),
 display_name text not null, provider_account_id text, provider_username text, scopes text[] not null default '{}',
 secret_id uuid, status text not null default 'connected' check (status in ('connected','needs_reauth','error','revoked')),
 connected_at timestamptz not null default now(), last_used_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique (user_id,provider,provider_account_id)
);
create index if not exists user_plugin_connections_owner_idx on public.user_plugin_connections(user_id,provider);
alter table public.user_plugin_connections enable row level security;
create policy "Users can view their own plugin connections" on public.user_plugin_connections for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.user_plugin_connections from anon,authenticated;
grant select on public.user_plugin_connections to authenticated;

create table if not exists public.user_plugin_permissions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid not null references public.user_plugin_connections(id) on delete cascade, project_id uuid,
 actions text[] not null default '{}', require_approval_for text[] not null default '{}',
 updated_at timestamptz not null default now(), unique(user_id,connection_id,project_id)
);
create index if not exists user_plugin_permissions_owner_idx on public.user_plugin_permissions(user_id,connection_id);
alter table public.user_plugin_permissions enable row level security;
create policy "Users can view their own plugin permissions" on public.user_plugin_permissions for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.user_plugin_permissions from anon,authenticated;
grant select on public.user_plugin_permissions to authenticated;

create table if not exists public.plugin_audit_logs (
 id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid references public.user_plugin_connections(id) on delete set null, provider text not null,
 action text not null, resource text, success boolean not null default true, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists plugin_audit_logs_owner_created_idx on public.plugin_audit_logs(user_id,created_at desc);
alter table public.plugin_audit_logs enable row level security;
create policy "Users can view their own plugin audit logs" on public.plugin_audit_logs for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.plugin_audit_logs from anon,authenticated;
grant select on public.plugin_audit_logs to authenticated;
