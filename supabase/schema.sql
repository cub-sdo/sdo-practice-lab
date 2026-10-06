-- SDO Practice Lab: anonymous class statistics
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → Run).
-- It is safe to run again: every statement is idempotent.
--
-- What is stored: one row per answered question - which question, right or wrong, the chosen answer,
-- practice or exam, a random id for the run, and the time. No name, no student id, no device identifier.
-- Who can do what:
--   anonymous visitors (the practice site)  -> may only ADD rows, never read them
--   TA accounts listed in public.admins     -> may read rows and call class_stats()

-- ---------------------------------------------------------------------------
-- answers
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  run_id      uuid not null,
  mode        text not null check (mode in ('practice', 'exam', 'rerun')),
  question_id text not null check (question_id ~ '^w[0-9]{1,2}-[a-z0-9-]{1,80}$'),
  topic       text not null check (topic ~ '^[a-z-]{1,30}$'),
  week        smallint not null check (week between 1 and 14),
  correct     boolean not null,
  response    text check (char_length(response) <= 120)
);
create index if not exists attempts_created_at_idx on public.attempts (created_at);
create index if not exists attempts_question_idx on public.attempts (question_id);

alter table public.attempts enable row level security;

-- Start from nothing, then grant exactly what is needed.
revoke all on public.attempts from public, anon, authenticated;
-- Visitors can insert these columns only (not id, not created_at).
grant insert (run_id, mode, question_id, topic, week, correct, response) on public.attempts to anon, authenticated;
-- Signed-in users get SELECT, but the policy below limits it to TA accounts.
grant select on public.attempts to authenticated;

-- ---------------------------------------------------------------------------
-- TA accounts
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- row level security policies
-- ---------------------------------------------------------------------------
drop policy if exists "visitors can add answers" on public.attempts;
create policy "visitors can add answers"
  on public.attempts for insert
  to anon, authenticated
  with check (true);   -- the column grants and CHECK constraints above limit what can be written

drop policy if exists "TAs can read answers" on public.attempts;
create policy "TAs can read answers"
  on public.attempts for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- dashboard summary (called by site/stats.html)
-- ---------------------------------------------------------------------------
create or replace function public.class_stats(since timestamptz default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only TA accounts can read class statistics' using errcode = '42501';
  end if;

  with a as (
    select * from public.attempts where since is null or created_at >= since
  ),
  per_question as (
    select question_id, count(*) as answers, count(*) filter (where correct) as correct
    from a group by question_id
  ),
  top_wrong as (
    select distinct on (question_id) question_id, response as top_wrong, n as top_wrong_n
    from (
      select question_id, response, count(*) as n
      from a where not correct and response is not null
      group by question_id, response
    ) s
    order by question_id, n desc, response
  ),
  per_day as (
    select (created_at at time zone 'Europe/Berlin')::date as day,
           count(*) as answers, count(distinct run_id) as runs
    from public.attempts
    where created_at >= now() - interval '15 days'
    group by 1
  ),
  days as (
    select g::date as day, coalesce(p.answers, 0) as answers, coalesce(p.runs, 0) as runs
    from generate_series((now() at time zone 'Europe/Berlin')::date - 13,
                         (now() at time zone 'Europe/Berlin')::date, interval '1 day') g
    left join per_day p on p.day = g::date
  )
  select jsonb_build_object(
    'generated_at', now(),
    'since', since,
    'totals', (
      select jsonb_build_object(
        'answers', count(*),
        'correct', count(*) filter (where correct),
        'runs', count(distinct run_id),
        'exam_runs', count(distinct run_id) filter (where mode = 'exam'),
        'first_at', min(created_at),
        'last_at', max(created_at))
      from a),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('topic', topic, 'answers', n, 'correct', c) order by topic)
      from (select topic, count(*) as n, count(*) filter (where correct) as c from a group by topic) t), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', q.question_id, 'answers', q.answers, 'correct', q.correct,
        'top_wrong', w.top_wrong, 'top_wrong_n', w.top_wrong_n))
      from per_question q left join top_wrong w using (question_id)), '[]'::jsonb),
    'days', (select jsonb_agg(jsonb_build_object('day', day, 'answers', answers, 'runs', runs) order by day) from days)
  ) into result;

  return result;
end;
$$;
revoke all on function public.class_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.class_stats(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- After creating your TA user (Authentication → Users → Add user), make it an admin:
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'your.email@example.com'
--   on conflict do nothing;
-- ---------------------------------------------------------------------------
