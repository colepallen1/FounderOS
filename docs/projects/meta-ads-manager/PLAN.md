# Celo Ads Manager: integration plan

Started 2026-11-07. Lives inside Celo Command (`celo/`). Status of each part is
tracked in `TASKS.md` next to this file.

## 1. Source repositories: what was inspected, what is reused

| Repo | License | What it actually contains | Reuse |
|---|---|---|---|
| `meta/facebook-python-business-sdk` (v26.0.4) | Facebook Platform License: use permitted in connection with Meta's APIs; not OSI | Generated Python object model for the Marketing API | **Reference only.** Our app is TypeScript, so no code is imported. Used as the authoritative source for field names, enums (campaign objectives `OUTCOME_*`, `AdFormat` preview placements, `/copies` parameters such as `deep_copy`, `status_option`, `rename_options`) and to confirm Graph API **v26.0**. |
| `bartlomiejborzucki/meta-ads-agent` (Python, 265 files) | MIT | The strongest source: deterministic analysis (fatigue, period compare, pacing, breakdowns, power), plan validation (budget/ad set/creative checks), duplication, an action log, and a safety model where nothing spends without explicit approval | **Logic ported to TypeScript with attribution** (MIT allows it): fatigue detection (CTR vs the ad's own best prior window, click floor, window-only frequency, sibling check), period comparison (noise band 10%, volume floors 500 clicks / 30 results, the CPM→CTR→CPC→CVR→CPA rule table), daily budget pacing, budget-change checks. Its approval model is the basis of our approval queue. Its runtime path (Meta's hosted MCP server, Markdown skills, CLI, YAML workspace) is **not** used: our app talks to the Marketing API directly from the server. |
| `bosar-academy/meta-ads-dashboard` (Next.js) | **No license file** (all rights reserved by default) | Single-account dashboard: AI daily briefing, scorecard with green/yellow/red bands, creative leaderboard, budget what-if simulator, action log | **Ideas only, no code copied.** Briefing, scorecard bands, creative leaderboard and the action log are reimplemented from scratch in our own code. |
| `curtiskline/meta-ads-manager` (Next.js + Supabase) | MIT | A `create-next-app` starter page and Supabase auth boilerplate. **No Meta API code**, despite the README's feature list | **Nothing reused** beyond the idea of per-vertical campaign templates (backlog). |
| `ferrerponseti/claude-skills-growth-marketing` | — | **Not reachable**: GitHub reports the repository does not exist or is not accessible to this session (checked 2026-11-07) | None. Share access or a correct URL to include it. |

## 2. Architecture decisions

- **Stay on the existing stack.** Celo Command runs Next.js 14 + Tailwind with its own component kit (not shadcn/ui), Neon Postgres, and its own signed-session login. Supabase would add a second database and auth system and split client data, so it is not added. Requirement met: persistent data and auth already exist.
- **Official Marketing API only**, Graph v26.0, called server-side. Tokens never reach the browser.
- **Multiple Meta connections** (`meta_connections`): each is one Business Manager system-user token, AES-GCM encrypted with `CELO_SECRET`. Ad accounts (`meta_ad_accounts`) belong to one connection and are linked to one Celo client. Every Graph call for an account uses that account's own connection token.
- **Client isolation:** every query for ads data is scoped by `client_id` through `meta_ad_accounts`. Shared client reports use a per-client signed link that can only read that client.
- **Data path:** daily ad-level insights (`time_increment=1`) are synced into `meta_insights_daily`. Reach and frequency are never summed across days (that double-counts people). They come from a live window query for the selected range, cached briefly.
- **Approval workflow:** every write to Meta (pause, resume, budget, duplicate, create, edit) becomes a row in `meta_actions`. It runs only after approval, and the result is logged. Rules and Claude can only *propose*.
- **Claude** (Anthropic SDK, `claude-opus-5-5`, adaptive thinking, server-side refusal fallback) interprets numbers that our deterministic code computed. It never calculates metrics itself and never executes changes.
- **Status labels** on every panel: **Live** (fetched from Meta just now), **Synced** (from the database, with time), **Needs permission** (the token lacks a scope), **Not configured**. There is no simulated data in production. The test stub is used only in automated tests.

## 3. Meta permissions

| Capability | Permission on the system-user token |
|---|---|
| Read accounts, campaigns, insights | `ads_read` |
| Pause, budgets, duplicate, create, edit | `ads_management` |
| List business-owned / client ad accounts | `business_management` |
| Choose a Facebook Page for new ads | `pages_show_list`, `pages_read_engagement` (+ the Page assigned to the system user) |

Own-business use with client accounts shared into your Business Manager works with Standard Access. Higher rate limits need Advanced Access via App Review.

## 4. Phases

1. Connections and accounts (multiple businesses, discovery, permission check, link accounts to clients).
2. Analytics (daily sync, KPIs with date range and comparison, rankings, frequency/reach done correctly).
3. Campaign management (tree view, pause/resume, budgets, duplicate, edit, create wizard with previews), all through approvals.
4. Automation (pacing, underperformers, fatigue, zero-result spend, alerts, proposed optimizations).
5. Claude intelligence (analysis, winners/losers, fatigue explanation, budget recommendations, daily/weekly summaries).
6. Client reporting (per-client report, executive summary, charts, CSV and print-to-PDF export, read-only share link).

Each phase is tested against a local stub of the Graph API (and of the Claude API) that mirrors the documented response shapes, and then against your live account once a token is connected.
