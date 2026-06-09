# Z8 Live QA Audit — 2026-06-10

**Method:** Automated Playwright browser testing of every route + visual inspection of 40+ screenshots + API validation + full test suite baseline.  
**Branch:** `audit/Z8-live-qa-deep-audit`  
**Commit:** Fixes committed as `fix(Z8-audit): resolve 4 launch-blocking issues`

---

## Baseline Status

| Suite | Result |
|---|---|
| Unit + component tests | 385 files / 4021 tests — all pass |
| Integration tests | 204 files / 2583 tests — all pass |
| Typecheck | Zero errors |
| Lint | Zero errors (331 warnings, all advisory) |

---

## Issues Fixed (4)

### FIX-1: Dev server PGlite path resolution (BLOCKER)

**Symptom:** `npm run dev` crashes with `relation "factory_settings" does not exist`.  
**Root cause:** `profiles.ts` sets `dbUrlDefault: "./hyperidle-pg"` (relative). `npm run setup` creates the database at repo root, but `npm run dev` starts the server from `packages/server/` (workspace CWD), so the relative path resolves to `packages/server/hyperidle-pg/` — an empty database.  
**Fix:** Added `resolvePglitePath()` in `server-factory.ts` that resolves relative paths from the repo root using `import.meta.url`.  
**File:** `packages/server/src/server-factory.ts`

### FIX-2: Rate limiter too aggressive for SPA (BLOCKER)

**Symptom:** 189 console errors (429 Too Many Requests) during normal page navigation. Every page shows error states ("Couldn't load threads — HTTP 429", "Failed to load org chart", "Failed to load model configuration"). Assistant overlay shows "HTTP 429 Retry".  
**Root cause:** Default rate limit was 60 req/min. Each SPA page load triggers 3-5 parallel API calls. Navigating 3 pages in 3 seconds = ~15 requests, exceeding 1/sec pacing.  
**Fix:** Increased default from 60 to 300 req/min. Still protective against abuse. Configurable via `HYPERIDLE_RATE_LIMIT_PER_MIN`.  
**File:** `packages/server/src/app.ts`

### FIX-3: Knowledge detail body shows "not found" (MAJOR)

**Symptom:** `/knowledge/seed-ki-1` renders title "Boil the Lake" and metadata, but body area shows "This knowledge item was not found." Kind shows "unknown" instead of "principle".  
**Root cause:** `GET /api/knowledge/:id` did not JOIN `knowledgeStrategyFabric`, so `kind`, `layer`, and `confidence` were missing from the response. The list endpoint (`GET /api/knowledge`) correctly does this JOIN.  
**Fix:** Added LEFT JOIN to `knowledgeStrategyFabric` in the detail endpoint. Returns `kind`, `layer`, `confidence` in the response.  
**File:** `packages/server/src/routes/knowledge.ts`

### FIX-4: Knowledge detail stale body on API load (MAJOR)

**Symptom:** Even after FIX-3, the body still showed fallback text because `savedContent` state was initialized from `FALLBACK_DETAIL.content` on first render (while API was loading) and never updated.  
**Root cause:** `useState(initialContent)` only runs the initializer once. When `apiItem` arrives, the `item` object changes but `savedContent` is stale.  
**Fix:** Added a stable React `key` (`knowledgeId-loaded/fallback`) on `KnowledgeDetailView` so it remounts when transitioning from fallback to real data.  
**File:** `packages/web/src/pages/KnowledgeDetail.tsx`

---

## Issues Found — Not Fixed (need separate pipeline runs)

### MEDIUM SEVERITY

