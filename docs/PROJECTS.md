# Projects

Live board of what is being built in this repo. Absolute dates only.

| Project | State | Waiting on | Folder |
|---|---|---|---|
| Celo Command (Celo Digital internal dashboard) | v1 built 2026-11-02, not yet deployed | Operator: Vercel + Neon deploy, then paste Stripe / Google / Meta keys | `docs/projects/celo-command/` (code in `celo/`) |

## Checklist
- [x] Celo Command v1: clients, client pages, work board, recurring tasks, money, integrations, two themes
- [ ] !Deploy celo/ to Vercel (root dir `celo`), attach Neon, set CELO_PASSWORD / CELO_SECRET / CRON_SECRET
- [ ] !Paste Stripe restricted key + add webhook endpoint
- [ ] !Create Google OAuth client, connect Google; add Ads developer token
- [ ] !Paste Meta system user token; set ad account IDs per client
- [ ] Choose background sync cadence (Vercel Pro cron or external pinger)
