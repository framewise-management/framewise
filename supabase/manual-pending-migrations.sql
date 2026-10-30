begin;

-- Event-specific team roles.
alter table public.event_team add column role text;

-- Terms and Conditions clause library.
create table public.terms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  body text not null check (btrim(body) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.terms enable row level security;

-- Allow the server's existing transaction function to manage clauses.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.apply_changes(jsonb)'::regprocedure) into definition;
  if position('''settings'', ''clients''' in definition) = 0 then
    raise exception 'Could not update apply_changes table list';
  end if;
  execute replace(definition, '''settings'', ''clients''', '''settings'', ''terms'', ''clients''');
end $$;

commit;
