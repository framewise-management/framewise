-- a service is name, price and an optional tag (Photography, Videography, Editing, ...); no description
alter table services add column tag text;

-- triggers off: moving category into tag is not an edit, so updated_at stays put
alter table services disable trigger user;
update services set tag = nullif(btrim(category), '');
alter table services enable trigger user;

alter table services drop column category, drop column description;
