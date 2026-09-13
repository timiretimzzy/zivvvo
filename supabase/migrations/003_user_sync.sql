-- Migration 003: user-based sync (replaces device-scoped RLS)
-- Enables cross-device sync: sign in on any device and get your full progress back.
-- STRICTLY ADDITIVE where possible; modifies RLS policies.

-- 1. Add user_id columns --------------------------------------------------------
alter table zivvvo.attempts add column if not exists user_id text;
alter table zivvvo.learners add column if not exists user_id text;

-- 2. New table: full learner state (profile + reviews + engagement) ---------------
-- Stores the complete learner state for cross-device restore.
create table if not exists zivvvo.learner_state (
  user_id         text primary key,            -- supabase auth.uid()
  learner_id      text not null,               -- local learner id
  display_name    text,
  goal            text,
  exam_date       bigint,
  daily_minutes   integer,
  initial_confidence text,
  diagnostic_completed boolean default false,
  created_at      bigint,
  reviews         jsonb default '[]'::jsonb,   -- array of ReviewState
  engagement      jsonb,                       -- EngagementState object
  updated_at      bigint
);

-- 3. New table: user sessions log -------------------------------------------------
create table if not exists zivvvo.user_sessions (
  session_id      text primary key,
  user_id         text not null,
  learner_id      text not null,
  type            text not null,
  created_at      bigint not null,
  qids            jsonb default '[]'::jsonb    -- question ids in this session
);

-- 4. RLS for learner_state -------------------------------------------------------
alter table zivvvo.learner_state enable row level security;

drop policy if exists learner_state_insert on zivvvo.learner_state;
create policy learner_state_insert on zivvvo.learner_state
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists learner_state_select on zivvvo.learner_state;
create policy learner_state_select on zivvvo.learner_state
  for select to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists learner_state_update on zivvvo.learner_state;
create policy learner_state_update on zivvvo.learner_state
  for update to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- 5. RLS for user_sessions -------------------------------------------------------
alter table zivvvo.user_sessions enable row level security;

drop policy if exists user_sessions_insert on zivvvo.user_sessions;
create policy user_sessions_insert on zivvvo.user_sessions
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists user_sessions_select on zivvvo.user_sessions;
create policy user_sessions_select on zivvvo.user_sessions
  for select to authenticated
  using (auth.uid()::text = user_id);

-- 6. Add user_id based RLS for attempts (keep device-based for backward compat) --
-- Allow authenticated users to read/write their own data by user_id
drop policy if exists attempts_user_insert on zivvvo.attempts;
create policy attempts_user_insert on zivvvo.attempts
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists attempts_user_select on zivvvo.attempts;
create policy attempts_user_select on zivvvo.attempts
  for select to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists attempts_user_update on zivvvo.attempts;
create policy attempts_user_update on zivvvo.attempts
  for update to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- 7. Add user_id based RLS for learners ------------------------------------------
drop policy if exists learners_user_insert on zivvvo.learners;
create policy learners_user_insert on zivvvo.learners
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists learners_user_select on zivvvo.learners;
create policy learners_user_select on zivvvo.learners
  for select to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists learners_user_update on zivvvo.learners;
create policy learners_user_update on zivvvo.learners
  for update to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- 8. Grants -----------------------------------------------------------------------
grant select, insert, update on zivvvo.learner_state  to authenticated;
grant select, insert, update on zivvvo.user_sessions  to authenticated;

-- Indexes for fast lookups
create index if not exists attempts_user_idx on zivvvo.attempts (user_id);
create index if not exists learners_user_idx on zivvvo.learners (user_id);
create index if not exists user_sessions_user_idx on zivvvo.user_sessions (user_id);
