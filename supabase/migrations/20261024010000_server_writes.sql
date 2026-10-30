-- an event's day quotation is price - discount (legacy keeps all three)
alter table events
  add column price numeric(12,2) not null default 0,
  add column discount numeric(12,2) not null default 0,
  add constraint events_discount_check check (discount >= 0 and discount <= price);

alter table enquiries add column package_name text;

-- crew picked on the event form, separate from paid assignments
create table event_team (
  event_id uuid not null references events on delete cascade,
  member_id uuid not null references team_members on delete cascade,
  primary key (event_id, member_id)
);
alter table event_team enable row level security;

create function change_columns(t text, obj jsonb) returns text language plpgsql stable as $$
declare
  missing text;
begin
  if obj is null or jsonb_typeof(obj) <> 'object' or obj = '{}' then
    raise exception 'No columns given for %', t;
  end if;
  select string_agg(k, ', ') into missing from jsonb_object_keys(obj) k
  where not exists (select 1 from pg_attribute a where a.attrelid = format('public.%I', t)::regclass and a.attname = k and a.attnum > 0 and not a.attisdropped);
  if missing is not null then
    raise exception 'Unknown columns on %: %', t, missing;
  end if;
  return (select string_agg(quote_ident(k), ', ') from jsonb_object_keys(obj) k);
end $$;

-- supabase-js has no transactions: the server sends every row change of one action here and they commit or fail together.
-- changes: [{ op: 'insert', table, row } | { op: 'update', table, match, set, optional? } | { op: 'delete', table, match, optional? }]
-- returns one array of affected rows per change; update/delete that match nothing fail unless optional
create function apply_changes(changes jsonb) returns jsonb language plpgsql as $$
declare
  change jsonb;
  t text;
  cols text;
  keys text;
  affected jsonb;
  results jsonb := '[]';
begin
  for change in select value from jsonb_array_elements(changes) loop
    t := change->>'table';
    if t is null or not t = any (array['settings', 'clients', 'enquiries', 'team_members', 'packages', 'delivery_items', 'events', 'event_team', 'payments',
                                         'payment_stage_plans', 'assignments', 'projects', 'tasks', 'expenses', 'documents', 'invoices']) then
      raise exception 'Unknown table %', t;
    end if;
    case change->>'op'
      when 'insert' then
        cols := change_columns(t, change->'row');
        execute format('with r as (insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r',
                       t, cols, cols, t) into affected using change->'row';
      when 'update' then
        cols := change_columns(t, change->'set');
        keys := change_columns(t, change->'match');
        execute format('with r as (update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where (%s) = (select %s from jsonb_populate_record(null::%I, $2)) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r',
                       t, cols, cols, t, keys, keys, t) into affected using change->'set', change->'match';
      when 'delete' then
        keys := change_columns(t, change->'match');
        execute format('with r as (delete from %I where (%s) = (select %s from jsonb_populate_record(null::%I, $1)) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r',
                       t, keys, keys, t) into affected using change->'match';
      else
        raise exception 'Unknown change %', change->>'op';
    end case;
    if change->>'op' <> 'insert' and jsonb_array_length(affected) = 0 and not coalesce((change->>'optional')::boolean, false) then
      raise exception 'Record not found' using errcode = 'no_data_found';
    end if;
    results := results || jsonb_build_array(affected);
  end loop;
  return results;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
