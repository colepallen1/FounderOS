/**
 * Database schema. Idempotent: every statement is safe to run on every boot.
 * Money is always integer cents. Dates are ISO strings or timestamptz.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  services JSONB NOT NULL DEFAULT '[]',
  retainer_cents INTEGER NOT NULL DEFAULT 0,
  start_date DATE,
  renewal_date DATE,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  email_domains JSONB NOT NULL DEFAULT '[]',
  stripe_customer_ids JSONB NOT NULL DEFAULT '[]',
  meta_ad_account_id TEXT NOT NULL DEFAULT '',
  google_ads_customer_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  priority INTEGER NOT NULL DEFAULT 2,
  due_date DATE,
  recurring_id TEXT,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cadence TEXT NOT NULL,
  anchor INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  active BOOLEAN NOT NULL DEFAULT true,
  last_generated_for DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS objectives (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  progress INTEGER NOT NULL DEFAULT 0,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  mrr_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  amount_cents INTEGER NOT NULL,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  failure_message TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_paid_at ON payments(paid_at);

CREATE TABLE IF NOT EXISTS ad_metrics (
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  day DATE NOT NULL,
  spend_cents INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions DOUBLE PRECISION NOT NULL DEFAULT 0,
  conversion_value_cents INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, platform, day)
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT false,
  attendees JSONB NOT NULL DEFAULT '[]',
  link TEXT NOT NULL DEFAULT '',
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  sender TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Billing detail for the revenue forecast (added 2026-11-02).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;

-- Off-Stripe payments that repeat (ACH, wire...). Each due date logs a payment (added 2026-11-02).
CREATE TABLE IF NOT EXISTS recurring_payments (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  interval TEXT NOT NULL,
  interval_count INTEGER NOT NULL DEFAULT 1,
  next_date DATE NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS recurring_id TEXT;

-- Repair (2026-11-02): JSON arrays once stored double-encoded as JSON strings.
UPDATE clients SET stripe_customer_ids = (stripe_customer_ids #>> '{}')::jsonb WHERE jsonb_typeof(stripe_customer_ids) = 'string';
UPDATE clients SET email_domains = (email_domains #>> '{}')::jsonb WHERE jsonb_typeof(email_domains) = 'string';
UPDATE clients SET services = (services #>> '{}')::jsonb WHERE jsonb_typeof(services) = 'string';
UPDATE subscriptions SET items = (items #>> '{}')::jsonb WHERE jsonb_typeof(items) = 'string';
UPDATE calendar_events SET attendees = (attendees #>> '{}')::jsonb WHERE jsonb_typeof(attendees) = 'string';

CREATE TABLE IF NOT EXISTS sync_runs (
  source TEXT PRIMARY KEY,
  last_started_at TIMESTAMPTZ,
  last_ok_at TIMESTAMPTZ,
  ok BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL DEFAULT ''
);
`;
