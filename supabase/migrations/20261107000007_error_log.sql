-- Error log: errors nobody catches in the browser (src/lib/errorLog.ts). Without personal data:
-- the page (first path segment only), app version, message, place in the code, browser, whether
-- the app is installed and whether someone is signed in. Anyone may write a report; nobody can
-- read them through the API – only in the dashboard or with the service role.
create table public.error_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('error', 'rejection', 'render')),
  page text not null check (length(page) <= 60),
  version text not null check (length(version) <= 40),
  message text not null check (length(message) <= 500),
  source text check (length(source) <= 300),
  stack text check (length(stack) <= 2000),
  browser text check (length(browser) <= 300),
  installed boolean not null default false,
  signed_in boolean not null default false
);

create index error_log_created_at on public.error_log (created_at);

alter table public.error_log enable row level security;

create policy "anyone can report an error" on public.error_log
  for insert to anon, authenticated with check (true);

revoke all on public.error_log from anon, authenticated;
grant insert on public.error_log to anon, authenticated;

-- A flood (an endless loop on some device, or someone writing by hand) must not fill the
-- database: at most 300 reports an hour, further ones are dropped. Reports are kept 90 days.
create or replace function public.error_log_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.error_log where created_at > now() - interval '1 hour') >= 300 then
    return null;
  end if;
  delete from public.error_log where created_at < now() - interval '90 days';
  return new;
end;
$$;

revoke execute on function public.error_log_guard() from public, anon, authenticated;

create trigger error_log_guard before insert on public.error_log
  for each row execute function public.error_log_guard();
