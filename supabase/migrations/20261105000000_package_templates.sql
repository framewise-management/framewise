-- the studio's reusable package catalog (Setup > Packages); client packages stay separate rows
create table package_templates (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios,
  name text not null check (btrim(name) <> ''),
  price numeric(12,2) not null default 0 check (price >= 0),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index package_templates_studio on package_templates (studio_id);
alter table package_templates enable row level security;
create trigger package_templates_updated_at before update on package_templates for each row execute function set_updated_at();
grant select, insert, update, delete on package_templates to service_role;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.apply_changes(uuid, jsonb)'::regprocedure) into definition;
  if position('''quotes'', ''terms''' in definition) = 0 then
    raise exception 'Could not update apply_changes table list';
  end if;
  execute replace(definition, '''quotes'', ''terms''', '''quotes'', ''package_templates'', ''terms''');
end $$;
