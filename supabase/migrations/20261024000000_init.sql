-- Framewise schema. The app reaches data only through the Express server with the service-role key,
-- so every table has RLS on and no policies: the anon/authenticated keys can read or write nothing.
-- supabase-js has no transactions, so money rules that span rows are enforced here by triggers.

create table settings (
  id boolean primary key default true check (id),
  company text not null default 'Wedding Clap',
  currency text not null default 'INR',
  invoice_business jsonb not null default '{}',
  invoice_templates jsonb not null default '[]',
  active_invoice_template text,
  invoice_prefix text not null default '' check (invoice_prefix ~ '^[A-Za-z0-9_-]{0,16}$'),
  invoice_padding int not null default 6 check (invoice_padding between 3 and 10),
  next_invoice int not null default 1 check (next_invoice >= 1),
  updated_at timestamptz not null default now()
);
insert into settings default values;

create sequence client_code_seq;

create table clients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'WC-' || lpad(nextval('client_code_seq')::text, 4, '0'),
  name text not null check (btrim(name) <> ''),
  bride text,
  groom text,
  phone text,
  email text,
  address text,
  lead_source text,
  budget text,
  wedding_date date,
  package_name text,
  price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  finance_mode text not null default 'Shared' check (finance_mode in ('Shared', 'Per day')),
  status text not null default 'Quote Sent' check (status in ('Quote Sent', 'Booked', 'Negotiation', 'Tentative', 'Canceled', 'Lost', 'Confirmed', 'Completed')),
  completion_previous_status text,
  due date,
  notes text,
  sort_order int,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount >= 0 and discount <= price)
);

create table enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  bride text,
  groom text,
  phone text,
  email text,
  city text,
  lead_source text,
  budget text,
  wedding_date date,
  followup date,
  price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  status text not null default 'New' check (status in ('New', 'Contacted', 'Follow-up', 'Quote Sent', 'Booked', 'Negotiation', 'Tentative', 'Canceled', 'Lost', 'Confirmed')),
  client_id uuid references clients on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount >= 0 and discount <= price)
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  role text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table packages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  name text not null check (btrim(name) <> ''),
  price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  drive_link text check (drive_link ~ '^https://'),
  bill_to text,
  invoice_reference text,
  invoice_terms text,
  invoice_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, client_id),
  check (discount >= 0 and discount <= price)
);

create table delivery_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages on delete cascade,
  kind text not null check (kind in ('deliverable', 'complimentary')),
  label text not null check (btrim(label) <> ''),
  position int not null default 0,
  quantity int check (quantity >= 1),
  duration text,
  status text not null default 'Not set' check (status in ('Not set', 'No', 'In progress', 'Partial', 'Yes', 'Not required')),
  delivered_quantity numeric check (delivered_quantity >= 0 and (quantity is null or delivered_quantity <= quantity)),
  delivered_date date,
  notes text,
  needs_review boolean not null default false,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- an event belongs to at most one package (replaces the legacy packages.events[] list), of the same client
create table events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  package_id uuid,
  booking_group uuid,
  booking_days int,
  day_number int,
  type text not null check (btrim(type) <> ''),
  event_date date,
  start_time time,
  end_time time,
  time_not_recorded boolean not null default false,
  venue text not null default '',
  city text,
  services text[] not null default '{}',
  status text not null default 'Not recorded' check (status in ('Not recorded', 'Scheduled', 'Shoot Completed')),
  booking_status text check (booking_status in ('Quote Sent', 'Booked', 'Negotiation', 'Tentative', 'Canceled', 'Lost', 'Confirmed', 'Completed')),
  booking_override boolean not null default false,
  quotation numeric(12,2) check (quotation >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, client_id),
  foreign key (package_id, client_id) references packages (id, client_id) on delete set null (package_id),
  check (time_not_recorded or (start_time is not null and end_time is not null and start_time < end_time))
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete restrict,
  event_id uuid,
  package_id uuid,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date,
  source_date_unknown boolean not null default false,
  stage text not null default 'Booking Amount',
  method text not null default 'Not set' check (method in ('Not set', 'UPI', 'Cash', 'Other', 'Bank transfer', 'Card', 'Cheque')),
  transaction_reference text,
  reference text,
  invoice_requested boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, client_id),
  foreign key (event_id, client_id) references events (id, client_id) on delete set null (event_id),
  foreign key (package_id, client_id) references packages (id, client_id) on delete restrict,
  check (paid_on is not null or source_date_unknown)
);

