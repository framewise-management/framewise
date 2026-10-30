alter table settings alter column company set default 'Framewise';
update settings set company = 'Framewise' where company = 'Wedding Clap';
