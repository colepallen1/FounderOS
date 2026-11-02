# Celo Command: tasks

Standalone Next.js 14 + Postgres app in `celo/`, deployed on Vercel with Neon. Full setup guide: `celo/README.md`.

## Decisions (operator, 2026-11-02)
- Standalone app, kept in this repo under `celo/`. It shares no code with FounderOS.
- Hosted on Vercel with hosted Postgres (Neon), so it can be opened from a phone.
- Single user, one password.
- Billing: Stripe monthly retainers plus payments outside Stripe, logged by hand.
- Services: paid ads, content/social, SEO/other retainers.
- Sources: Stripe, Google Calendar + Gmail, Meta Ads, Google Ads.
- Work: Kanban plus recurring tasks. Per-client objectives and notes.
- Home leads with money and today's work.
- Themes: Penthouse (default) and Cave, switchable.

## Done (2026-11-02)
- [x] Data layer (Postgres / PGlite), schema, server actions
- [x] Login (HMAC session, rate limit), middleware on every route
- [x] Integrations vault (AES-GCM), Integrations page
- [x] Stripe sync + webhook; Calendar, Gmail, Google Ads, Meta sync
- [x] Command, Clients, Client page (6 tabs), Work, Money
- [x] Live pulse (re-render 60s, sync if stale > 10 min), cron route
- [x] Unit tests (20), typecheck, production build, Playwright walkthrough on both themes and at phone width

## Next
- [ ] Deploy and connect real keys (see board checklist)
- [ ] Verify Stripe MRR against the Stripe dashboard once real data is in
- [ ] Ideas the operator may want: expenses/profit view, client portal, Slack alerts on failed payments
