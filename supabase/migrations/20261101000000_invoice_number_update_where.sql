create or replace function assign_invoice_number() returns trigger language plpgsql as $$
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
  update settings set next_invoice = n + 1 where id = s.id;
  new.number := candidate;
  new.sequence := n;
  return new;
end $$;
