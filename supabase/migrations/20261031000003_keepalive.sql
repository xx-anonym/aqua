-- Free-plan projects are paused after a week without database activity. A Vercel cron job
-- calls public.keepalive() twice a day; the row shows when the last ping happened.
create table public.keepalive (
  id smallint primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  ping_count bigint not null default 0
);
insert into public.keepalive (id) values (1);
alter table public.keepalive enable row level security;
-- No policies: the table is only touched through the function below.

create or replace function public.keepalive()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update public.keepalive set pinged_at = now(), ping_count = ping_count + 1 where id = 1
  returning pinged_at;
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
