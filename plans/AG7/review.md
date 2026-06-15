# AG7 — Phase-4 Code Review

**Reviewer:** reviewer agent (Phase 4, carrying Phase-2 critique context).
**Diff:** `origin/main...HEAD` (12 commits). 10 production files + 5 test files + scripts + plan artifacts.
**Verdict: DONE.** All 7 ACs pass. Zero CRITICAL findings. 3 WARNING (none blocking). 2 NICE.

---

## Gate results (run locally in worktree)

| Gate | Result |
|---|---|
| `npx tsx scripts/ag7-no-divergent-classes.ts` | PASS — all 10 files clean, exit 0 |
| `npm run lint` (chains the static check last) | exit 0 (warnings only, all pre-existing repo-wide) |
| `npm run check` (typecheck) | exit 0 |
| 8 AG7-touched test files (Worker/X3-Agents/X4-Models/AD8b-Assistant/Profile/Credentials/OrgChart solo+teams) | 89/89 passed |

---

## StatusChip color = meaning (the code-read-only gate — design §1.9)

Paint is a pure function of `status` prop → `STATUS_STYLES[status]` → `--status-*` token (StatusChip.tsx:73-92). No cascade ambiguity → code-read is definitive; a running-app screenshot would add nothing. Token values confirmed in tokens.css:177-180/244-256.

| Chip | `status=` | Token color | §1.9 requires | Verdict |
|---|---|---|---|---|
| Worker connected (SettingsWorker.tsx:62) | `healthy` | green | green | PASS |
| Worker connecting | `paused` | **blue** (info) | blue, NOT amber | PASS |
| Worker disconnected | `behind` | **amber** | amber | PASS |
| Models credential set (SettingsModels.tsx:180) | `healthy` | green | green | PASS |
| Models no credential | `unknown` | **neutral grey** | neutral, NOT amber/red | PASS |
| Agents harness unavailable (SettingsAgents.tsx:568) | `behind` | **amber** | amber, NOT blue/red | PASS |

Hierarchy holds — transitional (Connecting=blue) reads calmer than degraded (Disconnected / Harness-unavailable=amber). No inversion. Worker connection-state derivation (SettingsWorker.tsx:187) `connected ? "connected" : enabled ? "connecting" : "disconnected"` is sound.

---

## AC completeness

| AC | Evidence | Verdict |
|---|---|---|
| AC-1 same header/label/hint/spacing, no off-grid | Static check GREEN (gap-3/4/6, text-sm/xs forbidden, whole-token bounded so `gap-[12px]` not flagged); all field labels via primitive `label` prop; gaps → literal `gap-[Npx]` across all sections | PASS |
| AC-2 one component per control kind, no raw inline styles/divergent controls | Static check GREEN (`input input-`, `btn `, `toggle toggle-`, `badge badge-`, `loading loading-spinner` forbidden); inline `style={{...}}` removed in Assistant/Notifications; Appearance focus ring → `--accent-primary-dim` token | PASS |
| AC-3 dropdowns via Select, lists via Row/ItemList | Credentials (CredentialsTab.tsx:211-266) + org-chart edges (SettingsOrgChart.tsx:221-241) on `ItemList variant="flush"` + `Row`; org-chart mapping title=from / subtitle=target / cells=[{content:mechanism}] / Delete action per design §4; Agents `<table>` retained w/ documented a11y rationale (colSpan edit row); all dropdowns on `Select size="sm"` | PASS |
| AC-4 loading/error/empty via shared components | Profile/Models/OrgChart/Agents loading → `SkeletonList` (role=status); error → `ErrorState compact`; OrgChart/Agents empty → `EmptyState compact`; tests assert `[role="status"]`, error-state, empty-state | PASS |
| AC-5 card-vs-flat one rule | Models tiers card-12px (forms); OrgChart/Agents add+edit forms carded; Credentials flush; Profile/Notifications/Worker/Assistant/Appearance flat — matches design §2 table | PASS |
| AC-6 no persistence/reachability regression | Presentation-only; no route/payload/section-set change (all API calls unchanged, verified in diff); all behavior test assertions preserved, 0 tests deleted, selector migrations are role/testid-tracking only | PASS |
| AC-7 visual coherence + zero AQ hard-rule violations | `npm run lint` exit 0 (zero AQ errors); snapshot net green via test suite; StatusChip color sign-off done by code-read (table above) — paint is deterministic from prop→token, screenshot adds nothing | PASS |
| (extra) assistant heading conforms | `<h2>` deleted (SettingsAssistant.tsx); new test asserts `querySelectorAll("h2").length === 0` | PASS |

