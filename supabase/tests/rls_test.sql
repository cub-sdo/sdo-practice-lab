-- Checks that the database rules in supabase/schema.sql do what the README promises.
-- Run after stubs.sql and schema.sql. Any failed check stops psql with an error.
\set ON_ERROR_STOP on

create function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> expected then
      raise exception 'expected error %, got % (%) for: %', expected, sqlstate, sqlerrm, stmt;
    end if;
    return;
  end;
  raise exception 'expected error %, but this succeeded: %', expected, stmt;
end $$;

-- 1. anonymous visitors: may add answers, nothing else
set role anon;
insert into public.attempts (run_id, mode, question_id, topic, week, correct, response)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'practice', 'w3-pipe-command', 'terminal', 3, true, '0'),
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'exam', 'w6-final-dot-mean', 'containers', 6, false, null);
select pg_temp.expect_error($$insert into public.attempts (created_at, run_id, mode, question_id, topic, week, correct) values (now() - interval '1 year', gen_random_uuid(), 'practice', 'w3-x', 'terminal', 3, true)$$, '42501');
select pg_temp.expect_error($$insert into public.attempts (run_id, mode, question_id, topic, week, correct) values (gen_random_uuid(), 'practice', '<script>', 'terminal', 3, true)$$, '23514');
select pg_temp.expect_error($$insert into public.attempts (run_id, mode, question_id, topic, week, correct) values (gen_random_uuid(), 'graded', 'w3-x', 'terminal', 3, true)$$, '23514');
select pg_temp.expect_error($$insert into public.attempts (run_id, mode, question_id, topic, week, correct, response) values (gen_random_uuid(), 'practice', 'w3-x', 'terminal', 3, true, repeat('x', 200))$$, '23514');
select pg_temp.expect_error($$select count(*) from public.attempts$$, '42501');
select pg_temp.expect_error($$update public.attempts set correct = true$$, '42501');
select pg_temp.expect_error($$delete from public.attempts$$, '42501');
select pg_temp.expect_error($$select public.class_stats()$$, '42501');
select pg_temp.expect_error($$select * from public.admins$$, '42501');
reset role;

-- 2. a signed-in user who is NOT a TA: sees nothing, cannot promote themselves
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  if (select count(*) from public.attempts) <> 0 then raise exception 'a non-TA user can read answers'; end if;
end $$;
select pg_temp.expect_error($$select public.class_stats()$$, '42501');
select pg_temp.expect_error($$insert into public.admins values ('22222222-2222-2222-2222-222222222222')$$, '42501');
select pg_temp.expect_error($$update public.attempts set correct = true$$, '42501');
reset role;

-- 3. a TA listed in public.admins: can read and summarise, still cannot change answers
insert into public.admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare
  s jsonb;
begin
  if (select count(*) from public.attempts) <> 2 then raise exception 'TA should see 2 answers'; end if;
  s := public.class_stats();
  if (s -> 'totals' ->> 'answers')::int <> 2 then raise exception 'class_stats totals wrong: %', s -> 'totals'; end if;
  if (s -> 'totals' ->> 'correct')::int <> 1 then raise exception 'class_stats correct count wrong'; end if;
  if jsonb_array_length(s -> 'days') <> 14 then raise exception 'class_stats should return 14 days'; end if;
  if jsonb_array_length(s -> 'questions') <> 2 then raise exception 'class_stats should list 2 questions'; end if;
  s := public.class_stats(now() + interval '1 day');
  if (s -> 'totals' ->> 'answers')::int <> 0 then raise exception 'since filter does not work'; end if;
end $$;
select pg_temp.expect_error($$delete from public.attempts$$, '42501');
reset role;

\echo 'All database rule checks passed.'
