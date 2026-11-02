# Projects

Live board of what is being built in this repo. Absolute dates only.

| Project | State | Waiting on | Folder |
|---|---|---|---|
| Celo Command (Celo Digital internal dashboard) | v1 merged 2026-11-02; Vercel project `founder-os` created (founder-os-pi-eight.vercel.app), first production deploy pending | Operator: Neon database, Stripe key, then Google / Meta | `docs/projects/celo-command/` (code in `celo/`) |

## Checklist
- [x] Celo Command v1: clients, client pages, work board, recurring tasks, money, integrations, two themes
- [x] Vercel project created (root dir `celo`), env vars set (2026-11-02)
- [ ] !Attach Neon database to the Vercel project
- [ ] !Paste Stripe restricted key + add webhook endpoint
- [ ] !Create Google OAuth client, connect Google; add Ads developer token
- [ ] !Paste Meta system user token; set ad account IDs per client
- [ ] Choose background sync cadence (Vercel Pro cron or external pinger)
