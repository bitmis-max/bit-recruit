create table if not exists public.google_mail_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_mail_tokens enable row level security;
revoke all on public.google_mail_tokens from public, anon, authenticated;
grant all on public.google_mail_tokens to service_role;

-- No client policies: only trusted server code using the service role may access tokens.
