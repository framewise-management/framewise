-- enquiries track only whether they are still open, were booked, or were canceled
alter table enquiries drop constraint enquiries_status_check;

-- triggers off: a status rename is not an edit, so updated_at stays put
alter table enquiries disable trigger user;
update enquiries set status = case
  when status in ('Booked', 'Confirmed') then 'Booked'
  when status in ('Canceled', 'Lost') then 'Canceled'
  else 'Open'
end;
alter table enquiries enable trigger user;

alter table enquiries alter column status set default 'Open';
alter table enquiries add constraint enquiries_status_check check (status in ('Open', 'Booked', 'Canceled'));
