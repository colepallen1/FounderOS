# Celo Command

The internal dashboard for Celo Digital. It shows clients, retainers, cash collected, work, and ad performance in one place.
Next.js 14 + Postgres. Two themes: **Penthouse** (black and gold) and **Cave** (steel-blue HUD), switched from the sidebar.

## What's in it

| Page | What it does |
|---|---|
| **Command** | MRR, cash collected this month vs the same point last month, failed payments, renewals due in 7 days, a 12-month revenue chart, tasks due now and this week, today's calls, client roster |
| **Clients** | One card per client: MRR, lifetime value, open and late tasks, ad spend |
| **Client page** | Tabs: **Overview** (KPIs, objectives with progress, to-do, autosaving notes, next calls and email), **Work** (that client's board and recurring tasks), **Revenue** (monthly chart, Stripe subscriptions, payment history, log an off-Stripe payment), **Ads** (Meta and Google: spend, CTR, conversions, CPA, ROAS, daily spend), **Comms** (Gmail threads and calendar events matched by email domain), **Settings** (profile, linked Stripe customers, ad account IDs, delete) |
| **Work** | Kanban board (Backlog, This week, In progress, Review, Done). Drag and drop on desktop; tap a card to edit on a phone. Filter by client. Recurring tasks (weekly or monthly) create themselves up to 6 days before they're due |
| **Money** | MRR split into Stripe and manual, run rate, live subscriptions, every payment (filter by paid, failed or refunded), a form for wire/ACH/PayPal/cash payments, and a warning for paying Stripe customers not linked to any client |
| **Integrations** | Paste keys and click Connect. No code. Keys are stored AES-256-GCM encrypted. Shows sync status for every source |

**How data stays live**
- **Stripe webhook**: payments and subscription changes land within seconds.
- **While a page is open**: it re-renders every minute and runs a full sync if data is more than 10 minutes old. The header shows *Live*, *Synced Xm ago* or *Sync issue*, plus a manual sync button.
- **Scheduled sync**: `/api/cron/sync` pulls every source even when nobody has the dashboard open (see *Background sync* below).

**MRR rules**
- If a client has linked Stripe customers, their MRR is the sum of those customers' active and past-due subscriptions, normalised to monthly. Discounts and tax are not applied.
- Otherwise it's the manual retainer you typed on the client.
- Past-due subscriptions still count toward MRR but are flagged in red.

## Run locally

```bash
cd celo
npm install
npm run dev        # http://localhost:3100
```

With no `DATABASE_URL`, it uses an embedded Postgres in `celo/.data/`. With no `CELO_PASSWORD`, local dev opens without a login and shows a warning banner. Production always requires the password.

`npm test` runs the unit tests (MRR math, recurring schedule, sessions and encryption, parsers). `npm run typecheck` checks types.

## Deploy to Vercel (about 15 minutes)

1. **Import the repo** in Vercel. Set **Root Directory** to `celo`. The framework preset is Next.js.
2. **Database**: Project → Storage → Create → **Neon** (free tier is fine) → connect it to the project. This sets `DATABASE_URL`. Tables are created on first request.
3. **Environment variables** (Project → Settings → Environment Variables):
   - `CELO_PASSWORD`: your login password
   - `CELO_SECRET`: output of `openssl rand -base64 32`
   - `CRON_SECRET`: output of `openssl rand -hex 24`
   - `CELO_TIMEZONE` (e.g. `America/New_York`) and `CELO_OWNER_NAME` (optional)
4. **Deploy**, open the URL, sign in, and go to **Integrations**.

### Stripe (one paste)
1. [Create a restricted key](https://dashboard.stripe.com/apikeys/create) named `Celo Command`:
   - **Read** on Customers, Charges, Subscriptions, Products and Prices
   - **Write** on Webhook Endpoints
2. Paste it on **Integrations → Stripe → Save**. The app then:
   - creates its own webhook at `/api/webhooks/stripe` and stores the signing secret
   - imports customers, subscriptions and 13 months of charges
3. On **Clients**, click **Import from Stripe**. Every paying customer becomes a client, already linked.

If you'd rather not give the key webhook access, leave that permission off, add the endpoint by hand in Stripe (events: `charge.*`, `customer.*`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`), and paste its `whsec_...` secret.

### Google (Calendar, Gmail, Google Ads)
1. [Google Cloud console](https://console.cloud.google.com) → create a project → enable the **Google Calendar API**, **Gmail API** and **Google Ads API**.
2. OAuth consent screen: set it to **External** and add yourself as a test user. Publishing it to production stops the refresh token expiring after 7 days.
3. Credentials → **Create OAuth client ID** → Web application. Authorized redirect URI: copy it from the Integrations page (`https://<your-app>/api/google/callback`).
4. Paste the client ID and secret on Integrations → **Connect Google**.
5. For Google Ads: paste your **developer token** (Google Ads → Tools → API Center) and your manager account ID if your clients sit under an MCC. Then set each client's customer ID on the client's Settings tab.
6. Calendar events and email match a client when an attendee or sender is on one of the client's **email domains** (client Settings).

### Meta Ads
Business Settings → Users → **System users** → add one with access to the client ad accounts → **Generate token** with `ads_read`. Paste it on Integrations, then set each client's ad account ID (`act_...`) on the client's Settings tab.

### Background sync
`vercel.json` schedules `/api/cron/sync` once a day. That's the most the Vercel Hobby plan allows. For true around-the-clock freshness, pick one:
- **Vercel Pro**: change the schedule in `vercel.json` to `*/15 * * * *`.
- **Free external pinger** (e.g. cron-job.org): `GET https://<your-app>/api/cron/sync` every 15 minutes with the header `Authorization: Bearer <CRON_SECRET>`.

Stripe stays real-time either way through the webhook.

## Security notes
- Every page and API route requires the session cookie, set by `middleware.ts`. The webhook checks Stripe's signature, and the cron route checks `CRON_SECRET`.
- Login attempts are rate limited (5 failures → 5-minute lockout per IP).
- Keys saved on the Integrations page are encrypted with a key derived from `CELO_SECRET`. Environment variables override saved keys.
- Google and Gmail access is read-only. Stripe needs only a read-only restricted key.

## Layout
```
app/            pages + API routes (auth, sync, cron, webhooks/stripe, google oauth)
components/     UI: Shell, Kanban, BarChart, forms, primitives (ui.tsx), icons
lib/db.ts       Postgres (DATABASE_URL) or embedded PGlite, one query function
lib/schema.ts   tables (idempotent, runs on boot)
lib/queries.ts  read models for pages
lib/actions.ts  server actions (every write)
lib/sync.ts     sync orchestrator + recurring task generation
lib/integrations/  stripe, google (calendar, gmail, ads), meta
lib/money.ts, recurring.ts, token.ts, slug.ts   pure logic, unit tested
```
