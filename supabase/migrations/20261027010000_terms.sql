create table terms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  body text not null check (btrim(body) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table terms enable row level security;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.apply_changes(jsonb)'::regprocedure) into definition;
  if position('''settings'', ''clients''' in definition) = 0 then
    raise exception 'Could not update apply_changes table list';
  end if;
  execute replace(definition, '''settings'', ''clients''', '''settings'', ''terms'', ''clients''');
end $$;
