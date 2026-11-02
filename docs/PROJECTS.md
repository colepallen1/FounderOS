# Projects

Live board of what is being built in this repo. Absolute dates only.

| Project | State | Waiting on | Folder |
|---|---|---|---|
| Celo Command (Celo Digital internal dashboard) | v1 merged 2026-11-02; Vercel project `founder-os` created (founder-os-pi-eight.vercel.app), live with Neon + Stripe syncing (2026-11-02) | Operator: Google, then Meta | `docs/projects/celo-command/` (code in `celo/`) |

## Checklist
- [x] Celo Command v1: clients, client pages, work board, recurring tasks, money, integrations, two themes
- [x] Vercel project created (root dir `celo`), env vars set (2026-11-02)
- [x] Neon database attached; Stripe key saved and syncing (2026-11-02)
- [x] Revenue forecast (30/60/90 days, 6 months, upcoming charges)
- [x] Stripe customers auto-import as clients; recurring off-Stripe payments (2026-11-02)
- [ ] !Greg: set up his recurring ACH payment (pay day unknown)
- [ ] !Create Google OAuth client, connect Google; add Ads developer token
- [ ] !Paste Meta system user token; set ad account IDs per client
- [ ] Choose background sync cadence (Vercel Pro cron or external pinger)