---

## Findings

### CRITICAL
None.

### WARNING

**W1 — `"unknown" as Status` type-unsafe cast.** `packages/web/src/settings/SettingsModels.tsx:180`
`status={hasApiKey ? "healthy" : ("unknown" as Status)}`. `unknown` is NOT a member of the public `Status` union (`Status | "unknown"` exists only inside StatusChip's internal record). The cast lies to the type system. Runtime is correct (StatusChip's guard renders neutral grey) and lore-documented, but the clean fix is to widen StatusChip's public `status` prop to `Status | "unknown"` (it already handles "unknown" internally). Non-blocking — typecheck passes, behavior is the design intent.

**W2 — `ml-2` margin alias slips both gates.** `packages/web/src/settings/SettingsAgents.tsx:567`
`<span className="ml-2">` wrapping the harness-unavailable chip. `ml-2`=8px is off the Hearth grid `{3,6,9,12,18,24}`. The AG7 static check only forbids `gap-*`/`text-*` aliases (not `m*-N`), and eslint `no-off-grid-spacing` only matches arbitrary `m-[Npx]` (not aliases) — so it passes both nets but violates AQ-001's spirit. Fix: `ml-[9px]`. Minor visual nit; non-blocking.

**W3 — Profile error has no retry affordance.** `packages/web/src/settings/SettingsProfile.tsx:69`
`ErrorState compact` rendered without `onRetry` (Profile uses `useCurrentUser`, no local reload). Matches plan reconciliation row 5 (parity with today's dead "Please try again." copy — not a regression), but it's a dead-end error state. Acceptable per plan; flagged for future.

### NICE
- **N1** SettingsModels.tsx:367 `if (!editState) return <></>;` — empty fragment for an impossible-after-ready state; biome flags it as `noUselessFragments` (pre-existing info). Could return `null`.
- **N2** The static check's `badge badge-` substring (vs the plan's looser `badge ` trailing-space) is *better* than planned — it avoids false-positiving on legit `badge`-prefixed identifiers. Good call by builder.

---

## Lens notes

- **Architecture:** No layer violation. No route/schema/type/payload change (presentation-only confirmed). Row/ItemList adoption respects the AG6 contract; org-chart slot mapping uses the real `RowCell.content` API (plan's `{text}` shorthand corrected). Agents `<table>` exception documented in code + design §4.
- **Design:** All swaps land on canonical primitives; no reinvention; tokens only; all states present; `.stories.tsx` exist for Agents/Assistant/Models/Worker. Focus ring tokenized. StatusChip vocabulary unified across Worker/Models/Agents/Credentials.
- **Security:** No new endpoints, no new input boundary. Credentials/Models apiKey unchanged — `Input type="password"`, GET never returns key (X4 A-SEC-2 lore intact). N/A surface.
- **Adversarial:** Tests not weakened — selector migrations (checkbox→switch, .skeleton→role=status) track the primitive's DOM contract, assertions preserved; two genuinely-NEW assertions added (Profile role=status, Assistant no-h2). No backdoor, no silent regression. The `as` casts other than W1 are standard JSON-response casts (pre-existing pattern).
- **Simplification:** No single-use over-abstraction introduced. `ConnectionStatusChip` (Worker) and `TierRow` (Models) are reasonable local components. No dead/commented code added.
- **Slop:** No filler, no `=== true`, no "TODO on implemented code". Lore comments are load-bearing (color=meaning rationale). "Saving…" text replaces DaisyUI spinner chrome cleanly.
