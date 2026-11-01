alter table projects drop constraint projects_stage_names_check;
alter table projects add constraint projects_stage_names_check check (
  cardinality(stage_names) between 2 and 50 and
  (stage_names[1] = 'Shoot Completed' or (stage_names[1] = 'Upcoming' and stage_names[2] = 'Shoot Completed')) and
  stage_names[cardinality(stage_names)] = 'Completed'
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios,
  client_id uuid not null,
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  status text not null default 'Sent' check (status in ('Sent', 'Accepted', 'Superseded')),
  snapshot jsonb not null,
  source jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  acceptance_method text check (acceptance_method = 'fixed_code'),
  consent boolean not null default false,
  foreign key (client_id, studio_id) references clients (id, studio_id),
  check (status <> 'Accepted' or (accepted_at is not null and consent and acceptance_method is not null))
);
create unique index quotes_one_sent on quotes (studio_id, client_id) where status = 'Sent';
alter table quotes enable row level security;

create function quote_source(s uuid, c uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'client', (select to_jsonb(x) from clients x where id = c and studio_id = s),
    'events', coalesce((select jsonb_agg(to_jsonb(x) order by id) from events x where client_id = c and studio_id = s), '[]'),
    'packages', coalesce((select jsonb_agg(to_jsonb(x) order by id) from packages x where client_id = c and studio_id = s), '[]'),
    'items', coalesce((select jsonb_agg(to_jsonb(x) order by id) from delivery_items x where studio_id = s and package_id in (select id from packages where client_id = c and studio_id = s)), '[]'),
    'plans', coalesce((select jsonb_agg(to_jsonb(x) order by stage collate "C") from payment_stage_plans x where client_id = c and studio_id = s), '[]')
  )
$$;

create function guard_quote() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Sent' then raise exception 'New quotes must be sent'; end if;
  else
    if old.status <> 'Sent' or new.status not in ('Accepted', 'Superseded') then
      raise exception 'This quote is no longer available';
    end if;
    if (to_jsonb(new) - array['status','accepted_at','acceptance_method','consent']) is distinct from
       (to_jsonb(old) - array['status','accepted_at','acceptance_method','consent']) then
      raise exception 'Sent quotes cannot be edited';
    end if;
  end if;
  if tg_op = 'INSERT' or new.status = 'Accepted' then
    if new.source is distinct from quote_source(new.studio_id, new.client_id) then
      raise exception 'Booking details changed. Ask the studio for a new quote.';
    end if;
    if new.expires_at <= now() then raise exception 'Quote expired. Ask the studio for a new quote.'; end if;
  end if;
  return new;
end $$;
create trigger quotes_guard before insert or update on quotes for each row execute function guard_quote();

create or replace function apply_changes(studio uuid, changes jsonb) returns jsonb language plpgsql as $$
declare
  change jsonb;
  t text;
  scope jsonb;
  item jsonb;
  set_cols jsonb;
  match_cols jsonb;
  cols text;
  keys text;
  affected jsonb;
  results jsonb := '[]';
begin
  if studio is null or not exists (select 1 from studios where id = studio) then raise exception 'Unknown studio'; end if;
  -- Serialize studio writes so quote validation and booking cannot race a requirements edit.
  perform pg_advisory_xact_lock(hashtextextended(studio::text, 0));
  for change in select value from jsonb_array_elements(changes) loop
    t := change->>'table';
    if t is null or not t = any (array['studios', 'quotes', 'terms', 'clients', 'enquiries', 'team_members', 'packages', 'delivery_items', 'events', 'event_team', 'payments',
      'payment_stage_plans', 'assignments', 'projects', 'tasks', 'expenses', 'documents', 'invoices']) then raise exception 'Unknown table %', t; end if;
    if t = 'studios' and change->>'op' <> 'update' then raise exception 'Studios cannot be created or deleted here'; end if;
    scope := case when t = 'studios' then jsonb_build_object('id', studio) else jsonb_build_object('studio_id', studio) end;
    if coalesce(change->'set' ? 'studio_id', false) or (t = 'studios' and coalesce(change->'set' ? 'id', false)) then raise exception 'Rows cannot move between studios'; end if;
    case change->>'op'
      when 'insert' then
        item := coalesce(change->'row', '{}') || scope;
        cols := change_columns(t, item);
        execute format('with r as (insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r', t, cols, cols, t) into affected using item;
      when 'update' then
        set_cols := change->'set';
        match_cols := coalesce(change->'match', '{}') || scope;
        cols := change_columns(t, set_cols);
        keys := change_columns(t, match_cols);
        execute format('with r as (update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where (%s) = (select %s from jsonb_populate_record(null::%I, $2)) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r', t, cols, cols, t, keys, keys, t) into affected using set_cols, match_cols;
      when 'delete' then
        match_cols := coalesce(change->'match', '{}') || scope;
        keys := change_columns(t, match_cols);
        execute format('with r as (delete from %I where (%s) = (select %s from jsonb_populate_record(null::%I, $1)) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r', t, keys, keys, t) into affected using match_cols;
      else raise exception 'Unknown change %', change->>'op';
    end case;
    if change->>'op' <> 'insert' and jsonb_array_length(affected) = 0 and not coalesce((change->>'optional')::boolean, false) then raise exception 'Record not found' using errcode = 'no_data_found'; end if;
    results := results || jsonb_build_array(affected);
  end loop;
  return results;
end $$;
revoke execute on all functions in schema public from public, anon, authenticated;
grant select, insert, update, delete on quotes to service_role;
grant execute on function quote_source(uuid, uuid), guard_quote(), apply_changes(uuid, jsonb) to service_role;
