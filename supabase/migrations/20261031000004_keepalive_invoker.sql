-- Run keepalive() with the caller's rights instead of SECURITY DEFINER: callers may only
-- set the single row's timestamp to now(), nothing else.
drop function public.keepalive();
alter table public.keepalive drop column ping_count;

revoke all on public.keepalive from anon, authenticated;
grant select (id), update (pinged_at) on public.keepalive to anon, authenticated;
create policy "keepalive: find the row" on public.keepalive for select to anon, authenticated using (id = 1);
create policy "keepalive: ping" on public.keepalive for update to anon, authenticated using (id = 1) with check (id = 1);

create function public.keepalive()
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  update public.keepalive set pinged_at = now() where id = 1;
  select now();
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
