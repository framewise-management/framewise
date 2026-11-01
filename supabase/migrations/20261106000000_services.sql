-- the studio's service catalog (Setup > Services)
create table services (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios,
  name text not null check (btrim(name) <> ''),
  category text,
  description text,
  price numeric(12,2) not null default 0 check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_studio on services (studio_id);
alter table services enable row level security;
create trigger services_updated_at before update on services for each row execute function set_updated_at();
grant select, insert, update, delete on services to service_role;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.apply_changes(uuid, jsonb)'::regprocedure) into definition;
  if position('''package_templates'', ''terms''' in definition) = 0 then
    raise exception 'Could not update apply_changes table list';
  end if;
  execute replace(definition, '''package_templates'', ''terms''', '''package_templates'', ''services'', ''terms''');
end $$;