| ID | Area | Issue | Recommendation |
|---|---|---|---|
| NF-1 | Portfolio | Filter pills show "Validated/Refuted/Partial/Inconclusive/Not evaluated" verdict pills alongside status pills. Visually indistinguishable from status filters, causing confusion. | Separate verdict pills into a distinct "Outcome" filter group with a label, or hide them until bets have outcomes. **Pipeline:** UX design decision. |
| NF-2 | Knowledge Detail | Raw ISO timestamp "2026-06-09T21:44:03.060Z" in header and metadata card. Should be humanized ("9 Jun 2026" or "less than an hour ago"). | Add a `formatTimestamp()` utility. **Pipeline:** Small workpackage. |
| NF-3 | Knowledge Detail | Editor field shows "seed-age..." (truncated agent ID) instead of display name "System Agent". | Resolve `updatedBy` agent ID to display name via API or JOIN. **Pipeline:** Small workpackage. |
| NF-4 | Conversations | Recipient picker shows "Propagation System" — an internal system user. System-role users should be filtered from the recipient list. | Filter `kind: "system"` users from the recipient picker query. **Pipeline:** Small fix. |
| NF-5 | Bet Detail | Budget stat card shows "-- of -- appetite" when no budget is set. Should show "No budget set" or hide the card. | Handle null appetite gracefully in the stat card. **Pipeline:** Small fix. |
| NF-6 | Bet Creation | Dialog only has "Description" field and "Title preview". Missing team selector and appetite field that the Z8 doc audit says should exist. | Design decision — may be intentional simplified flow. **Pipeline:** Verify with concept. |
| NF-7 | Settings | URL-driven section navigation (`?section=models`) doesn't scroll to the section — always shows Profile at top. | Check if section routing requires a scroll-to-section effect. **Pipeline:** Small fix. |

### MINOR SEVERITY

| ID | Area | Issue | Recommendation |
|---|---|---|---|
| NF-8 | Sidebar | Work section doesn't show team sub-items. Conversations doesn't show recent threads when threads exist. | Check sidebar data population logic. May be a seed data gap (only 1 team, 0 conversations). |
| NF-9 | Knowledge Detail | "confidence n/a by unknown" header line — "unknown" should show the knowledge kind or be omitted when unknown. | Render kind from the API response in the sub-header. |
| NF-10 | Agent Profile | Avatar shows "BU" initials instead of something meaningful for "Build Facilitator". | Check avatar initial generation logic — may want first letter of first+last word. |
| NF-11 | Conversations | "No threads yet" sidebar label when no conversations exist — works correctly, but "New thread" button only shows in the empty state CTA, not in the header. | Add persistent "New thread" button in conversations header. |
| NF-12 | Mobile | "Conversations" title appears twice on mobile (once in top bar, once as page heading). | Remove duplicate heading on mobile viewport. |
| NF-13 | Settings Models | Model names show internal IDs ("claude-opus-4-202505", "claude-haiku-3-5-2024..."). Truncated and not user-friendly. | Show human-readable model names or format model IDs. |

---

## Features Verified Working

| Feature | Status | Notes |
|---|---|---|
| Root redirect (/ → /work/portfolio) | OK | Redirects correctly based on setup state |
| Portfolio / bet grid | OK | Shows seed bet, filter pills work, "New bet" button visible |
| Bet detail page | OK | Breadcrumb, stat cards, pitch, tasks, artifacts sections render |
| Team drill-down | OK | Burn vs cap, routines, capacity, empty state for bets |
| Knowledge list | OK | Curated/Triage tabs, scope pills, sort options, seed item visible |
| Knowledge detail | OK | Body, metadata, discussion thread, backlinks render correctly |
| Knowledge create | OK | Title, body editor, scope selector, Cancel/Create buttons |
| Conversations (empty state) | OK | "No conversations yet" + "Start a thread" CTA |
| New conversation / recipient picker | OK | Shows all agents and users with search |
| Bet creation dialog | OK | Description field, title preview, Cancel/Create |
| Global search (Cmd+K) | OK | Opens dialog, search input, shows results for "daily" |
| Settings overlay | OK | All 8 sections render: Profile, Org Chart, Models, Appearance, Credentials, Notifications, Teams, Backend |
| Settings Profile | OK | Name/email fields, save button |
| Settings Models | OK | 3 tiers (Reasoning/Workhorse/Fast), provider+model selects |
| Settings Appearance | OK | Light/Dark/System theme swatches, immediate switch |
| Agent profile | OK | Config, harness capabilities, review track record, performance |
| Assistant overlay | OK | Opens from sidebar, shows thread shell with composer |
| 404 page | OK | "Page not found" + "Go to conversations" / "Go back" buttons |
| Setup flow | OK | Name, API key, project folder, team type selector |
| Mobile responsive | OK | Sidebar collapses, content adapts, touch-friendly |
| Theme switching | OK | Light ↔ Dark works, persists to localStorage |

---

## Test Suite After Fixes

| Suite | Before | After |
|---|---|---|
| Unit + component | 4021 pass | 4021 pass |
| Integration | 2583 pass | 2583 pass |
| Typecheck | 0 errors | 0 errors |
| Lint | 0 errors | 0 errors |
| Browser console errors | 194 | 0 |
| 429 rate limit errors | 189 | 0 |
