-- Per-tenant visual identity for the public chat page: a logo and an
-- optional brand colour.
--
-- Both are nullable. A business that uploads neither still gets a
-- polished page — the chat falls back to a monogram built from its name
-- and to the default brand colour in lib/branding.ts.

alter table public.tenants
  add column if not exists logo_url text,
  add column if not exists brand_color text;

-- brand_color is interpolated into inline styles on a PUBLIC page, so its
-- shape is constrained here as well as in the server action. Anything
-- other than a 6-digit hex colour is rejected by the database, which
-- means a bad value can't reach the browser even if it were written by
-- some future code path that forgot to validate.
--
-- Deliberately strict: no 3-digit shorthand, no named colours, no
-- rgb()/hsl() functional syntax. One canonical format is far easier to
-- parse for the luminance/contrast calculation that picks readable
-- foreground text.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_brand_color_format_check'
  ) then
    alter table public.tenants
      add constraint tenants_brand_color_format_check
      check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;
