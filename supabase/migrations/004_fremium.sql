-- 004_fremium.sql — Add plan/premium support
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Add plan columns to learner_state
ALTER TABLE zivvvo.learner_state
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- Payment tracking table
CREATE TABLE IF NOT EXISTS zivvvo.payments (
  reference text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth.users(id),
  plan text NOT NULL,
  amount decimal NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  paynow_poll_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON zivvvo.payments(user_id);

ALTER TABLE zivvvo.payments ENABLE ROW LEVEL SECURITY;

-- Owners can read their own payments
CREATE POLICY "owner_read" ON zivvvo.payments
  FOR SELECT USING (auth.uid()::text = user_id);

-- Owners can insert their own payments
CREATE POLICY "owner_insert" ON zivvvo.payments
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
