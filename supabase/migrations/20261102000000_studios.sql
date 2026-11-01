-- One database, many studios. Every row carries studio_id, links can't cross studios (composite foreign keys),
-- client codes and invoice numbers count per studio, and the server writes only through apply_changes(studio, changes),
-- which stamps and scopes every change. The existing studio becomes the first studio; its WC- client codes become FW-.
-- No studio_id indexes yet: lists are small. Add (studio_id) indexes when a studio's lists get slow.

create table studios (
  id uuid primary key default gen_random_uuid(),
  company text not null default 'Framewise',
  currency text not null default 'INR',
  invoice_business jsonb not null default '{}',
  invoice_templates jsonb not null default '[]',
  active_invoice_template text,
  invoice_prefix text not null default '' check (invoice_prefix ~ '^[A-Za-z0-9_-]{0,16}$'),
  invoice_padding int not null default 6 check (invoice_padding between 3 and 10),
  next_invoice int not null default 1 check (next_invoice >= 1),
  client_code_prefix text not null default '' check (client_code_prefix ~ '^[A-Za-z0-9_-]{0,16}$'),
  client_code_padding int not null default 4 check (client_code_padding between 3 and 10),
  next_client_code int not null default 1 check (next_client_code >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one person, one studio; user_id is auth.users.id (no foreign key, so tests run without the auth schema)
create table studio_members (
  user_id uuid primary key,
  studio_id uuid not null references studios,
  created_at timestamptz not null default now()
);

do $$
declare
  first uuid;
  t text;
begin
  insert into studios (company, currency, invoice_business, invoice_templates, active_invoice_template, invoice_prefix, invoice_padding, next_invoice,
                       client_code_prefix, next_client_code)
  select company, currency, invoice_business, invoice_templates, active_invoice_template, invoice_prefix, invoice_padding, next_invoice, 'FW-',
         greatest((select last_value + case when is_called then 1 else 0 end from client_code_seq),
                  coalesce((select max(substring(code from 4)::int) from clients where code ~ '^WC-\d+$'), 0) + 1)
  from settings
  returning id into first;

  if to_regclass('auth.users') is not null then
    execute 'insert into studio_members (user_id, studio_id) select id, $1 from auth.users' using first;
  end if;

  -- triggers off while backfilling: no updated_at bumps, no payment audit rows, no money re-checks for unchanged amounts
  foreach t in array array['clients', 'enquiries', 'team_members', 'terms', 'packages', 'delivery_items', 'events', 'event_team', 'payments',
                           'payment_audit', 'payment_stage_plans', 'assignments', 'projects', 'tasks', 'expenses', 'documents', 'invoices'] loop
    execute format('alter table %I disable trigger user', t);
    execute format('alter table %I add column studio_id uuid references studios', t);
    execute format('update %I set studio_id = $1', t) using first;
    execute format('alter table %I alter column studio_id set not null', t);
    execute format('alter table %I enable trigger user', t);
  end loop;

  alter table clients disable trigger user;
  update clients set code = 'FW-' || substring(code from 4) where code ~ '^WC-\d+$';
  alter table clients enable trigger user;
end $$;

drop table settings;

-- links stay inside one studio: each single-column link also matches studio_id
alter table clients add unique (id, studio_id);
alter table packages add unique (id, studio_id);
alter table events add unique (id, studio_id);
alter table team_members add unique (id, studio_id);
alter table projects add unique (id, studio_id);

alter table enquiries drop constraint enquiries_client_id_fkey,
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete set null (client_id);
alter table packages drop constraint packages_client_id_fkey,
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete cascade;
alter table delivery_items drop constraint delivery_items_package_id_fkey,
  add foreign key (package_id, studio_id) references packages (id, studio_id) on delete cascade;
alter table events drop constraint events_client_id_fkey,
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete cascade;
alter table event_team drop constraint event_team_event_id_fkey, drop constraint event_team_member_id_fkey,
  add foreign key (event_id, studio_id) references events (id, studio_id) on delete cascade,
  add foreign key (member_id, studio_id) references team_members (id, studio_id) on delete cascade;
alter table payments drop constraint payments_client_id_fkey,
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete restrict;
alter table payment_stage_plans drop constraint payment_stage_plans_client_id_fkey,
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete cascade;
alter table assignments drop constraint assignments_event_id_fkey, drop constraint assignments_member_id_fkey,
  add foreign key (event_id, studio_id) references events (id, studio_id) on delete cascade,
  add foreign key (member_id, studio_id) references team_members (id, studio_id) on delete restrict;
alter table projects drop constraint projects_event_id_fkey, drop constraint projects_owner_id_fkey,
  add foreign key (event_id, studio_id) references events (id, studio_id) on delete cascade,
  add foreign key (owner_id, studio_id) references team_members (id, studio_id) on delete set null (owner_id);
alter table tasks drop constraint tasks_owner_id_fkey, drop constraint tasks_client_id_fkey, drop constraint tasks_event_id_fkey, drop constraint tasks_project_id_fkey,
  add foreign key (owner_id, studio_id) references team_members (id, studio_id) on delete set null (owner_id),
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete set null (client_id),
  add foreign key (event_id, studio_id) references events (id, studio_id) on delete set null (event_id),
  add foreign key (project_id, studio_id) references projects (id, studio_id) on delete set null (project_id);
alter table expenses drop constraint expenses_client_id_fkey, drop constraint expenses_event_id_fkey,
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete set null (client_id),
  add foreign key (event_id, studio_id) references events (id, studio_id) on delete set null (event_id);
alter table documents drop constraint documents_client_id_fkey,
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete cascade;
alter table invoices drop constraint invoices_client_id_fkey,
  add foreign key (client_id, studio_id) references clients (id, studio_id) on delete restrict;

-- client codes and invoice numbers count per studio
alter table clients drop constraint clients_code_key, add unique (studio_id, code), alter column code drop default;
drop sequence client_code_seq;
alter table invoices drop constraint invoices_number_key, add unique (studio_id, number);

create function assign_client_code() returns trigger language plpgsql as $$
declare
  s studios;
  n int;
  candidate text;
begin
  if new.code is not null then return new; end if;
  select * into s from studios where id = new.studio_id for update;
  n := s.next_client_code;
  loop
    candidate := s.client_code_prefix || case when length(n::text) >= s.client_code_padding then n::text else lpad(n::text, s.client_code_padding, '0') end;
    exit when not exists (select 1 from clients c where c.studio_id = new.studio_id and c.code = candidate);
    n := n + 1;
  end loop;
  update studios set next_client_code = n + 1 where id = s.id;
  new.code := candidate;
  return new;
end $$;

create trigger clients_code before insert on clients for each row execute function assign_client_code();

create or replace function assign_invoice_number() returns trigger language plpgsql as $$
declare
  s studios;
  n int;
  candidate text;
begin
  if new.number is not null then return new; end if;
  select * into s from studios where id = new.studio_id for update;
  n := s.next_invoice;
  loop
    candidate := s.invoice_prefix || case when length(n::text) >= s.invoice_padding then n::text else lpad(n::text, s.invoice_padding, '0') end;
    exit when not exists (select 1 from invoices i where i.studio_id = new.studio_id and i.number = candidate);
    n := n + 1;
  end loop;
  update studios set next_invoice = n + 1 where id = s.id;
  new.number := candidate;
  new.sequence := n;
  return new;
end $$;

create or replace function audit_payment() returns trigger language plpgsql as $$
begin
  insert into payment_audit (studio_id, payment_id, before, after)
  values (old.studio_id, old.id, to_jsonb(old), case when tg_op = 'UPDATE' then to_jsonb(new) end);
  return null;
end $$;

create trigger studios_updated_at before update on studios for each row execute function set_updated_at();
alter table studios enable row level security;
alter table studio_members enable row level security;

-- every write names its studio: inserts are stamped with it, updates and deletes only reach its rows,
-- and on the studios table only that studio's own row can be updated
drop function apply_changes(jsonb);

create function apply_changes(studio uuid, changes jsonb) returns jsonb language plpgsql as $$
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
  if studio is null or not exists (select 1 from studios where id = studio) then
    raise exception 'Unknown studio';
  end if;
  for change in select value from jsonb_array_elements(changes) loop
    t := change->>'table';
    if t is null or not t = any (array['studios', 'terms', 'clients', 'enquiries', 'team_members', 'packages', 'delivery_items', 'events', 'event_team', 'payments',
                                         'payment_stage_plans', 'assignments', 'projects', 'tasks', 'expenses', 'documents', 'invoices']) then
      raise exception 'Unknown table %', t;
    end if;
    if t = 'studios' and change->>'op' <> 'update' then
      raise exception 'Studios cannot be created or deleted here';
    end if;
    scope := case when t = 'studios' then jsonb_build_object('id', studio) else jsonb_build_object('studio_id', studio) end;
    if coalesce(change->'set' ? 'studio_id', false) or (t = 'studios' and coalesce(change->'set' ? 'id', false)) then
      raise exception 'Rows cannot move between studios';
    end if;
    case change->>'op'
      when 'insert' then
        item := coalesce(change->'row', '{}') || scope;
        cols := change_columns(t, item);
        execute format('with r as (insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r',
                       t, cols, cols, t) into affected using item;
      when 'update' then
        set_cols := change->'set';
        match_cols := coalesce(change->'match', '{}') || scope;
        cols := change_columns(t, set_cols);
        keys := change_columns(t, match_cols);
        execute format('with r as (update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where (%s) = (select %s from jsonb_populate_record(null::%I, $2)) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r',
                       t, cols, cols, t, keys, keys, t) into affected using set_cols, match_cols;
      when 'delete' then
        match_cols := coalesce(change->'match', '{}') || scope;
        keys := change_columns(t, match_cols);
        execute format('with r as (delete from %I where (%s) = (select %s from jsonb_populate_record(null::%I, $1)) returning *) select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from r',
                       t, keys, keys, t) into affected using match_cols;
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
