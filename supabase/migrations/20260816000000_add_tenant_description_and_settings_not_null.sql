-- Business identity fields.
--
-- business_name and industry already exist and are reused as-is; only the
-- free-text "about" description is new. industry stays `text` rather than
-- an enum so adding a vertical never needs a migration.
alter table public.tenants
  add column if not exists description text;

-- settings already declares `default '{}'`, but a default only applies
-- when the column is omitted on insert — an explicit null still gets
-- through. Making it NOT NULL means the app can treat settings as always
-- being an object and skip null-handling on every read.
update public.tenants set settings = '{}'::jsonb where settings is null;
alter table public.tenants alter column settings set default '{}'::jsonb;
alter table public.tenants alter column settings set not null;