-- no foreign key: audit rows outlive deleted payments
create table payment_audit (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null,
  before jsonb not null,
  after jsonb,
  changed_at timestamptz not null default now()
);

create table payment_stage_plans (
  client_id uuid not null references clients on delete cascade,
  stage text not null check (btrim(stage) <> ''),
  target numeric(12,2) not null check (target >= 0),
  primary key (client_id, stage)
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  member_id uuid not null references team_members on delete restrict,
  service text,
  charge numeric(12,2) not null default 0 check (charge >= 0),
  paid numeric(12,2) not null default 0 check (paid >= 0),
  method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid <= charge)
);

-- stage_names is always stored; the server fills it from ProductionStages (shared/) when a shoot completes
create table projects (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events on delete cascade,
  stage int not null default 0,
  stage_names text[] not null,
  completed_stages text[] not null default '{}',
  retired_completed_stages text[] not null default '{}',
  due date,
  owner_id uuid references team_members on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  check (cardinality(stage_names) between 2 and 50 and stage_names[1] = 'Shoot Completed' and stage_names[cardinality(stage_names)] = 'Completed'),
  check (stage >= 0 and stage < cardinality(stage_names)),
  check (completed_stages <@ stage_names)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  due date not null,
  status text not null default 'To do' check (status in ('To do', 'In progress', 'Completed')),
  owner_id uuid references team_members on delete set null,
  client_id uuid references clients on delete set null,
  event_id uuid references events on delete set null,
  project_id uuid references projects on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, client_id) references events (id, client_id) on delete set null (event_id),
  foreign key (project_id, event_id) references projects (id, event_id) on delete set null (project_id)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  amount numeric(12,2) not null check (amount >= 0),
  spent_on date,
  source_date_unknown boolean not null default false,
  category text,
  client_id uuid references clients on delete set null,
  event_id uuid references events on delete set null,
  vendor text,
  method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, client_id) references events (id, client_id) on delete set null (event_id),
  check (event_id is null or client_id is not null),
  check (spent_on is not null or source_date_unknown)
);

-- files live in Supabase Storage; this row holds the path
create table documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  name text not null check (btrim(name) <> ''),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

-- number and sequence are assigned by the invoices_number trigger; snapshot is the frozen document as issued
create table invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^[A-Za-z0-9_-]{0,16}\d{3,}$'),
  sequence int check (sequence >= 1),
  document_kind text not null default 'invoice' check (document_kind in ('invoice', 'receipt', 'stage-invoice')),
  client_id uuid not null references clients on delete restrict,
  package_id uuid,
  payment_id uuid,
  client_invoice boolean not null default false,
  snapshot jsonb not null,
  issued_at timestamptz not null default now(),
  unique (payment_id, document_kind),
  foreign key (package_id, client_id) references packages (id, client_id) on delete restrict,
  foreign key (payment_id, client_id) references payments (id, client_id) on delete restrict,
  check (case document_kind when 'invoice' then client_invoice or package_id is not null else payment_id is not null end)
);

-- same rule as Pricing.quote in shared/pricing.ts; schema.test.ts keeps the two in step
create function client_quote(c uuid) returns numeric language sql stable as $$
  select case
    when exists (select 1 from packages p where p.client_id = c) then (select sum(p.price - p.discount) from packages p where p.client_id = c)
    when cl.finance_mode = 'Per day' then (select coalesce(sum(e.quotation), 0) from events e where e.client_id = c)
    else cl.price - cl.discount
  end
  from clients cl where cl.id = c
