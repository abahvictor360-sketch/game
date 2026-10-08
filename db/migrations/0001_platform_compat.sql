-- Platform compatibility.
-- On Supabase the roles, the `auth` schema and auth.uid() already exist and are
-- left untouched. On plain Postgres / embedded PGlite (development and tests)
-- we create minimal stand-ins so the same migrations and RLS policies apply.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $f$
      create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'
    $f$;
  end if;
end $$;

grant usage on schema auth to anon, authenticated;

-- Private schema: never exposed through the Data API, no grants to client roles.
create schema if not exists private;
revoke all on schema private from public;
