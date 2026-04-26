# Bucket B — Work / Bets / Portfolio (Wave 3)

Auditor: architect
Browser: Playwright headless (chromium 1.59.1, viewport 1440×900)
Server: http://localhost:5173 (existing dev server)
Date: 2026-04-26

Routes confirmed in `packages/web/src/router.tsx`:
- `/work/portfolio` → `WorkPortfolio`
- `/work/team` → `WorkTeam`
- `/work/bet/:betId` → `WorkBet`
- `/settings` redirects to `/conversations/review?settings=open` (opens `SettingsPanel`)
- `/work` (no leaf) → 404 `NotFound`. There is no team picker, no agent detail, no per-product detail page.

Settings panel has tabs: Profile, Products, Agents, Notifications, Appearance. There is no Caps/Budget tab and no Skills/per-skill autonomy surface. Knowledge has `KnowledgeList` and `KnowledgeDetail`.

---

## Journey rank 7 — DL-10/DL-29 — Catch & respond to cost-burn anomalies

**Walked**: partial — read-side data is rendered, but the "respond" half of the JTBD has no surfaces.
**Steps actually possible**:
1. Glance the right-side Rail: "COST TODAY $12.40 / TODAY BUDGET $50.00 / WEEK $84.20 / WEEK BUDGET $350.00" — present on every page.
2. Drill into a bet: per-task `$cost` columns render on `/work/bet/:betId`.
3. Per-task cost on the Kanban (`/work/team`).
**Cannot do**:
- See per-product, per-team, or per-agent burn aggregation.
- See a time-series / sparkline / hour-over-hour anomaly indication.
- Distinguish "spike" from "background drift" — Rail shows totals only, no delta.
- Click any cost number to drill into "what spent it." Cost values are not links.
- See historical context (yesterday, last week).
**Screenshots**:
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J7-portfolio-entry.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J7-team-cost-view.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J7-bet-cost-view.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J7-settings-open.png`

### Gaps
| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | "spot the anomaly" | No baseline / delta / sparkline. Rail shows current totals only — no signal that today is anomalous vs. typical. | Open any page; observe Rail Cost block. |
| missing | "drill into spike" | Cost numbers are static text, not interactive. No path from "$12.40 today" to "which agent / bet / task drove it." | `/work/portfolio`; click "$12.40" — nothing happens. |
| missing | per-product / per-team aggregation | Portfolio cards expose `activeBets / shipped / shipRate` but no `cost-this-cycle` or `cost-vs-cap`. PortfolioCard schema in `fixtures/portfolio-data.ts` has no cost field. | `/work/portfolio`; inspect any product card. |
| missing | per-agent burn | Kanban tiles show per-task cost but never aggregate to "Dev Agent 1 burned $11 today across 3 tasks." | `/work/team`; visually scan owners. |
| degraded | cap-hit recovery (RE-07 sibling) | Rail shows "TODAY BUDGET $50.00" but no state when burn ≥ budget — no paused-team list, no "raise cap by $X" button, no time-to-reset. | n/a — fixture data is below cap. |

### Notes
The data shape currently rendered is enough for a glance, but the entire **right side of the JTBD** ("respond") is unfulfilled. Per `docs/PROCESS_LAYER.md`, cost is supposed to roll up factory > team > agent — that hierarchy is invisible in the UI. The Rail is the only cost surface anywhere in the app.

---

## Journey rank 17 — DL-14/DL-15 — Course-correct misbehaving agent / escalate to CoS

**Walked**: blocked — no agent-detail surface exists.
**Steps actually possible**:
1. See agent name on Kanban tile ("Dev Agent 1") and bet task table.
2. Open Settings → Agents tab → toggle autonomy (manual/supervised/autonomous), Pause / Reactivate.
**Cannot do**:
- Click on "Dev Agent 1" anywhere to open an agent profile or recent-actions view.
- See *why* an agent is misbehaving (recent verdicts, repeated rejections, drift).
- Escalate the issue to the Chief of Staff from the agent context (no "Escalate" affordance from Kanban / bet detail).
- See an agent's sessions list, audit_trail, or session_notes (per F-2 spec these exist; no UI consumes them).
**Screenshots**:
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J17-team-board.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J17-task-click.png` (clicking a Kanban tile does not open detail)

