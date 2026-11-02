export const CLIENT_STATUSES = ['onboarding', 'active', 'paused', 'churned'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const SERVICES = ['Paid ads', 'Content & social', 'SEO', 'Other retainer'] as const;

export const TASK_COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'week', label: 'This week' },
  { id: 'progress', label: 'In progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
] as const;
export type TaskStatus = (typeof TASK_COLUMNS)[number]['id'];
export const TASK_STATUS_IDS = TASK_COLUMNS.map((c) => c.id) as TaskStatus[];

export const PRIORITIES = [
  { id: 1, label: 'High' },
  { id: 2, label: 'Normal' },
  { id: 3, label: 'Low' },
] as const;

export type Client = {
  id: string;
  slug: string;
  name: string;
  status: ClientStatus;
  services: string[];
  retainer_cents: number;
  start_date: string | null;
  renewal_date: string | null;
  contact_name: string;
  contact_email: string;
  website: string;
  email_domains: string[];
  stripe_customer_ids: string[];
  meta_ad_account_id: string;
  google_ads_customer_id: string;
  notes: string;
};

export type Task = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  client_slug: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: number;
  due_date: string | null;
  recurring_id: string | null;
  position: number;
};

export type Payment = {
  id: string;
  source: 'stripe' | 'manual';
  client_id: string | null;
  client_name: string | null;
  client_slug: string | null;
  stripe_customer_id: string | null;
  customer_label: string | null;
  amount_cents: number;
  refunded_cents: number;
  currency: string;
  status: 'paid' | 'failed' | 'refunded' | 'pending';
  method: string;
  description: string;
  failure_message: string;
  paid_at: string;
};

export type Subscription = {
  id: string;
  stripe_customer_id: string;
  customer_label: string;
  client_name: string | null;
  client_slug: string | null;
  status: string;
  mrr_cents: number;
  currency: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  description: string;
};

export type Recurring = { id: string; client_id: string | null; client_name: string | null; title: string; cadence: 'weekly' | 'monthly'; anchor: number; priority: number; active: boolean };
export type Objective = { id: string; client_id: string; title: string; target: string; progress: number; due_date: string | null };
export type CalEvent = { id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; link: string; client_id: string | null; client_name: string | null; client_slug: string | null };
export type Email = { id: string; thread_id: string; subject: string; sender: string; snippet: string; sent_at: string };
export type AdTotals = { platform: 'meta' | 'google'; spend_cents: number; impressions: number; clicks: number; conversions: number; conversion_value_cents: number; days: number };
