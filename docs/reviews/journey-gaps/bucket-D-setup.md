# Bucket D — Setup / First-run / Mobile (Wave 3)

Audit date: 2026-04-26
Audit method: Playwright headless against running dev server (http://localhost:5173). Read-only walk-throughs, single-click verifications, screenshots of every state reached.

Journeys in scope (5 Major):

| Rank | ID(s) | JTBD |
|---|---|---|
| 8 | DL-26 / DL-27 | Mobile factory glance + one blocking review on phone in <60s |
| 14 | FR-01 / FR-03 | Bootstrap a new factory and seed the North Star (PRINCIPLES/FOCUS/PORTFOLIO) |
| 15 | FR-02 | Connect the model API key |
| 16 | FR-12 | Walk through the first verdict end-to-end (learn A/R/X/S grammar) |
| 25 | FR-07 / FR-08 / FR-10 | Assemble first product team + author brief + configure cycle |

Surfaces verified by screenshot:
- `/` (root → redirects to `/conversations/review`) — desktop populated
- `/work/portfolio` — desktop populated
- `/work/team` — desktop populated
- `/knowledge` — desktop populated
- `/conversations/review?settings=open` — Profile / Products / Agents / Notifications / Appearance tabs
- All four routes at iPhone 14 Pro (390×844) viewport with mobile UA

---

## Rank 8 — DL-26 / DL-27 — Mobile glance + blocking review on phone (<60s)

**Status: BROKEN**

### Walk-through

1. Open `http://localhost:5173/` at iPhone 14 Pro viewport (390×844, devicePixelRatio 3, mobile UA).
2. Expected: Rail-as-Home (DL-26 step 1–3) — single-screen list of factory state, tap-through to thread.
3. Actual: full desktop layout (IconRail | Submenu | Main | Rail) is rendered horizontally. Submenu header truncates to "CON". Verdict bar buttons truncate to "Appr…", "Requ…", "Rejec…", "Snoo…". Rail collapses to show only "BLK1" badge and a "2" counter.
4. Navigate to `/conversations/review` (DL-27 step 2). Same outcome — verdict buttons are clipped at the right edge of the viewport. There is no way to invoke Approve/Reject/Request Changes/Snooze with a thumb tap because the targets are off-screen.

### State matrix

| State | Reachable? | Notes |
|---|---|---|
| Empty | partial | empty thread states render but layout is still desktop |
| Loading | n/a | dev data is seeded |
| Populated | yes — but unusable | desktop layout served at 390px |
| Error | n/a | no offline mode (ADV-03 also missing) |

### Gaps

| ID | Severity | Gap |
|---|---|---|
| D-DL26-1 | **broken** | `useViewportBreakpoint` only tracks two thresholds (≥1024 expand submenu, ≥1280 expand rail). No mobile breakpoint, no three-tab layout. The HUMAN_INTERFACE_LAYER spec mandates three tabs (Conversations / Work / Knowledge) on mobile — none exist. |
| D-DL26-2 | **broken** | Rail is squeezed into ~5–10% of viewport width on phone. "BLK1" is the only readable token. Founder cannot do morning glance. |
| D-DL26-3 | **broken** | Submenu still allocates a column even at 390px, leaving Main with ~600px of clipped horizontal scroll content. |
| D-DL27-1 | **broken** | Verdict bar (Approve / Request changes / Reject / Snooze / Pause) is horizontally clipped — A/R/X/S keys are off-screen and there is no thumb-reachable verdict surface. AQ-015 (≥44px touch targets at viewport ≤1024px) cannot be evaluated because the buttons do not fit on screen. |
| D-DL27-2 | **broken** | Above-fold content on phone is the avatar + name + diff fragment. Verdict buttons (the unit of value) are below or off the right edge. The "<60s blocking review" journey is not achievable. |
| D-DL26-4 | **missing** | No push-notification → deep-link path documented in the running app (DL-27 step 1). No service worker. No notification permission prompt anywhere. |
| D-DL26-5 | **missing** | No mobile bottom-tab nav. IconRail is rendered as the same vertical 32px-wide gutter on phone, with icons that overflow into the submenu column (visible artifact: red dots float over "WOR" text in the portfolio shot). |

### Notes

- Viewport: iPhone 14 Pro emulation — width 390px, height 844px, `devicePixelRatio: 3`, mobile user agent, touch enabled.
- Screenshots: `screenshots/D-DL26-mobile-rail-glance.png`, `screenshots/D-DL27-mobile-verdict.png`, `screenshots/D-mobile-portfolio.png`, `screenshots/D-mobile-knowledge.png`.
- Rank 8 is "load-bearing per Wave 1 (3 of daily-core JTBDs are phone-first)" — this is the highest-mass mobile gap in the whole catalog.

---

## Rank 14 — FR-01 / FR-03 — Bootstrap factory + seed North Star

**Status: MISSING (entire journey)**

### Walk-through

1. Load `http://localhost:5173/` cold. Expected (FR-01 step 1): "Found your factory" empty shell with name field + profile picker + data-dir + create-factory CTA.
2. Actual: redirect to `/conversations/review` showing a populated review queue ("Developer Agent", text_diff, $12.40 today cost). State is pre-seeded; no first-run gate exists.
3. Search for "Models & Keys" / "Bootstrap" / "Create factory" in Settings (Profile / Products / Agents / Notifications / Appearance) — none present.
4. Submenu header shows "CONVERSATIONS 4" with a chevron. Clicking the chevron does nothing (no factory switcher / no "create new factory" affordance).
5. FR-03: Knowledge view has Practice / Product / Factory scope tabs in the submenu. Clicking "Factory" — content area still shows the pre-seeded Practice items; PRINCIPLES.md / FOCUS.md / PORTFOLIO.md are not surfaced as edit targets. Source-grep confirms zero references to PRINCIPLES, FOCUS, PORTFOLIO, North Star, factory bootstrap, or onboarding wizard in `packages/web/src`.

### Gaps

| ID | Severity | Gap |
|---|---|---|
| D-FR01-1 | **missing** | No first-run flow at all. App lands directly on a populated factory. There is no "no factory exists yet" empty state, no factory-name field, no profile picker (laptop / VPS / cloud), no data-directory confirmation, no create-factory CTA. |
| D-FR01-2 | **missing** | No factory switcher and no "create new factory" entry in Settings, the submenu header dropdown, or the avatar menu. A founder with an existing factory cannot start a second one. |
| D-FR03-1 | **missing** | No North-Star seeding UI. PRINCIPLES.md / FOCUS.md / PORTFOLIO.md are not modelled as first-class knowledge items in any submenu, scaffold, or empty state. |
| D-FR03-2 | **missing** | No scaffolded markdown templates with prompts (FR-03 step 2-4). Knowledge detail surface exists but assumes the item already exists. |
| D-FR03-3 | **missing** | No L4 propagation indicator and no "first L4 read at next session start" feedback (FR-03 step 5). |
| D-FR01-3 | **missing** | No Coach welcome thread. Conversations/Chat shows a single seeded thread but it is not labelled as Chief of Staff and contains no orientation prompts. |

### Notes

- Discoverability for a brand-new founder: zero. Without docs, a fresh install cannot be configured. The path "open app → see directions" does not exist.

---

## Rank 15 — FR-02 — Connect model API key

**Status: MISSING (entire journey)**

### Walk-through

1. Open Settings (avatar bottom-left of IconRail). Tabs: Profile, Products, Agents, Notifications, Appearance. **No "Models & Keys" tab.**
2. Source-grep confirms: no API-key input, no model-tier dropdown, no test-connectivity button, no env-var capture UI, no masked-secret affordance anywhere in `packages/web/src` (the only matches for "API key" / "tier" are in DesignSystem and storybook fixtures — not real surfaces).
3. There is no Coach prompt "before any agent runs we need a key" because there is no Coach thread (see FR-01).
4. There is no Settings deeplink from an empty Rail state because the Rail is always populated with seeded data.

### Gaps

| ID | Severity | Gap |
|---|---|---|
| D-FR02-1 | **missing** | No API-key entry surface anywhere in the app. |
| D-FR02-2 | **missing** | No model-tier mapping (Reasoning / Workhorse / Fast → concrete model IDs). |
| D-FR02-3 | **missing** | No "Test key" button → no success/error inline feedback. |
| D-FR02-4 | **missing** | No masked-secret input pattern (FR-02 step 5: "never echoed back in plaintext" cannot be evaluated because the input does not exist). |
| D-FR02-5 | **missing** | Hard gate: per the spec "no key, no factory" — but the factory runs anyway with seeded fixtures, so the gate is silently bypassed in dev. There is no dev-vs-real-key warning. |

---

## Rank 16 — FR-12 — Walk through first verdict (learn A/R/X/S grammar)

**Status: DEGRADED**

### Walk-through

1. Land on `/conversations/review`. A thread is auto-selected ("Developer Agent" text_diff). Verdict bar is visible: Approve A, Request changes R, Reject X, Snooze S, Pause P, More.
2. The mechanics of the verdict bar work — keyboard hints `[A] [R] [X] [S] [P]` are rendered next to each button.
3. **No first-time tooltip overlay.** No "?" key shortcut help (ADV-06 also missing). No "this is your first verdict" coach mark. No reasoning panel pinned-open by default to teach the grammar.
4. Audit trail is not shown at the bottom of the thread — only "Related history". A founder learning the grammar has no way to see what their verdict actually did.
5. Pressing `?` at the keyboard does nothing observable.

### Gaps

| ID | Severity | Gap |
|---|---|---|
| D-FR12-1 | **missing** | No first-time onboarding overlay or coach mark for the verdict bar. The verdict grammar is the product, and the entire learning surface is absent. |
| D-FR12-2 | **missing** | No `?` key help / cheat-sheet (ADV-06 confirmed missing here too). |
| D-FR12-3 | **degraded** | Reasoning is collapsed by default behind "> REASONING 5 steps". A first-timer is asked to verdict before being shown why. The spec says "reasoning panel always visible" for FR-12. |
| D-FR12-4 | **missing** | No "see agent acknowledge" feedback loop (FR-12 step 5). After a verdict, there is no visible state showing the agent picked it up. |
| D-FR12-5 | **degraded** | Inline-comment affordance not visibly discoverable on the populated diff (no hover-anchor indicator, no "click line to comment" hint). |

---

## Rank 25 — FR-07 / FR-08 / FR-10 — Assemble first team + author brief + configure cycle

**Status: BROKEN (FR-07, FR-08), DEGRADED (FR-10)**

### Walk-through

1. Open `/work/portfolio`. Four product cards exist (Hyperidle Core, Knowledge Fabric, Review Worker, Agent Runtime). Clicking a card does **nothing** — no detail view, no team-assembly entry. Hovering shows no affordance. There is also no "+ New product" CTA anywhere. (FR-06 entry is missing too, which gates FR-07.)
2. Submenu lists "Portfolio" + "Team Board". Click "Team Board" → static kanban (Shaped / Committed / Planned / Blocked / In Progress / Done) with hard-coded products. No team-roster view, no "Add team member", no role list, no harness picker, no autonomy slider.
3. Settings → Agents has only two rows ("Architect", "Developer") with autonomy dropdowns (Supervised / Autonomous) and a Pause action. No "add agent", no role assignment, no per-skill autonomy (PU-10 also affected), no harness picker.
4. FR-08 (BRIEF.md / ARCHITECTURE.md / BRAND.md / PRINCIPLES.md): no per-product knowledge scope visible. Knowledge submenu has Practice / Product / Factory scope tabs — clicking "Product" lists generic items, not the four-doc scaffold.
5. FR-10 (cycle config): Portfolio shows a "CYCLE 12 — 9 days remaining" footer band. It is read-only — no length picker, no phase indicator (Shaping / Betting / Building / Cool-down), no "Start cycle" CTA, no cool-down duration field.

### Gaps

| ID | Severity | Gap |
|---|---|---|
| D-FR07-1 | **broken** | Product cards are unclickable. No drilling into a product → cannot reach team-assembly. |
| D-FR07-2 | **missing** | No team-roster view. PM / Builder / Growth / Ops roles are not modelled in UI. |
| D-FR07-3 | **missing** | No suggested-roster card (FR-07 step 1). |
| D-FR07-4 | **missing** | No harness picker (Claude Agent SDK default). |
| D-FR07-5 | **missing** | No autonomy slider per role with L1 default (FR-07 step 4). Only flat Supervised/Autonomous toggle exists in Settings → Agents. |
| D-FR07-6 | **missing** | No "Activate team" primary CTA. |
| D-FR08-1 | **missing** | No four-doc scaffold (BRIEF / ARCHITECTURE / BRAND / PRINCIPLES) per product. |
| D-FR08-2 | **missing** | No "draft for me" path (FR-08 step 3) opening a Coach review thread. |
| D-FR08-3 | **missing** | No version history on knowledge save (FR-08 step 4). |
| D-FR10-1 | **degraded** | Cycle indicator is read-only; no length picker, no cool-down config, no phase advance affordance (also affects ADV-05). |
| D-FR10-2 | **missing** | No "Start cycle" CTA, no phase indicator chip beyond the "9 days remaining" countdown. |
| D-FR07-7 | **missing** | FR-09 budget setup is also surfaced from FR-07 confirmation — no budgets surface anywhere. Settings has no factory > team > agent nested cap inputs. |

---

## Bucket summary

**Counts**

| Severity | Count |
|---|---|
| broken | 12 |
| missing | 22 |
| degraded | 4 |
| **total gaps** | **38** |

**Top 3 most-impactful gaps**

1. **No first-run flow exists at all.** FR-01, FR-02, FR-03 are 100% missing. The app boots into a populated factory with no path to create one, name one, switch one, set the North Star, or connect a model key. A fresh install is non-functional outside of demo data.
2. **No mobile layout.** The HUMAN_INTERFACE_LAYER spec mandates three tabs (Conversations / Work / Knowledge) on phone. Implementation has only two desktop breakpoints (1024 / 1280). At 390px the desktop columns crush each other; verdict buttons are clipped off-screen, the Rail collapses to a 5%-wide gutter showing "BLK1". Rank-8 daily-core journey is unreachable on phone.
3. **No team-assembly path.** Product cards are unclickable. Cycle config is read-only. There is no roster view, no harness picker, no autonomy ladder beyond a flat Supervised/Autonomous toggle. The "product is real" moment (FR-07 + FR-08 + FR-10) cannot be completed in-app.

**Cold-start verdict for a brand-new founder: NO.**

A first-time founder, given a fresh install and no docs, cannot bootstrap a factory, connect a key, seed the North Star, assemble a team, write a brief, configure a cycle, or learn the verdict grammar through the UI today. Every cold-start journey in this bucket is missing in whole or in part. The fact that the dev server *appears* functional is purely because demo data is seeded into SQLite at startup; the founder-facing setup chrome has not been built.

**Mobile-specific findings (one-liner each):**

- Layout: only two desktop breakpoints exist; no mobile three-tab nav, no bottom-tab navigation, no responsive collapse of the Rail or Submenu below 1024px.
- Touch targets: cannot evaluate AQ-015 (≥44px) because the verdict bar is horizontally clipped and the buttons are partially off-screen.
- Verdict grammar: A/R/X/S is keyboard-only by design — on phone there is no keyboard, and the buttons that replace the keys are not thumb-reachable.
- Morning glance: does not fit one screen; the Rail (the canonical morning-glance surface) is squeezed to a sliver showing one badge.
- Notifications: no service worker, no push permission prompt, no deep-link from notification → thread.

**Notes on audit method**

- Single dev-server session; pre-seeded SQLite. No data was modified.
- Source-grepped `packages/web/src` to confirm absence of features that the screenshots could not falsify positively (e.g., no API-key UI = grep for "API key" / "apiKey" / "Models" found only design-system fixtures).
- All screenshot paths are absolute: `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/D-*.png`.
