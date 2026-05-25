-- Fixed-window rate limiter backed by Postgres (works across serverless instances).
-- rate_limit(key, max, window_seconds) returns true if the request is allowed.

create table if not exists rate_limits (
  bucket       text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);

create or replace function rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
as $$
declare
  cur rate_limits%rowtype;
begin
  select * into cur from rate_limits where bucket = p_key for update;

  if not found then
    insert into rate_limits(bucket, count, window_start) values (p_key, 1, now());
    return true;
  end if;

  -- window expired -> reset
  if now() - cur.window_start > make_interval(secs => p_window_seconds) then
    update rate_limits set count = 1, window_start = now() where bucket = p_key;
    return true;
  end if;

  if cur.count >= p_max then
    return false;
  end if;

  update rate_limits set count = count + 1 where bucket = p_key;
  return true;
end;
$$;