$$;

create function check_client_money(c uuid) returns void language plpgsql as $$
begin
  if c is null or not exists (select 1 from clients where id = c) then return; end if;
  if (select coalesce(sum(amount), 0) from payments where client_id = c) > client_quote(c) then
    raise exception 'Client payments exceed quotation' using errcode = 'check_violation';
  end if;
  if exists (select 1 from packages p where p.client_id = c
             and (select coalesce(sum(x.amount), 0) from payments x where x.package_id = p.id) > p.price - p.discount) then
    raise exception 'Package receipts exceed quotation' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from packages where client_id = c)
     and (select finance_mode from clients where id = c) = 'Per day'
     and exists (select 1 from events e where e.client_id = c
                 and (select coalesce(sum(x.amount), 0) from payments x where x.event_id = e.id) > coalesce(e.quotation, 0)) then
    raise exception 'Event payments exceed day quotation' using errcode = 'check_violation';
  end if;
  if exists (select 1 from payments x join events e on e.id = x.event_id
             where x.client_id = c and x.package_id is not null and e.package_id is distinct from x.package_id) then
    raise exception 'Payment event is not part of its package' using errcode = 'check_violation';
  end if;
end $$;

create function check_money_by_client_id() returns trigger language plpgsql as $$
begin
  if tg_op <> 'INSERT' then perform check_client_money(old.client_id); end if;
  if tg_op <> 'DELETE' then perform check_client_money(new.client_id); end if;
  return null;
end $$;

create function check_money_by_id() returns trigger language plpgsql as $$
begin
  perform check_client_money(new.id);
  return null;
end $$;

-- serialises concurrent payments for one client so the deferred check sees both
create function lock_payment_client() returns trigger language plpgsql as $$
begin
  perform 1 from clients where id = new.client_id for update;
  return new;
end $$;

create trigger payments_lock_client before insert or update on payments for each row execute function lock_payment_client();
create constraint trigger payments_money after insert or update on payments deferrable initially deferred for each row execute function check_money_by_client_id();
create constraint trigger packages_money after insert or update or delete on packages deferrable initially deferred for each row execute function check_money_by_client_id();
create constraint trigger events_money after insert or update or delete on events deferrable initially deferred for each row execute function check_money_by_client_id();
create constraint trigger clients_money after update of price, discount, finance_mode on clients deferrable initially deferred for each row execute function check_money_by_id();

create function audit_payment() returns trigger language plpgsql as $$
begin
  insert into payment_audit (payment_id, before, after)
  values (old.id, to_jsonb(old), case when tg_op = 'UPDATE' then to_jsonb(new) end);
  return null;
end $$;

create trigger payments_audit after update or delete on payments for each row execute function audit_payment();

create function assign_invoice_number() returns trigger language plpgsql as $$
declare
  s settings;
  n int;
  candidate text;
begin
  if new.number is not null then return new; end if;
  select * into s from settings for update;
  n := s.next_invoice;
  loop
    candidate := s.invoice_prefix || case when length(n::text) >= s.invoice_padding then n::text else lpad(n::text, s.invoice_padding, '0') end;
    exit when not exists (select 1 from invoices i where i.number = candidate);
    n := n + 1;
  end loop;
  update settings set next_invoice = n + 1;
  new.number := candidate;
  new.sequence := n;
  return new;
end $$;

create trigger invoices_number before insert on invoices for each row execute function assign_invoice_number();

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings', 'clients', 'enquiries', 'team_members', 'packages', 'delivery_items', 'events', 'payments', 'assignments', 'projects', 'tasks', 'expenses'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
  foreach t in array array['settings', 'clients', 'enquiries', 'team_members', 'packages', 'delivery_items', 'events', 'payments', 'payment_audit', 'payment_stage_plans', 'assignments', 'projects', 'tasks', 'expenses', 'documents', 'invoices'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
