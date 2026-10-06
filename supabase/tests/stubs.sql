-- Minimal stand-ins for what Supabase already provides (roles, auth schema, auth.uid()).
-- Used ONLY by CI to test supabase/schema.sql on a plain Postgres. Never run this on Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase grants broad default privileges on new objects; mimic that so the schema's revokes are tested.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'ta@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'student@example.com');
