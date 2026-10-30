-- Monthly photo-ID quota per user. Only the edge function (service role) can count.
create table public.photo_id_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,
  count integer not null default 0,
  primary key (user_id, month)
);
alter table public.photo_id_usage enable row level security;
create policy "photo_id_usage: read own" on public.photo_id_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- Returns the new count, or -1 if the limit is already reached.
create or replace function public.consume_photo_id_quota(p_user uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
  c integer;
begin
  insert into public.photo_id_usage (user_id, month, count) values (p_user, m, 1)
  on conflict (user_id, month) do update set count = public.photo_id_usage.count + 1
    where public.photo_id_usage.count < p_limit
  returning count into c;
  return coalesce(c, -1);
end;
$$;

-- Gives a unit back when the model call failed.
create or replace function public.release_photo_id_quota(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.photo_id_usage set count = greatest(count - 1, 0)
  where user_id = p_user and month = to_char(now() at time zone 'utc', 'YYYY-MM');
$$;

revoke execute on function public.consume_photo_id_quota(uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_photo_id_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_photo_id_quota(uuid, integer) to service_role;
grant execute on function public.release_photo_id_quota(uuid) to service_role;