### Gaps
| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | agent detail route | No `/agents/:agentId` or `/work/agent/:id`; agent names are plain text everywhere. | `/work/team`; click "Dev Agent 1" on any tile — no navigation. |
| missing | per-agent recent-actions / drift indicator | Settings > Agents tab is config-only (autonomy + pause toggle). No history, no "last 5 rejections," no failure rate. | Open Settings → Agents. |
| missing | "Escalate to CoS" affordance | No button at agent, task, or bet level routes a thread to the Chief of Staff. | `/work/bet/b1`; scan for escalate. |
| degraded | autonomy taxonomy mismatch | Settings exposes 3-state `manual / supervised / autonomous`. Spec (PU-10, KNOWLEDGE_ARCHITECTURE) is L1–L4 per agent **per skill**. Current model collapses both axes. | Settings → Agents tab; observe `<select>` values. |

### Notes
This journey requires an **agent surface** that does not exist. The data model in `db/schema` likely has agents (via teams), but no React route renders one. Until an agent detail page exists, the journey is unbuildable. This is a **missing route**, not a missing button.

---

## Journey rank 19 — DL-17/DL-18/RE-15 — Trajectory drift / drill stuck task / pivot-kill-reshape

**Walked**: partial — read affordances are good, decision affordances are absent.
**Steps actually possible**:
1. `/work/portfolio` → see product status (Healthy / Behind / Blocked).
2. Click product card — **does not navigate** (no per-product page; cards are not links).
3. Use the breadcrumb on bet pages to navigate Product → Team → Bet (one-way — bet has no parent product card to come back to).
4. `/work/bet/:betId` shows pitch body, sortable task table, comments. Status chips on tasks (Healthy / Behind / Done).
**Cannot do**:
- "Pivot," "kill," "reshape," or "extend appetite" from the bet page — zero matching buttons (probed via `getByRole("button", { name: /kill|pivot|reshape|extend|sunset|cancel bet/i })` → 0).
- Drill into a stuck task to see why it's stuck (task rows in `WorkBet` are not clickable, no task detail route).
- See trajectory-vs-appetite burn-down (no chart, no "ahead/behind by N days").
- See blockers list at bet level. (Rail has a global "BLOCKERS 1" but it's not bet-scoped.)
**Screenshots**:
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J19-bet-detail-b1.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J19-bet-detail-b2.png`

### Gaps
| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | bet decision affordances | No kill / pivot / reshape / extend / pause-bet / resume-bet button on `/work/bet/:betId`. The bet status chip is render-only. | Open `/work/bet/b1`; scan page. |
| missing | task detail | `WorkBet` task rows are `<tr>` with no link/handler. No `/work/task/:id` route. | `/work/bet/b1`; click any task row — nothing. |
| missing | trajectory / burn-down | No appetite-vs-elapsed chart, no risk indicator, no "behind by" text. Only `progress: { done: 3, total: 8 }`. | `/work/bet/b1`; inspect BetCard. |
| missing | bet-scoped blockers / drift signals | Rail blockers are global. No "this bet has blockers / risks" surface. | `/work/bet/b1`; scan for blockers section. |
| broken | product-card click | Product cards on `/work/portfolio` look interactive (status chips, KeyValue rows) but have no `Link` / `onClick`. | Click any product card; URL does not change. |
| missing | per-product detail route | `/work/product/:id` does not exist. Bet breadcrumb ⟶ "Alpha" links to `/work/portfolio` (the list), not a product. | Click "Alpha" in the bet breadcrumb. |

### Notes
The unit of value per CLAUDE.md is the bet, but `WorkBet` is a read-only artifact display. The decision-flow side of this journey is entirely absent. This blocks both DL-17 (drift) and RE-15 (kill/reshape) at the same gap.

---

## Journey rank 20 — PU-14/FR-15 — Weekly bet selection from shaped pitches within capacity

**Walked**: yes — the pitch selector exists and opens; capacity counter visible. Selection-to-commit is a stub.
**Steps actually possible**:
1. `/work/team` → click "Select Pitches" → `PitchSelector` overlay opens (replaces Kanban per design).
2. Three mock pitches render (Mobile responsive layout / Dark mode toggle / Export to PDF) with hypothesis, proposer, appetite.
3. Canvas above shows committed bets with capacity "Committed 1 / 3."
**Cannot do**:
- Selecting a pitch in the overlay does not visibly move it to the canvas (handler `handleAddToCanvas` is a no-op stub).
- No "Add selected to cycle" button to commit selected pitches as a batch.
- No capacity warning (e.g., "selecting this would exceed capacity 3").
- Status chip on each pitch reads `PAUSED` instead of `Shaped` — taskStateToStatus mapping is wrong for pitches (`"shaped"` → `PAUSED`).
**Screenshots**:
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J20-team-board.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J20-pitch-selector-open.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J20-pitch-selected.png`

### Gaps
| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| broken | "Add to canvas" | `onAddToCanvas` in `WorkTeam.tsx:135` is a `// Mock` no-op; selected pitches do not commit. | Open Pitch Selector; click any pitch — canvas unchanged. |
| missing | batch commit | No "Commit selected" / "Bet on these" action. Selection state is per-pitch only. | Open Pitch Selector; scan footer. |
| missing | capacity guard | No warning when selection > capacity. `Canvas` shows "1 / 3" but the selector doesn't read it. | Open Pitch Selector. |
| degraded | shaped status renders as PAUSED | `BetCard` / pitch tile maps `status: "shaped"` to a chip labeled "PAUSED." Wrong semantic. | `/work/team`; observe "Onboarding revamp" chip says PAUSED. |
| missing | shaping → committed transition feedback | No optimistic UI nor toast on commit. | Click "Add to canvas"; nothing visible. |

### Notes
The skeleton (overlay, capacity counter, pitch cards) is in place. This journey is one-handler-away from working — the gap is the no-op `handleAddToCanvas`. The status-chip mislabel is a content bug, not a structural gap, but it confuses the very screen this journey reads from.

---

## Journey rank 26 — PU-10 — Adjust autonomy levels (L1–L4) per agent per skill

**Walked**: blocked — autonomy editor exists but the data model is wrong for the JTBD.
**Steps actually possible**:
1. `/conversations/review?settings=open` → Agents tab → per-agent autonomy `<select>` (manual / supervised / autonomous).
2. Per-agent Pause / Reactivate button.
**Cannot do**:
- Set autonomy **per skill**. The select is a single value per agent.
- Use the spec's L1–L4 ladder. Three discrete states ≠ four levels.
- See what the autonomy level affects (which actions become L1-blocking vs. L4-autonomous).
- Reach this from any agent's context (Kanban / bet) — Settings is the only entry.
**Screenshots**:
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J26-portfolio.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J26-team.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J26-settings.png`

### Gaps
| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | per-skill autonomy axis | Spec is "per agent per skill"; the data type `AutonomyLevel = "manual" \| "supervised" \| "autonomous"` (SettingsPanel.tsx:18) has no skill dimension. | Open Settings → Agents; observe single select per agent. |
| missing | L1–L4 ladder | UI uses 3-state, spec uses 4-state with semantic meaning per level. | Settings → Agents tab. |
| missing | impact preview | No "raising X to L3 will let it ship without approval" explanation. | Settings → Agents tab. |
| missing | in-context entry | No "adjust autonomy" link on agent name from Kanban or bet detail. Founder has to know to open Settings. | `/work/team`; look for autonomy controls. |
| degraded | terminology mismatch | Autonomy text ("autonomy", "L1"-"L4") not present anywhere in app body (verified via Playwright text scan). | Search the rendered DOM. |

### Notes
This is a **schema-level mismatch**, not a UI polish gap. The trust-compounding model in HUMAN_INTERFACE_LAYER.md and PROCESS_LAYER.md is built on per-skill levels. The current 3-tuple cannot represent it. Any UI built on this shape will be re-done.

---

## Journey rank 27 — PU-11/FR-09 — Set / revise nested cost caps (factory > team > agent)

**Walked**: blocked — read-side cost caps exist (Rail), no editor exists anywhere.
**Steps actually possible**:
1. See current factory-level caps in Rail: "TODAY BUDGET $50.00 / WEEK BUDGET $350.00."
**Cannot do**:
- Edit the factory cap. No tab in Settings, no inline edit on Rail.
- Set a per-team or per-agent cap. The nested hierarchy doesn't exist as a UI concept.
- See the cap chain (factory $50 → Alpha team $20 → Dev Agent 1 $8, etc.).
- Get warned about over-allocation (sum of team caps > factory cap).
**Screenshots**:
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J27-settings-caps.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J27-team-caps.png`

### Gaps
| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | caps editor (any level) | Settings has Profile/Products/Agents/Notifications/Appearance — no "Caps" / "Budget" tab. | Open Settings; scan tabs. |
| missing | nested hierarchy in data | `SettingsData` has no caps field. Rail values are hardcoded fixtures, not editable. | Inspect `SettingsPanel.tsx:52-58`. |
| missing | per-team cap UI | Team page has no budget banner / editor. | `/work/team`; scan top of page. |
| missing | per-agent cap UI | Settings → Agents tab has only autonomy + pause. | Settings → Agents. |
| missing | over-allocation guard | No "team caps sum exceeds factory cap" warning surface. | n/a |

### Notes
This pairs with rank-7 (cost-burn): the **read** side has the caps but no `cost-vs-cap` rendering, and the **write** side has nothing at all. RE-07 (cap-hit recovery) sits downstream and is also blocked by the missing editor.

---

## Journey rank 29 — RE-13 — Resolve knowledge edit colliding with agent edit (version conflict)

**Walked**: partial — knowledge list and detail pages render, conflict UI is absent.
**Steps actually possible**:
1. `/knowledge` → see 12 knowledge items grouped by topic, with status chips (HEALTHY / BEHIND / ERROR).
2. Triage column shows curation suggestions ("Merge these 3 items?").
3. `/knowledge/k1` → KnowledgeDetail shows belief content, observation log, related items, **and an Edit button**.
**Cannot do**:
- See version history (no "v3 / v2 / v1" toggle, no diff view).
- See "this was edited 6h ago by Builder Agent" as a *conflicting* event — observation log shows additive entries only, not concurrent edits.
- Resolve a three-way merge (mine / theirs / base).
- Lock the item while editing (no `held by user` indicator).
- Detect the collision in the first place — there is no concurrent-edit signal anywhere.
**Screenshots**:
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J29-knowledge.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J29-knowledge-detail.png`

### Gaps
| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | version history | No version selector / timeline / "view v2" anywhere on KnowledgeDetail. | `/knowledge/k1`; scan page. |
| missing | conflict detection signal | DOM scan for /conflict\|version\|merge\|diff/i returned 0 hits. | Render any knowledge detail. |
| missing | three-way merge UI | Spec (KNOWLEDGE_ARCHITECTURE L2/L3 integrity) requires merge resolution; nothing in the design system supports it. | `KnowledgeDetail.tsx`; no merge component. |
| missing | edit-lock indicator | No "Builder Agent is editing this now" badge. | `/knowledge/k1`. |
| missing | observation-log → conflict promotion | Observation log lists edits chronologically but doesn't flag overlapping windows as conflicts. | `/knowledge/k1`; observe log. |

### Notes
RE-13 is a **rare but unrecoverable** journey. Silent loss here corrupts L2/L3/L4 forever per the journey description. The fact that the *signal* is missing (no DOM string mentions conflict/version/merge anywhere) means we don't even know when to *enter* this journey. This is a higher gap than the missing UI — there is no telemetry surface.

---

## Journey rank 31 — PU-07 — Sunset a product (knowledge archive + team dissolution + final retro)

**Walked**: blocked — `/work/portfolio` cannot start the journey.
**Steps actually possible**:
1. `/work/portfolio` → see four product cards.
**Cannot do**:
- Click a product card to open its detail (cards are not interactive — verified, URL unchanged after click).
- Find any sunset / archive / dissolve / retire button (Playwright `getByRole("button", { name: /sunset|archive|dissolve|retire/i })` → 0).
- Begin the multi-step flow (archive plan → team dissolution → final retro).
- See state-spanning progress for a sunset in progress (no banner, no draft state on portfolio).
**Screenshots**:
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J31-portfolio-sunset.png`
- `/Users/tobiasgrundmann/Development/hyperidle/docs/reviews/journey-gaps/screenshots/B-J31-product-click.png`

### Gaps
| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | per-product detail route | No `/work/product/:id`. Sunset has no surface to live on. | Try clicking any product card; URL unchanged. |
| missing | sunset entry affordance | Zero matching buttons in the entire portfolio view. | DOM scan. |
| missing | multi-step state holder | Sunset has 4+ steps (archive plan → team dissolution → final retro → confirm). No page can hold this state — no wizard / drawer / `/sunset/:id` route. | Architecture: routes file. |
| missing | knowledge archive picker | Step 1 of the JTBD requires choosing which L2/L3/L4 items to archive. No knowledge multi-select / archive batch UI exists. | `/knowledge`; scan for batch/archive. |
| missing | team dissolution UI | Step 2 requires reassigning routines (per PU-09 sibling) and dissolving the team. No team detail route — only `/work/team` (singular, hardcoded fixture). | n/a |
| missing | final-retro composer | Step 3 / 4 needs a retro authoring surface. Doesn't exist. | n/a |

### Notes
This is the **most architecturally absent** journey in the bucket. Of the 6 sub-steps, all 6 lack their host surface. The blast radius (lost L2 context, orphan agents) makes the gap dangerous. The journey is also the clearest case of **state-spanning operation needing a wizard / draft model** that the current router does not accommodate.

---

## Bucket summary

**Counts**: broken 2 / missing 30 / degraded 4

**Top 5 most-impactful gaps (architect lens):**

1. **No agent detail route, no per-product detail route, no task detail route, no team detail route.** Four of the eight journeys (rank 17, 19, 26, 31) are blocked by the same shape: the data model has these entities but the router has no leaf for them. `/work/portfolio` and `/work/team` are list views with no drill-in.
2. **Autonomy schema mismatch (3-state vs L1–L4 per skill).** `AutonomyLevel = "manual" | "supervised" | "autonomous"` cannot encode the spec'd ladder, and there is no skill axis at all. Any UI built on the current shape will be replaced once the data model is corrected.
3. **No write-side surfaces for cost.** Read-side caps and per-task burn are visible; there is no editor for caps at any level (factory/team/agent), no cost-vs-cap rendering, and no path from a cost number to "what spent it." Rank 7 + 27 share this gap.
4. **No version / conflict / history concept anywhere in Knowledge.** `KnowledgeDetail` shows a single belief with an observation log; there is no version selector, no diff, no conflict signal. RE-13 is unbuildable on this surface, and the conflict has no detection signal in the first place.
5. **Sunset is six missing surfaces deep.** PU-07 has no entry point, no per-product page, no archive picker, no team dissolution UI, no retro composer, and no multi-step state container in the router. This is the worst structural absence in the bucket.

**Blockers preventing audit**: none — dev server reachable, Playwright able to navigate every probed URL. The audit is "blocked" only in the sense that target affordances do not exist (which is itself the finding).

**Cross-route gaps noticed (since this bucket spans 3+ routes):**
- **Breadcrumb is one-way.** `/work/bet/:betId` breadcrumb links "Alpha → Alpha Core → B1" but `Alpha` jumps to `/work/portfolio` (the list), and `Alpha Core` jumps to `/work/team` (a singleton, hardcoded fixture, not Alpha-specific). The user lands somewhere superficially related but not actually on the Alpha product or the Alpha Core team. This is a silent context loss.
- **`/work/team` is a singleton route.** It does not accept `:teamId`; it always renders the same fixture. Multi-team factories cannot be represented. Any journey that requires team-A vs team-B context (rank 17 escalate, rank 31 dissolution) is structurally blocked.
- **`/work` (no leaf) renders 404.** Reasonable, but there is no Work index page that shows "you have N products / M teams / pick one" — so a user landing on `/work` from a notification or bookmark gets NotFound, not a chooser.
- **Settings is the only cross-cutting editor.** Cost caps, autonomy, agents, products all live in one modal panel reached via `?settings=open`. Per-bet, per-team, per-product context is lost when the founder opens Settings; there is no "settings for THIS product" entry point. This forces context-switching for every config decision.
- **No state-spanning operation container.** Sunset (PU-07) and weekly bet selection (PU-14, partially) need multi-step state across pages. The router has no draft-state model — selections do not survive navigation, and there is no `/wizards/*` or session-store concept visible.

### CONFUSION: knowledge id space
I'm uncertain about: whether `/knowledge/k1` is a real seeded item or a fallback. KnowledgeDetail rendered "Architecture Decision: Auth Strategy" which appears in the list as a real fixture. I treated the surface as functional. If `k1` happened to match a fallback ID, the conflict-UI gap is unchanged either way — there is no version history component anywhere in the code. Flag for review.
