# Celo Ads Manager: status

Built 2026-11-07. Plan and source-repo decisions: `PLAN.md`.

Legend: **Live** = calls the real Meta / Claude API in production. **Tested** = verified end-to-end against local stand-ins of the Graph and Anthropic APIs that return the documented response shapes (`/tmp` harness, not shipped). **Awaiting** = needs something from the operator before it can run for real.

| Capability | State |
|---|---|
| Multiple Meta Business connections, encrypted tokens, permission check (`me/permissions`), account discovery (`me/adaccounts`, business owned/client accounts) | Live code, Tested. **Awaiting a system-user token** |
| Link ad accounts to clients; per-account targets (result event, target CPA/ROAS, frequency ceiling) | Tested |
| Daily ad-level insights sync (90-day backfill, 7-day re-read), structure sync, roll-up into client pages | Live code, Tested |
| KPIs with date range and comparison (noise band, volume floors), diagnosis chain, reach/frequency live from Meta per window | Tested; analysis unit-tested (10 tests) |
| Campaign tree: pause/resume, daily budgets, duplicate (paused), rename, all via approval | Tested: Meta received exactly the approved writes |
| Campaign builder: objective, budget, geo/interest search, saved audiences, placements, Page/pixel, creative (URL or upload), draft previews | Tested. First real creation will confirm current Meta field requirements (e.g. Advantage+ audience flag, Page access) |
| Ad previews (existing ads and drafts) via Meta's preview frames | Tested (frame loads from facebook.com) |
| Rules: zero-result spend, high CPA, low ROAS, underspend, winner scaling, creative fatigue, performance shift → alerts + proposals | Tested |
| Approval queue: every write proposed, approved, executed and logged; activation of new campaigns is its own approval | Tested |
| Claude analysis (claude-opus-5-5, structured output, server-side refusal fallback): daily, weekly, deep analysis; recommendations become proposals | Tested against stub. **Awaiting an Anthropic API key** |
| Scheduled: daily Meta sync (11:00 UTC), daily Claude briefings / weekly on Mondays (11:30 UTC) | Live on deploy (Vercel Hobby: once a day each) |
| Client report: executive summary, KPIs, charts, campaigns, best ads; CSV; print-to-PDF; signed 30-day read-only share link | Tested (tampered link 404, CSV requires login) |

## Not built yet
- Editing an existing ad set's audience/placements from the UI (the executor supports targeting changes; no form yet).
- Lookalike / custom audience creation, A/B tests, catalogs (meta-ads-agent's audiences/experiments/catalog skills).
- Video creatives (image only in the builder).
- `ferrerponseti/claude-skills-growth-marketing`: not reachable; share access to include it.
