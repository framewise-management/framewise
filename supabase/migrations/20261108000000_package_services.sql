-- a setup package is a name plus services; with use_service_prices its price is always their current total
alter table package_templates add column use_service_prices boolean not null default false;
alter table package_templates drop column description;

-- composite keys so a package can only link services of its own studio
alter table package_templates add constraint package_templates_id_studio unique (id, studio_id);
alter table services add constraint services_id_studio unique (id, studio_id);

create table package_template_services (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios,
  package_template_id uuid not null,
  service_id uuid not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (package_template_id, service_id),
  foreign key (package_template_id, studio_id) references package_templates (id, studio_id) on delete cascade,
  -- deleting a service takes it out of its packages; their totals follow
  foreign key (service_id, studio_id) references services (id, studio_id) on delete cascade
);
create index package_template_services_studio on package_template_services (studio_id);
alter table package_template_services enable row level security;
grant select, insert, update, delete on package_template_services to service_role;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.apply_changes(uuid, jsonb)'::regprocedure) into definition;
  if position('''package_templates'', ''services''' in definition) = 0 then
    raise exception 'Could not update apply_changes table list';
  end if;
  execute replace(definition, '''package_templates'', ''services''', '''package_templates'', ''package_template_services'', ''services''');
end $$;
