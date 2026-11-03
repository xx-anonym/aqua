-- Last write wins compares the change time the device sends. A device whose clock runs ahead
-- would otherwise win every later conflict: change times from the future are capped at the
-- server's clock before the comparison.
create or replace function public.sync_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at > clock_timestamp() then
    new.updated_at := clock_timestamp();
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'user_id cannot change';
    end if;
    -- Last write wins: an older client version never overwrites a newer row.
    if new.updated_at < old.updated_at then
      return null;
    end if;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;
