-- Cost ceiling for photo ID: besides the monthly limit per user, all users together get at most
-- p_global_limit identifications per month (free sign-ups cannot run up an unlimited bill).
-- Returns the user's new count, -1 if the user's limit is reached, -2 if the global one is.
create or replace function public.consume_photo_id_quota(p_user uuid, p_limit integer, p_global_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
  total integer;
  c integer;
begin
  -- One request at a time, so concurrent requests cannot all pass the global check.
  perform pg_advisory_xact_lock(hashtext('photo_id_quota'));
  select coalesce(sum(count), 0) into total from public.photo_id_usage where month = m;
  if total >= p_global_limit then
    return -2;
  end if;
  insert into public.photo_id_usage (user_id, month, count) values (p_user, m, 1)
  on conflict (user_id, month) do update set count = public.photo_id_usage.count + 1
    where public.photo_id_usage.count < p_limit
  returning count into c;
  return coalesce(c, -1);
end;
$$;

revoke execute on function public.consume_photo_id_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_photo_id_quota(uuid, integer, integer) to service_role;
