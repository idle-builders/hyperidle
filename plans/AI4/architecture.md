# AI4 — One status language · Architecture Plan

**Workpackage:** AI4 (Track AI, Style Consolidation). Branch `feat/AI4-one-status-language`.
**Plan calls:** `/concept` waived (no new/reshaped primitive — StatusChip + status-mapping ARE the spec). `/design` waived (the status language is already designed; this is adoption). Standard architecture pass.
**Effort:** M (~6h). **Depends on:** none.

This is an **adoption + consolidation** workpackage. No new capability, no behavior change, no data-model change. Every replaced call site keeps its existing data and interaction behavior. The deliverable is: every status rendering flows through the single mapping + shared label registries, the live-pulse becomes one promoted component, and no page-local status→color or status→label builder remains.

---

## Required reading (engineer must read before implementing)

- `packages/design-system/src/status-mapping.ts` — the single mapping. Exhaustive `Record<Enum, Status>` per entity. **Stays the single mapping; pages never restate it.**
- `packages/design-system/src/StatusChip.tsx` — the chip primitive. Renders presentation `Status` name **JS-uppercased** (`safeStatus.toUpperCase()` at line 101) AND CSS-uppercased (`uppercase` in `CHIP_BASE`, line 85). Both layers are active today. **Will gain an optional `label` prop with an explicit casing contract (see Decision 1).**
- `packages/design-system/src/StatusChip.stories.tsx` — stories to extend with the new `label` variant + the promoted LiveDot.
- `packages/shared/src/types.ts` — `TASK_STATES`, `BET_STATUSES`, `BET_OUTCOME_VERDICTS`, `TASK_OUTCOME_VERDICTS` enums. **New label registries attach here.**
- `packages/shared/src/notifications.ts` — `NOTIFICATION_TYPES` registry (already the source of truth for notification type labels).
- `.claude/rules/aesthetic-quality.md` — AQ-001/004/007/008 (chip is density-static, uppercase tracking, no hardcoded color). The forks' `rgba(...)` tints (AQ-008 violations) are exactly what we delete.
- `packages/design-system/PRINCIPLES.md`, `DESIGN.md` — token + component conventions for any design-system edit.

No `docs/` topic folder is load-bearing here — this is presentation consolidation, not a primitive. (Status *semantics* — which states exist — is process-layer and explicitly out of scope.)

**Exact file paths (verified — the bare filenames used below resolve to these; there is no `pages/work/` subdir):**
- `packages/web/src/pages/WorkBet.tsx`
- `packages/web/src/pages/WorkTask.tsx`
- `packages/web/src/pages/KnowledgeList.tsx`
- `packages/web/src/pages/AgentProfile.tsx`
- `packages/web/src/shell/TaskSheet.tsx`
- `packages/web/src/shell/NotificationPopover.tsx`

---

## Plan reconciliation (spec ⇆ reality)

Every symbol the spec names, verified at file:line:

| Spec assumption | Reality | Plan handling |
|---|---|---|
| `status-mapping.ts` is the single exhaustive mapping | ✅ Confirmed. `TASK_STATE_MAP`, `BET_STATUS_MAP`, `KNOWLEDGE_STATUS_MAP`, `SESSION_OUTCOME_MAP`, `ROUTINE_STATE_MAP` + `*ToStatus` fns. | Reuse as-is. Do not restate. |
| `StatusChip` + `Tag` exist | ✅ Exported from `@hyperidle/design-system`. | Reuse. Extend StatusChip with `label`. |
| Shared label registries exist in `@hyperidle/shared` | ⚠️ **Partial.** `notifications.ts` `NOTIFICATION_TYPES` has labels ("Review requests"). `types.ts` has the verdict/state **enums** but **no human-readable label registries** for TaskState/BetStatus/verdicts. | **Add** `TASK_STATE_LABEL`, `BET_STATUS_LABEL`, `BET_OUTCOME_VERDICT_LABEL`, `TASK_OUTCOME_VERDICT_LABEL` to shared (Decision 2). |
| `WorkBet.tsx` hand-rolls `taskStateBadgeClass()` with hardcoded rgba | ✅ Line 94-103. `rgba(22,118,79,0.08)` etc. AQ-008 violations. Plus header `statusBadgeClass`/`statusBadgeLabel` IIFEs (1013-1038). Plus `TASK_STATE_LABEL` (82-91), `BET_VERDICT_LABEL` (74-79), `TASK_VERDICT_LABEL` (64-69). | Delete all; replace with StatusChip + shared labels. |
| `WorkTask.tsx` renders TaskState as plain gray text + local LiveDot | ✅ `statusBadgeClass` IIFE (223-232) → gray text; `TASK_STATUS_LABEL` (71-80); local `LiveDot` (58-65). | Replace badge with StatusChip; use promoted LiveDot. |
| `KnowledgeList.tsx` two local badge-style fns | ✅ `kindBadgeStyle` (216), `statusBadgeStyle` (240). `statusBadgeStyle` is a **status** fork (in scope) but **returns `null` for all `KnowledgeStatus` except `active`/`archived`** (lines 240-251); render is gated on `status && sStyle` (line 314), so **today only `active`→"Active" and `archived`→"Stale" rows show a badge** (label line 320, Title-Case for active, **relabels archived to "Stale"**). `kindBadgeStyle` is a **kind** fork → maps to `Tag`, not StatusChip (see Note A). | Replace status fork with StatusChip **gated on the same two-status condition + "Stale" relabel preserved** (Note A2). Kind fork → `Tag`. |
| `AgentProfile.tsx` three local chip components + inline status ternary | ✅ `CapabilityBadge` (372), `VerdictDot` (387), `OutcomeChip` (405, **text-only**, session outcomes) + inline operational-status `const` (line 116) feeding an inline className ternary chip (175-185). The line-116 `active→error→idle` derivation + its color ternary is **itself a page-local status→color builder** the AC4 lint rule must not allow to stay inline. | See Decision 3 — status-bearing ones in scope; the operational `Status` translation moves to a shared `agentOperationalStatusToStatus` mapping (WARNING resolved). |
| `NotificationPopover.tsx` redefines type labels | ✅ `TYPE_LABELS` (43-48): `review_request:"REVIEW"`. **Diverges** from shared `NOTIFICATION_TYPES.label` ("Review requests"). | Derive from shared registry (Decision 4 — label-text migration). |
| `WorkBet` redefines verdict labels that exist in shared | ⚠️ Verdict labels do **not** currently exist in shared (only enums). | Create them in shared first, then consume. |
| LiveDot exists twice (WorkTask, TaskSheet), `@lore AF12` asks for promotion, absent from WorkBet | ✅ `WorkTask.tsx:58`, `TaskSheet.tsx:126` (identical bodies, both `bg-[var(--accent-primary)] animate-pulse`). WorkBet task list has no dot. | Promote to design system; consume in all three. |
| `BetCard` (portfolio bet status) forks the mapping | ⚠️ **Not named in spec but in scope.** `packages/design-system/src/BetCard.tsx` has local `STATUS_DOT_COLOR`, `STATUS_LABEL`, `badgeClasses`, `STATUS_BADGE_VARIANT` (40-90) — a status→color + status→label fork *inside the design system*. Portfolio bet-status surface. | In scope: AC1 names "the same bet status on **portfolio**". See Decision 5. |

**Spec/reality drift resolved:**
1. Shared has no state/verdict label registries — they must be **created**, not just consumed. The spec's "verdict labels that exist in shared types" is aspirational; today they live only in WorkBet. The plan creates them.
2. `BetCard` is a design-system-internal fork the spec didn't enumerate but AC1 ("same bet status on portfolio") requires. In scope.
3. Notification labels diverge in **text** (`"REVIEW"` vs `"Review requests"`) — adopting shared changes rendered output; that's a deliberate consolidation, and the protected test asserting `"REVIEW"` must be updated in lockstep (see Migrations).

---

## The load-bearing decision: label vocabulary (Decision 1)

**The tension.** `StatusChip` today renders `safeStatus.toUpperCase()` (line 101 — a **JS string transform**, on top of the CSS `uppercase` class in `CHIP_BASE`) — the **presentation Status** name: `HEALTHY`, `BEHIND`, `DONE`, `PAUSED`, `ERROR`, `BLOCKED` (six words). The Work-view forks deliberately render **domain labels** in Title-Case: "In progress", "Active", "Draft", "In review", "On hold", "Planned", "Killed". `BetCard.test.tsx` asserts these via `getByText("Active")`, `getByText("Draft")`, … and an `expectedLabels = ["Draft","Active","Completed","Killed"]` exact-text loop (lines 40, 57, 63, 69, 75, 117-120). Because those assertions match on the DOM `textContent` (which a CSS `text-transform` does NOT change, but a JS `.toUpperCase()` DOES), the casing layer the `label` path uses is load-bearing — see the casing contract below.

AC1 demands "same color, **same shape, same label**" everywhere. AC2 demands "labels derive from the shared registries." These conflict with the current StatusChip, which would force every surface to read `IN PROGRESS → HEALTHY`, collapsing 8 distinct TaskStates into 6 presentation buckets (e.g. `proposed` and `accepted` both → `HEALTHY` → would both read "HEALTHY", losing "Planned"; `hold` → "PAUSED" loses "On hold"). That is a **regression in information** and breaks the protected BetCard test.

### Design-it-twice

**Option A — StatusChip renders only the presentation Status name (status-as-label).**
Shape: forks pass `<StatusChip status={taskStateToStatus(state)} />`; chip shows `HEALTHY`/`PAUSED`/etc. One mapping, one vocabulary, zero new label registries.
Trade-off: maximum consolidation, minimum code.
Reject: **loses domain information** — `proposed`+`accepted`+`in_progress` all read "HEALTHY"; founder can no longer distinguish "Planned" from "In progress" from a colored chip. Breaks BetCard protected test asserting human-readable labels. The presentation vocabulary is a *color bucket*, not a *state name* — surfacing it as the label was never the design intent (StatusChip's own `InContextDemoCard` story pairs the chip with a separate descriptive sentence). **Rejected.**

**Option B — StatusChip gains an optional `label` prop; default keeps current behavior.**
Shape: `StatusChipProps { status: Status; label?: string }`. When `label` omitted → renders `status.toUpperCase()` (today's behavior, every existing consumer unchanged). When provided → renders the supplied label **verbatim** (no JS uppercasing — see casing contract), same chip chrome, same dot color from `status`. Callers pass `label={TASK_STATE_LABEL[state]}` sourced from shared.
Trade-off: one extra optional prop; the label still comes from *outside* the chip (shared registry), preserving "design system maps presentation, shared owns vocabulary."
Reject reason considered: a second way to set text. Mitigated — `label` is presentation-neutral text; the **color/shape/dot** stay single-sourced from `status`. This is exactly the Carbon/Polaris `Tag` pattern (fixed chrome, free label).

**Decision: Option B.** It is the only option that satisfies AC1 (same color/shape, and same label *because every surface reads the same shared registry*) **and** AC2 (labels from shared) **and** keeps the existing 7 correct consumers (WorkTeam, WorkRoutine, KnowledgeDetail) working unchanged (they omit `label`, get the status-name behavior they have today — which is correct for them; status semantics out of scope means we do NOT change what those surfaces display).

### Decision 1a — The casing contract (load-bearing; non-negotiable)

`StatusChip` carries casing in **two** layers today: a CSS `uppercase` class (`CHIP_BASE`, line 85) and a JS `safeStatus.toUpperCase()` (line 101). The CSS layer changes only the *rendered glyphs*, leaving DOM `textContent` untouched; the JS layer rewrites `textContent` itself. The contract:

- **Default path (`label` omitted):** unchanged — `safeStatus.toUpperCase()` stays JS-side. DOM `textContent` = `"HEALTHY"`. Every existing consumer keeps today's behavior. This path also covers the `shortLabel` notification render (Decision 4) — `shortLabel` is supplied via `label`, so see the next bullet for its casing.
- **`label` path (`label` provided):** render the supplied string **verbatim** into the DOM — `{label}` with **no JS `.toUpperCase()`**. The CSS `uppercase` class in `CHIP_BASE` still applies, so the chip *reads* uppercase visually while `textContent` preserves the canonical registry string. Concretely the JSX becomes `{label ? label : safeStatus.toUpperCase()}` (the `.toUpperCase()` lives only on the `safeStatus` branch).

**Why verbatim:** `BetCard.test.tsx` asserts `getByText("Active")`/`"Draft"`/`"Completed"`/`"Killed"` against `textContent`. With the `label` path rendering verbatim, `textContent` stays Title-Case → these protected assertions pass **unchanged** while the chip still presents uppercase via CSS. JS-uppercasing the `label` would make `textContent="ACTIVE"` and break all five assertions. CSS `text-transform` is the correct layer for casing; keeping registry strings canonical also lets any future non-uppercase chip variant reuse the same labels.

**Notification path consequence (intersects Decision 4):** `AF8-NotificationPopover.test.tsx:171` asserts `getByText("REVIEW")` against `textContent`. Since the chip uppercases only via CSS on the `label` path, the **registry `shortLabel` value itself must be the uppercase literal** (`shortLabel: "REVIEW"`), OR the test must derive its expected literal from `NOTIFICATION_TYPES[…].shortLabel`. Decision 4 stores `shortLabel` as the uppercase form (`"REVIEW"`/`"BLOCKER"`/`"COST"`) so the rendered `textContent` is `"REVIEW"` and the updated-not-deleted assertion derives the same text. (If a `Tag`, not a StatusChip, renders the notification label, that component's own casing rules apply — but Decision 4 routes notification type through the shared registry consumed by the popover row, whose casing is the `shortLabel` literal regardless.)

**Per-path casing summary:**

| Render path | JS transform | CSS class | DOM `textContent` | Visual |
|---|---|---|---|---|
| Default (status name) | `.toUpperCase()` | `uppercase` | `HEALTHY` | HEALTHY |
| `label` (entity/verdict) | none (verbatim) | `uppercase` | `Active` | ACTIVE |
| `label` (notification `shortLabel`) | none (verbatim) | `uppercase` | `REVIEW` (registry stores uppercase) | REVIEW |

> **AC1 "same label everywhere" is satisfied per-entity, not globally.** A task `in_progress` reads "In progress" on WorkBet, WorkTask, and TaskSheet — identical, because all three read `TASK_STATE_LABEL.in_progress` from shared. A bet `active` reads "Active" on portfolio/team/detail. The chip *chrome and color* are globally uniform; the *label* is uniform per entity-state. This is the correct reading of "learn the language once" — the user learns that the green chip with the live pulse = active work, and the word names the specific state.

---

## Decision 2 — Where the label registries live

Shared owns vocabulary (spec constraint). Add to `packages/shared/src/types.ts`, immediately after each enum, exported via `index.ts`:

```ts
// after TASK_STATES (types.ts:21)
export const TASK_STATE_LABEL: Record<TaskState, string> = {
  proposed: "Planned",
  accepted: "Planned",
  hold: "On hold",
  in_progress: "In progress",
  blocked: "Blocked",
  review: "In review",
  done: "Done",
  killed: "Killed",
};

// after BET_STATUSES (types.ts:75)
export const BET_STATUS_LABEL: Record<BetStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  killed: "Killed",
};

// after BET_OUTCOME_VERDICTS (types.ts:179)
export const BET_OUTCOME_VERDICT_LABEL: Record<BetOutcomeVerdict, string> = {
  validated: "Validated",
  refuted: "Refuted",
  partial: "Partial",
  inconclusive: "Inconclusive",
};

// after TASK_OUTCOME_VERDICTS (types.ts:195)
export const TASK_OUTCOME_VERDICT_LABEL: Record<TaskOutcomeVerdict, string> = {
  met: "Met",
  met_with_rework: "Rework",
  partially_met: "Partial",
  not_met: "Not met",
};
```

`Record<Enum, string>` (not `Partial`) → **exhaustiveness guarantee**: adding a 9th TaskState to `TASK_STATES` makes the union wider and the `Record` literal a TS error until labelled. This satisfies AC2's "adding a new state surfaces as a type error until every rendering path handles it" — the label registry is now a second exhaustive guard alongside `*_MAP`.

Labels are the verbatim strings the forks use today. `met_with_rework: "Rework"` and `partially_met: "Partial"` preserve WorkBet's existing abbreviations (`@lore AC1`).

**`KNOWLEDGE_STATUS_LABEL` lives in `@hyperidle/fabric/types`, not shared** (Note A2): `KnowledgeStatus` is fabric-owned post-O1 and is *not* exported from `@hyperidle/shared` (`o1-type-split.test.ts` asserts its absence). Putting `KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string>` (`archived: "Stale"`, rest Title-Cased) next to its enum honors "vocabulary lives with its owning union" and avoids reintroducing the fabric→shared coupling O1 removed. The AC4 lint rule (Decision 7) treats both `@hyperidle/shared` and `@hyperidle/fabric` as legitimate registry homes; the `*_LABEL`-outside-allowed-packages check excludes fabric too.

**Rendered-text change summary** (no longer "zero"): in-app state/verdict labels keep their words but shift from Title-Case to CSS-uppercase on the surfaces that previously rendered Title-Case in a fork (BetCard, KnowledgeList, AgentProfile operational/outcome chips) — a deliberate alignment to the one status language, captured in the proof set. WorkBet/WorkTask/TaskSheet task chips already render through StatusChip-style uppercase, so their words are unchanged. Notification labels change via Decision 4. The DOM `textContent` of the registry strings stays Title-Case (casing contract), so text-based protected assertions remain green.

**Note A — Tag vs StatusChip.** Knowledge *kind* (`pattern`/`decision`/`failure`) and notification *type* are **not status** — they are categorical labels. Status is lifecycle. `KnowledgeList.kindBadgeStyle` and `NotificationPopover.TYPE_LABELS` are kind/type forks. Per the existing system, **kind → `Tag`** (categorical chip) and **status → `StatusChip`**. `KnowledgeList`'s *status* fork (`statusBadgeStyle`) → StatusChip + `knowledgeStatusToStatus` (**gated — see Note A2**). Its *kind* fork → `Tag` with `kind` prop (already supports `pattern`/`decision`/`failure` via `tag-kinds`). This keeps the "no page-local status→color/label builder" AC honest without overloading StatusChip with non-status concepts.

**Note A2 — KnowledgeList behavior preservation (the only place a blanket swap would silently change behavior).** Verified: `statusBadgeStyle` returns a style for `active`/`archived` **only** and `null` for the other five `KnowledgeStatus` values (`captured`/`provisional`/`validated`/`stale`/`needs_human`); the render is gated `status && sStyle` (line 314). So **today only two rows show a status badge**: `active`→"Active", `archived`→**"Stale"** (relabel, line 320). A naive `StatusChip status={knowledgeStatusToStatus(status)}` swap would (a) render a chip for **all 7** statuses (visible behavior change — five new chips appear), and (b) drop the `archived→"Stale"` relabel. The track scope rule ("every replaced call site keeps its existing data and interaction behavior") forbids both. **Decisions:**

1. **Gate the chip on the same condition.** Render `StatusChip` only for the two statuses that show a badge today: `if (status === "active" || status === "archived")`. The other five stay badge-less, exactly as now. (Expanding to all 7 is a deliberate UX change out of AI4's "consolidation, no behavior change" scope — defer to a future knowledge-status-surfacing WP if wanted; do **not** smuggle it in here.)
2. **Where "Stale" lives.** "Stale" is a knowledge-status **domain label** (note `stale` is *also* a distinct `KnowledgeStatus` value that maps to `error` — the `archived→"Stale"` relabel is a deliberate copy choice, not a bug). It must not be re-hardcoded in the page (AC4 forbids a page-local label map). **Decision:** add a `KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string>` registry to `@hyperidle/fabric/types` (the home of `KnowledgeStatus`, since the 7-state union is fabric-owned post-O1, not shared), with `archived: "Stale"` and the remaining entries Title-Cased (`active: "Active"`, `captured: "Captured"`, …). The page passes `label={KNOWLEDGE_STATUS_LABEL[status]}`. This single-sources the relabel, satisfies AC2's exhaustiveness (a new `KnowledgeStatus` → `tsc` error until labelled), and keeps the casing contract (verbatim `"Stale"`, CSS-uppercased to "STALE" visually — a visual casing change from today's Title-Case "Stale", flagged in the proof set below). **Rationale for fabric over shared:** `KnowledgeStatus` is not exported from `@hyperidle/shared` (O1 split — `o1-type-split.test.ts` asserts its absence); putting the label registry next to its enum honors "vocabulary lives with its owning union" and avoids reintroducing the fabric→shared coupling O1 removed.

**Casing-change flag for the proof set:** today both rendered knowledge labels are Title-Case (the page hand-rolls `charAt(0).toUpperCase()` + the literal "Stale"). After the swap they render through `StatusChip`'s CSS `uppercase` → "ACTIVE"/"STALE". This is a deliberate visual change aligning knowledge status with the one status language (every StatusChip reads uppercase). Screenshot before/after both rows in `KnowledgeList` triage view.

---

## Decision 3 — AgentProfile: which forks are status (in scope)

`AgentProfile.tsx` has four chip-like things; only the status-bearing ones are AI4:

| Component | Is it status? | Verdict |
|---|---|---|
| Inline operational-status chip (line 116 `const` + 175-185 className ternary, `active`/`error`/`idle`) | **Yes** — agent health/liveness. | **In scope.** The line-116 `active/error/idle` derivation from `data` stays (it's a data-derivation, not a status→color map — `@lore AB1 A2`). But the `operationalStatus → Status` *and* `operationalStatus → color` translation must NOT stay inline (it's exactly the page-local status→color builder AC4's lint rule forbids — and Task 13's rule would flag it). **Add `agentOperationalStatusToStatus` to `status-mapping.ts`** (Decision 3a) and render `<StatusChip status={agentOperationalStatusToStatus(operationalStatus)} label={AGENT_OPERATIONAL_STATUS_LABEL[operationalStatus]} />`. Map `active→healthy`, `error→error`, `idle→paused`. The "active" case renders a live agent → also gets the promoted **LiveDot** (AC3). |
| `OutcomeChip` (405, session outcome `completed`/`crashed`/`stopped`, **text-only — no pill, no background today**) | **Yes** — session outcome, and `sessionOutcomeToStatus` already exists. | **In scope — serves AC1 (consolidation), NOT AC5.** AC5 is specifically *outcome **verdicts*** (`BetOutcomeVerdict`/`TaskOutcomeVerdict`); `OutcomeChip` shows **session** outcomes via `sessionOutcomeToStatus`, a different axis. Replace with `<StatusChip status={sessionOutcomeToStatus(outcome)} label={…} />`. **This is a deliberate visual change** — text-only colored label → full StatusChip pill (chrome + dot). Flag in the proof set with a before/after screenshot of the session-history row. |
| `VerdictDot` (387, review decision `approve`/`reject`) | **Borderline.** Thread `VerdictDecision` (approve/reject), not an entity lifecycle status. No mapping exists. | **Out of scope** — it's a conversational-action indicator, distinct from entity status (the `@lore AC1` comment in shared types.ts explicitly separates `VerdictDecision` from outcome verdicts). Leave as-is; flag for a future "verdict-decision visual" workpackage. Document in plan risks. |
| `CapabilityBadge` (372, harness capability supported y/n) | **No** — boolean capability, not status. | **Out of scope.** Not a lifecycle/health status. Leave as-is. |

Constraint honored: "If a surface genuinely needs a rendering StatusChip cannot express, that gap is raised to the design system, not solved locally." VerdictDot and CapabilityBadge are *not status* — they are correctly local non-status renderings, not status forks. We do not force them through StatusChip. (Reviewer confirmed: `VerdictDecision` is a conversational action and `CapabilityBadge` is a boolean — both correctly out of scope; forcing them through StatusChip would misuse the primitive.)

### Decision 3a — `agentOperationalStatusToStatus` mapping (closes the AgentProfile inline-builder gap)

The operational status is a 3-value closed set (`active`/`error`/`idle`) derived from `data` at line 116. Its translation to a presentation `Status` and to a label is a status→color/label mapping that, left inline, is precisely what `design/no-local-status-builder` (Decision 7) must forbid — otherwise Task 10 trips the very gate Task 13 adds. Add to `packages/design-system/src/status-mapping.ts`:

```ts
// status-mapping.ts — agent liveness, closed 3-value set
export type AgentOperationalStatus = "active" | "error" | "idle";
export const AGENT_OPERATIONAL_STATUS_MAP: Record<AgentOperationalStatus, Status> = {
  active: "healthy",
  error: "error",
  idle: "paused",
};
export function agentOperationalStatusToStatus(s: AgentOperationalStatus): Status {
  return AGENT_OPERATIONAL_STATUS_MAP[s] as Status;
}
```

The **label** (`AGENT_OPERATIONAL_STATUS_LABEL: Record<AgentOperationalStatus, string>` = `{ active: "Active", error: "Error", idle: "Idle" }`) is vocabulary → lives in `@hyperidle/shared` (with the other `*_LABEL` registries) so the AC4 lint rule's `*_LABEL`-outside-shared check passes. AgentProfile then renders `<StatusChip status={agentOperationalStatusToStatus(operationalStatus)} label={AGENT_OPERATIONAL_STATUS_LABEL[operationalStatus]} />` and the line-116 derivation stays as a data read. No page-local status→color builder remains. (Casing: label renders verbatim per Decision 1a; today's chip shows lowercase `{operationalStatus}` e.g. "active" — the swap renders CSS-uppercased "ACTIVE", a deliberate alignment to the one status language; flag in proof set.)

---

## Decision 4 — Notification type labels (text change, lockstep test)

`NotificationPopover.TYPE_LABELS` renders uppercase abbreviations (`"REVIEW"`, `"BLOCKER"`, `"COST"`); shared `NOTIFICATION_TYPES[].label` are full strings (`"Review requests"`). The popover row is a compact meta-strip; the full strings are too long. Options:

- **B1:** Replace popover labels with the full shared strings → rendered text changes to "Review requests"; layout risk in the dense row; protected test `AF8-NotificationPopover.test.tsx:171` (`getByText("REVIEW")`) must change.
- **B2:** Add a `shortLabel` to `NOTIFICATION_TYPES` and consume it; keeps the compact "REVIEW" but single-sources it.

**Decision: B2 (reviewer-approved).** Add `shortLabel` to `NOTIFICATION_TYPES`, storing the **uppercase literal** (`shortLabel: "REVIEW" | "BLOCKER" | "COST"` …) so it single-sources the vocabulary without a layout regression and keeps the popover compact (the row is genuinely space-constrained — a 1-line strip). The popover derives `typeLabel = NOTIFICATION_TYPES.find(t=>t.key===row.typeKey)?.shortLabel`. This removes the local `TYPE_LABELS` map (AC4: no page-local label map remains) while preserving rendered output.

**Casing pin (intersects Decision 1a):** because the chip/label render path uppercases only via CSS now (no JS `.toUpperCase()` on the `label`/`shortLabel` path), the registry value **must already be uppercase** for `textContent` to equal `"REVIEW"`. `AF8-NotificationPopover.test.tsx:171` (`getByText("REVIEW")`) is satisfied by storing `shortLabel: "REVIEW"`. The protected test updates from a hardcoded literal to deriving from the registry (`expect(getByText(NOTIFICATION_TYPES[...].shortLabel))`) — **updated, not deleted**.

> B1 (full shared strings, accept the text change + layout check) was considered and rejected: B2 has zero layout/text regression and still kills the fork.

---

## Decision 5 — BetCard (portfolio) status fork

`design-system/src/BetCard.tsx` carries `STATUS_DOT_COLOR`, `STATUS_LABEL`, `STATUS_BADGE_VARIANT`, `badgeClasses` — a complete status→color + status→label fork inside the design system, on the portfolio bet-status surface AC1 explicitly names. It renders an 8px status dot + a colored badge with human-readable label + an `outcomeVerdict` neutral badge.

Replace the dot + status badge with `<StatusChip status={betStatusToStatus(status)} label={BET_STATUS_LABEL[status]} />`. Replace the outcome badge with StatusChip + verdict mapping (Decision 6). Delete the four local constants/fns. The casing contract (Decision 1a) keeps `getByText("Active")`/`"Draft"`/… green because `label` renders verbatim.

**ESCALATED — highest build risk; gate, do not assume (reviewer escalation).** Verified BetCard's current badge is a bespoke pill materially different from StatusChip's chrome: `px-[9px] py-[3px]`, `rounded-[var(--r-pill)]`, `text-[12px]`, `font-[500]`, **Title-Case text**, with an **8px** status dot rendered *separately* — vs StatusChip's `CHIP_BASE` (`px-[8px] py-[2px]`, `rounded-full`, `text-[11px]`, mono font, **CSS-uppercase**, a built-in **6px** dot). These will **not** pixel-match without reconciliation. `BetCard.html` is design truth (`visual-parity.md` — never edit HTML styling). **Mandatory sequencing and gates:**

1. Sequence BetCard **last** (Task 11); it may exceed the M estimate if reconciliation is needed — accept that, do not rush it.
2. Gate on `npm run ds:sync` ≤ **5%** pixel diff vs `BetCard.html`. **The 5% threshold is non-negotiable — never loosen it** (`visual-parity.md`).
3. If StatusChip's chrome cannot match `BetCard.html` within 5%, the correct move per the spec is to **reconcile via `npm run ds:sync` / hand the gap to Claude-Design** (the HTML or StatusChip's design-system chrome is updated by the design owner) — **never fork StatusChip and never hand-hack the BetCard TSX to diverge from the primitive.** A persistent HTML-vs-StatusChip mismatch is a legitimate **blocker / design hand-off**, not a silent TSX workaround.
4. The negative assertion `BetCard.test.tsx:33` (`not.toContain("rounded-[var(--r-pill)]")`) must survive: StatusChip uses `rounded-full`, not `rounded-[var(--r-pill)]`, so it should pass — confirm during build.

**Acknowledged prior decision:** `BetCard.test.tsx:38/105` comments ("status now renders as user-facing label, **not StatusChip**") and line 33 were written by the visual-parity-audit to deliberately move BetCard *off* StatusChip. Swapping it back is defensible *because StatusChip now carries a `label`* (the reason it was removed no longer holds), but the plan acknowledges this reverses a prior intentional decision — the builder must keep the human-label assertions green and verify line 33 survives rather than treat the swap as a no-op.

---

## Decision 6 — Outcome verdicts need a presentation mapping (the one genuinely-missing mapping)

AC5: "Outcome verdicts render with semantic status coloring consistently (not neutral gray on one page and colored on another)." Today verdicts render **neutral gray** everywhere (`bg-[var(--surface-container)] text-[var(--text-secondary)]` in WorkBet 1334 + 1668; BetCard `badgeClasses("default")`). There is **no verdict→Status mapping** in `status-mapping.ts`. To color them semantically we must add one.

```ts
// status-mapping.ts — new, exhaustive over the shared verdict unions
export const BET_OUTCOME_VERDICT_STATUS: Record<BetOutcomeVerdict, Status> = {
  validated: "healthy",     // hypothesis held
  refuted: "error",         // hypothesis failed
  partial: "behind",        // mixed
  inconclusive: "paused",   // insufficient evidence
};
export function betOutcomeVerdictToStatus(v: BetOutcomeVerdict): Status { ... }

export const TASK_OUTCOME_VERDICT_STATUS: Record<TaskOutcomeVerdict, Status> = {
  met: "healthy",
  met_with_rework: "behind",
  partially_met: "behind",
  not_met: "error",
};
export function taskOutcomeVerdictToStatus(v: TaskOutcomeVerdict): Status { ... }
```

Color rationale is presentation-only (validated=success/green, refuted=error/red, partial/rework=warning/amber, inconclusive=info/blue) — **no status semantics introduced** (verdict enums unchanged). This is the design system "mapping presentation," exactly the layer AI4 owns. Verdicts then render `<StatusChip status={betOutcomeVerdictToStatus(v)} label={BET_OUTCOME_VERDICT_LABEL[v]} />` — colored + labeled, identically on portfolio (BetCard) and bet detail (WorkBet), satisfying AC1's verdict clause and AC5.

**Verdict color — decided (reviewer-approved amber).** `partial`/`met_with_rework`/`partially_met` → `behind` (amber, `--status-warning`). "Not a clean win, look closer" is the right semantic and beats neutral gray (which AC5 explicitly calls out as the wrong status quo). No status semantics introduced — the verdict enums are unchanged; this is presentation mapping only. Ship it.

---

## Acceptance criteria → verification method

| # | AC | Verification |
|---|---|---|
| AC1a | Same task state → same chip (color/shape/label) on WorkBet task list, WorkTask header, TaskSheet | **Playwright** `AI4-status-language.spec.ts`: seed a task `in_progress`, screenshot the chip on all three surfaces; assert identical `data-status` + visible label text "In progress" + presence of live-dot. Review judges screenshots identical. |
| AC1b | Same bet status → same chip on portfolio (BetCard), team (WorkTeam), bet detail (WorkBet) | **Playwright**: seed a bet `active`; screenshot chip on all three; assert identical treatment + label "Active". |
| AC2 | Labels derive from shared/owning registries; new state → TS error until handled | **Type-level (compile gate):** `Record<Enum,string>` literals make a new enum value a `tsc` error in every registry: `TASK_STATE_LABEL`, `BET_STATUS_LABEL`, `*_OUTCOME_VERDICT_LABEL`, `AGENT_OPERATIONAL_STATUS_LABEL` (shared) + `KNOWLEDGE_STATUS_LABEL` (fabric). **Unit test** `status-labels.test.ts`: loop each enum tuple, assert every value has a non-empty label. |
| AC3 | Live-pulse appears wherever in-progress/live state is shown — one component | **Component test** `LiveDot.test.tsx`: renders, has `aria-hidden`, `animate-pulse`, 6px. **Playwright**: assert live-dot present on WorkBet task row (`in_progress`), WorkTask header, TaskSheet session row, AgentProfile active-agent chip; assert the OLD local `LiveDot` fns are gone (lint/knip — see AC4). |
| AC4 | No page-local status→color or status→label builder remains in web | **ESLint gate (static property → lint rule, not test):** add `design/no-local-status-builder` rule (Decision 7) flagging local fns/consts matching the fork shapes in `packages/web`. **Plus knip**: deleted exports must not be dead-referenced. CI fails if a fork is reintroduced. |
| AC5 | Outcome **verdicts** (`BetOutcomeVerdict`/`TaskOutcomeVerdict`) render with semantic status coloring consistently — distinct from session outcomes (AgentProfile's `OutcomeChip`, which is AC1 consolidation, not AC5) | **Playwright**: seed a bet with `outcomeVerdict: "validated"`; screenshot verdict badge on portfolio (BetCard) + bet detail (WorkBet); assert both colored (not `--surface-container` gray) and identical. **Unit** `status-mapping.test.ts`: assert `betOutcomeVerdictToStatus`/`taskOutcomeVerdictToStatus` exhaustive + correct. |

Validation scenarios (from spec) map to the AC1a/AC1b/AC4 rows above. The "searched for local `*BadgeClass`/`*BadgeStyle`/label-map" scenario = the AC4 ESLint rule (codifies the search as a permanent gate rather than a one-time grep).

---

## Ordered task list

**Phase 1 — Shared vocabulary (no UI yet).**
1. `packages/shared/src/types.ts`: add `TASK_STATE_LABEL`, `BET_STATUS_LABEL`, `BET_OUTCOME_VERDICT_LABEL`, `TASK_OUTCOME_VERDICT_LABEL`, `AGENT_OPERATIONAL_STATUS_LABEL` (exhaustive `Record`s). Export from `index.ts`. → `status-labels.test.ts` (red first). Add `KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string>` (with `archived: "Stale"`) to **`@hyperidle/fabric/types`** (its owning union — Note A2), exported from fabric's barrel. → extend the fabric label test.
2. `packages/shared/src/notifications.ts`: add `shortLabel` (uppercase literals — Decision 4) to `NotificationType` + each registry entry. Export a `shortLabelForType(key)` helper. → extend notification test.

**Phase 2 — Design-system mapping + primitives.**
3. `packages/design-system/src/status-mapping.ts`: add `BET_OUTCOME_VERDICT_STATUS` + `TASK_OUTCOME_VERDICT_STATUS` + `betOutcomeVerdictToStatus`/`taskOutcomeVerdictToStatus`, **and `AgentOperationalStatus` + `AGENT_OPERATIONAL_STATUS_MAP` + `agentOperationalStatusToStatus`** (Decision 3a). Export from `index.ts`. → extend `status-mapping.test.ts` (red, exhaustive over all four maps).
4. `packages/design-system/src/StatusChip.tsx`: add optional `label?: string` prop. Render `{label ? label : safeStatus.toUpperCase()}` — **the `label` branch renders verbatim with NO JS `.toUpperCase()`; CSS `uppercase` (CHIP_BASE) provides the visual casing** (Decision 1a casing contract). Default path (`label` omitted) unchanged — `safeStatus.toUpperCase()` stays. Dot/chrome from `status`. → `StatusChip.test.tsx` gets two cases: (a) "renders status name uppercased when no label" (existing default unchanged), (b) "renders `label` verbatim into `textContent`" — assert `getByText("Active")` succeeds and `textContent === "Active"` (NOT "ACTIVE"), proving the casing contract. Update `StatusChip.stories.tsx` with a labelled variant. Add a `@lore AI4` comment on the JSX recording the two-layer casing contract.
5. **Promote LiveDot.** New `packages/design-system/src/LiveDot.tsx` (exact body from WorkTask/TaskSheet: `aria-hidden`, `inline-block w-[6px] h-[6px] rounded-full bg-[var(--accent-primary)] animate-pulse shrink-0`). Export from `index.ts`. `LiveDot.stories.tsx` + `LiveDot.test.tsx`. Carry forward `@lore AF12` (promotion fulfilled) + `@lore visual-parity-audit D-30`. **Dual-rep:** create `html/LiveDot.html` per `design-system.md` (visual-parity rule).

**Phase 3 — Adopt in web (each = delete fork, wire shared).** Independent per file once Phase 1+2 land.
6. `WorkBet.tsx`: delete `taskStateBadgeClass`, `TASK_STATE_LABEL`, header `statusBadgeClass`/`statusBadgeLabel` IIFEs, `BET_VERDICT_LABEL`, `TASK_VERDICT_LABEL`. Header bet chip → `StatusChip status={betStatusToStatus(bet.status)} label={BET_STATUS_LABEL[bet.status]}`. Task rows → `StatusChip status={taskStateToStatus(task.state)} label={TASK_STATE_LABEL[task.state]}` + `<LiveDot/>` when `in_progress`. Outcome badges → StatusChip + verdict mapping + verdict label.
7. `WorkTask.tsx`: delete local `LiveDot`, `statusBadgeClass` IIFE, `TASK_STATUS_LABEL`. Header → StatusChip + shared label. Import promoted `LiveDot`. **Note:** the header today renders `statusLabel = task.state.replace(/_/g, " ")` (line 233) — NOT `TASK_STATUS_LABEL` (which only feeds the meta-strip). Adopting `TASK_STATE_LABEL` is a (correct) text normalization, e.g. `in_progress` → today "in progress" (lowercased via `.replace`) becomes registry "In progress" (CSS-uppercased to "IN PROGRESS"). Screenshot the header before/after — capitalization shift is intended, not a bug.
8. `TaskSheet.tsx`: delete local `LiveDot`; import promoted. (Status label in SessionRow stays as-is — it's session `status` string with its AC4-load-bearing raw fallback; **do not** change behavior — only the dot is consolidated. Note: session status here is the raw worker status, not entity lifecycle; keep its fallback. Flag: if reviewer wants the session-status text through StatusChip too, that needs `sessionOutcomeToStatus`-style handling for live `active` — out of this WP's safe scope.)
9. `KnowledgeList.tsx`: delete `statusBadgeStyle`. **Preserve the gated render (Note A2):** show a `StatusChip` only when `status === "active" || status === "archived"` (the two statuses that show a badge today); the other five `KnowledgeStatus` values stay badge-less. Use `<StatusChip status={knowledgeStatusToStatus(status)} label={KNOWLEDGE_STATUS_LABEL[status]} />` so `archived` reads "Stale" (from the fabric registry) and `active` reads "Active". Replace `kindBadgeStyle` → `<Tag kind={kind} label={...}/>` (Note A). Keep `data-testid="status-badge"` on the StatusChip wrapper so existing selectors hold. Do NOT expand to all 7 statuses (out of AI4 scope). Screenshot both badge rows (casing shifts Title-Case → uppercase).
10. `AgentProfile.tsx`: replace inline operational chip (lines 175-185) with `<StatusChip status={agentOperationalStatusToStatus(operationalStatus)} label={AGENT_OPERATIONAL_STATUS_LABEL[operationalStatus]} />` + LiveDot when `active` (Decision 3a — the line-116 derivation stays, the status→color/label mapping moves to `status-mapping.ts`/shared so Task 13's lint rule does not flag it). Replace `OutcomeChip` (text-only) with `<StatusChip status={sessionOutcomeToStatus(outcome)} label={…}/>` — **AC1 consolidation, deliberate visual change** (text → pill); keep the `null` outcome "—" fallback. Leave `VerdictDot`, `CapabilityBadge` (out of scope, not status). Screenshot operational chip + session-outcome row before/after.
11. `BetCard.tsx` (design-system): replace status dot+badge → StatusChip + `BET_STATUS_LABEL`; outcome badge → StatusChip + verdict mapping. Delete `STATUS_DOT_COLOR`/`STATUS_LABEL`/`STATUS_BADGE_VARIANT`/`badgeClasses`. **Run `npm run ds:sync` (≤5% diff vs `BetCard.html`).**
12. `NotificationPopover.tsx`: delete local `TYPE_LABELS`; derive from `shortLabelForType`.

**Phase 4 — Gate + proof.**
13. `packages/eslint-plugin-design`: add `design/no-local-status-builder` rule (Decision 7). Wire into config. **Rule-unit-test (RuleTester) must include BOTH:** (a) `invalid` cases — a reintroduced `*BadgeStyle`/`*BadgeClass` fork and a `*_LABEL` object literal in `packages/web/src` both report; (b) a `valid` **negative case** — a legitimate page-local non-status const (e.g. a presentational helper named `panelClass`, or a `*_LABEL` defined *inside* `@hyperidle/shared`/`@hyperidle/fabric`) does NOT report, so the heuristic can't false-positive on legit locals. **Ordering (red-then-green):** the rule must run **green on the post-migration tree** before it is wired into CI — i.e. wire it only after Tasks 6-12 have deleted every fork, otherwise lint fails on the very forks we're mid-removing. If the rule fires on a surviving legit local (e.g. the `archived→"Stale"` literal — now moved to the fabric registry, so it should not), reconcile by tightening the selector, not by loosening the gate.
14. `AI4-status-language.spec.ts` (Playwright): the AC1a/AC1b/AC3/AC5 cross-surface screenshot scenarios.
15. `npm run verify` green. Update all protected tests in lockstep (see Migrations).

---

## Decision 7 — The AC4 enforcement gate (ESLint rule vs grep)

AC4 ("no page-local status→color/label builder remains") is a **static codebase property** → per CLAUDE.md it must be a **lint rule**, not a test. Add `design/no-local-status-builder` to `packages/eslint-plugin-design`:

- Flags `function` declarations / `const` arrow fns in `packages/web/src` whose name matches `/.*(Badge|Chip)(Class|Style|Variant)$/` OR that return a string literal containing `bg-[rgba(` / `bg-[color-mix(` keyed on a parameter named `status`/`state`/`kind`/`outcome`/`verdict`.
- Flags object-literal `const`s named `/.*(STATE|STATUS|VERDICT|TYPE)_LABEL$/` defined in `packages/web/src` (the legitimate registry homes are `@hyperidle/shared` and `@hyperidle/fabric` — `KNOWLEDGE_STATUS_LABEL` lives in fabric per Note A2; both are outside `packages/web/src` so the path-scope already excludes them — no name allowlist needed).

This codifies the spec's grep ("searched for local `*BadgeClass`/`*BadgeStyle`/label-map definitions … none remain") as a permanent gate so the fork class cannot recur — same philosophy as AI1's dead-token gate. The rule is scoped to `packages/web/src`; shared, design-system, and fabric are the *legitimate* homes for the registries/mappings and are out of the rule's path glob. Task 13 spells out the required valid/invalid RuleTester cases and the post-migration green-tree ordering. **⚠️ UNVERIFIED**: exact AST selectors — builder verifies against the existing plugin's rule structure (it already has `no-hardcoded-color` etc., so the visitor pattern is established).

---

## Type signatures / contracts

```ts
// @hyperidle/shared
export const TASK_STATE_LABEL: Record<TaskState, string>;
export const BET_STATUS_LABEL: Record<BetStatus, string>;
export const BET_OUTCOME_VERDICT_LABEL: Record<BetOutcomeVerdict, string>;
export const TASK_OUTCOME_VERDICT_LABEL: Record<TaskOutcomeVerdict, string>;
export const AGENT_OPERATIONAL_STATUS_LABEL: Record<AgentOperationalStatus, string>;
export interface NotificationType { /* + */ readonly shortLabel: string; }  // uppercase literal
export function shortLabelForType(key: NotificationTypeKey): string;

// @hyperidle/fabric/types  (KnowledgeStatus is fabric-owned post-O1 — Note A2)
export const KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string>;  // archived: "Stale"

// @hyperidle/design-system
export interface StatusChipProps { status: Status; label?: string; }  // label added; renders verbatim (Decision 1a)
export function LiveDot(): JSX.Element;                                 // promoted
export const BET_OUTCOME_VERDICT_STATUS: Record<BetOutcomeVerdict, Status>;
export const TASK_OUTCOME_VERDICT_STATUS: Record<TaskOutcomeVerdict, Status>;
export function betOutcomeVerdictToStatus(v: BetOutcomeVerdict): Status;
export function taskOutcomeVerdictToStatus(v: TaskOutcomeVerdict): Status;
export type AgentOperationalStatus = "active" | "error" | "idle";
export const AGENT_OPERATIONAL_STATUS_MAP: Record<AgentOperationalStatus, Status>;
export function agentOperationalStatusToStatus(s: AgentOperationalStatus): Status;
```

No API endpoints, no schema, no migration (presentation-only — Track AI scope rule). No route checklist (no routing change).

---

## Security & abuse cases

| Class | Applicability |
|---|---|
| Rate-limit on POST/PATCH | **N/A** — no endpoints touched. |
| Input-trust / agent-authored field | **N/A** — labels are static registries keyed by closed enums; no agent free-text enters the chip. `StatusChip` already has a runtime `unknown` fallback for version-skew status strings (`KNOWN_STATUSES` guard) — preserved. The new `label` prop renders trusted registry strings; if a caller passed untrusted text it'd be the caller's bug, but no untrusted text reaches it in this WP. |
| Secret-handling / path-traversal / SSRF | **N/A** — no credentials, paths, or outbound URLs. |

XSS note: labels render as React text children (auto-escaped), not `dangerouslySetInnerHTML`. No injection surface.

---

## Protected tests (must update in lockstep, never delete/weaken)

`protectedTests`:
- `packages/web/src/__tests__/status-mapping.test.ts` — extend with verdict→status cases; existing assertions unchanged.
- `packages/web/src/__tests__/StatusChip.test.tsx` — add `label` override case; existing default-behavior assertions unchanged.
- `packages/web/src/__tests__/BetCard.test.tsx` — asserts `getByText("Active")`/`"Draft"`/`"Completed"`/`"Killed"` (lines 40,57,63,69,75) + the `expectedLabels` loop (117-120), all matching DOM `textContent`. Decision 1a's casing contract (`label` renders **verbatim**, CSS-only uppercase) **keeps these green unchanged** — `textContent` stays Title-Case. **Acknowledged history:** these assertions + line 33 (`not.toContain("rounded-[var(--r-pill)]")`) and the line 38/105 comments were written by the visual-parity-audit to *deliberately move BetCard off StatusChip*. The swap-back reverses that decision — defensible because StatusChip now carries `label` (the reason for removal no longer holds). Builder must (a) not weaken any label assertion, (b) confirm line 33 survives (StatusChip uses `rounded-full`, not `rounded-[var(--r-pill)]`). If line 33 were to fail, that signals a real chrome mismatch → BetCard ESCALATED gate (Decision 5), not a test edit.
- `packages/web/src/__tests__/AF8-NotificationPopover.test.tsx:171` — `getByText("REVIEW")`. Update to derive expected text from `NOTIFICATION_TYPES`/`shortLabel` (B2 keeps "Review"/"REVIEW" rendered; adjust literal to match chosen shortLabel casing). **Updated, not deleted.**
- `packages/web/src/__tests__/WorkBet.task-sheet.test.tsx` — asserts "each row shows a StatusChip for the task state." Stays green (still StatusChip). Verify the live-dot consolidation doesn't break its session-row assertions.
- `packages/web/src/__tests__/WorkProduct.test.tsx` — D1 regression guard "committed bet must not show BEHIND chip." BetCard swap must keep this true (active bet → `betStatusToStatus("active")="healthy"`, never behind). Keep green.
- `packages/web/src/__tests__/TaskCard.test.tsx`, `WorkTeam.AA1.test.tsx` — verify unaffected (already use StatusChip correctly); run, don't edit unless they assert deleted internals.

E2E specs that screenshot status surfaces and may need golden refresh (behavior unchanged, pixels may shift): `W3-task-detail.spec.ts`, `AB1-agent-profile.spec.ts`, `L13-product-drilldown.spec.ts`, `L14-bet-actions.spec.ts`. Builder runs these and refreshes goldens only where the *intended* chip rendering changed.

---

## Migrations (renamed/removed symbols → call sites)

All **deletions** of local forks (no renames of public symbols). Per file, the migration is `delete local + wire shared/ds`:

| Removed symbol | File | Action |
|---|---|---|
| `taskStateBadgeClass`, `TASK_STATE_LABEL`, header `statusBadgeClass`/`statusBadgeLabel`, `BET_VERDICT_LABEL`, `TASK_VERDICT_LABEL` | `WorkBet.tsx` | delete; replace render sites (lines 275-eq, 1068, 1336, 1670, 1673) with StatusChip + shared label |
| local `LiveDot`, `statusBadgeClass`, `TASK_STATUS_LABEL` | `WorkTask.tsx` | delete; import promoted LiveDot; StatusChip header |
| local `LiveDot` | `TaskSheet.tsx` | delete; import promoted |
| `kindBadgeStyle`, `statusBadgeStyle` | `KnowledgeList.tsx` (`packages/web/src/pages/`) | delete; Tag (kind) + StatusChip (status, **gated to active/archived**, `KNOWLEDGE_STATUS_LABEL` for "Stale") |
| inline operational chip ternary (175-185), `OutcomeChip` | `AgentProfile.tsx` (`packages/web/src/pages/`) | delete `OutcomeChip` + inline chip; operational → StatusChip(`agentOperationalStatusToStatus`)+LiveDot; line-116 derivation stays |
| `STATUS_DOT_COLOR`, `STATUS_LABEL`, `STATUS_BADGE_VARIANT`, `badgeClasses` | `BetCard.tsx` (ds) | delete; StatusChip + shared label + ds:sync |
| `TYPE_LABELS` | `NotificationPopover.tsx` | delete; `shortLabelForType` |

No test fixture renames. No `data-testid` removals (keep `task-outcome-badge-*`, `outcome-verdict-badge`, etc. on the new StatusChip wrappers so existing tests still select them).

---

## Shared files (concurrent-WP overlap)

`sharedFiles`:
- `packages/shared/src/types.ts` (label registries incl. `AGENT_OPERATIONAL_STATUS_LABEL`) + `packages/shared/src/index.ts` (exports)
- `packages/shared/src/notifications.ts` (shortLabel)
- `packages/fabric` types module owning `KnowledgeStatus` (+ barrel) — new `KNOWLEDGE_STATUS_LABEL`
- `packages/design-system/src/status-mapping.ts` (verdict + agent-operational maps), `StatusChip.tsx`, `index.ts`
- `packages/design-system/src/BetCard.tsx`
- `packages/eslint-plugin-design` (new rule + config)

**Track-AI overlap watch:** AI1 also touches `AgentProfile.tsx` (`--surface-base`), `KnowledgeRow.tsx`, `ThreadSections.tsx` — different lines (token fixes vs status forks) but same files; coordinate merge order. AI5 (shared-primitive adoption) and AI6 (design-system coherence) may touch `StatusChip`/`Tag`/`BetCard` — AI4 should land its StatusChip `label` prop early so AI5/AI6 build on it. AG7 restyles Settings badges adopting *this* language — AI4 must land first (AG7 depends on the registries). `SettingsWorker.tsx badgeClass` (a status fork) is **explicitly AG7's**, not AI4's — leave it.

---

## Risks (standing) & resolved decisions

**Resolved (reviewer-confirmed — no longer open):**
- **StatusChip `label` prop** — approved (Option B), gated on the Decision 1a casing contract (verbatim render, CSS-only uppercase). Settled.
- **Verdict color** — `partial`/`met_with_rework`/`partially_met` → `behind` (amber) approved. Settled (Decision 6).
- **Notification labels** — B2 (`shortLabel`, uppercase literal) approved over B1. Settled (Decision 4).
- **AgentProfile scope** — `VerdictDot` + `CapabilityBadge` stay local (not status); in-scope = operational chip + `OutcomeChip`. Settled (Decision 3).
- **Notification `shortLabel`** field over full strings — approved. Settled (Decision 4).

**Standing build risks (gate, don't assume):**
1. **BetCard visual parity — ESCALATED, highest risk (Decision 5).** StatusChip's chrome (`px-[8px] py-[2px]`, `rounded-full`, `text-[11px]`, mono, 6px dot) differs materially from BetCard's bespoke pill (`px-[9px] py-[3px]`, `rounded-[var(--r-pill)]`, `text-[12px]`, separate 8px dot). They will NOT pixel-match without reconciliation. Sequence last; gate on `npm run ds:sync` ≤ **5% (never loosen)**; if StatusChip can't match `BetCard.html`, **reconcile via `ds:sync` / hand the gap to Claude-Design — never fork StatusChip, never hand-hack the TSX to diverge.** A persistent mismatch is a legitimate blocker/design hand-off. This task may exceed the M estimate.
2. **TaskSheet session-status text (Task 8).** Session `status` there is raw worker status with a load-bearing non-blank fallback (`@lore AF12`). AI4 consolidates only the **dot**, not the session-status *text*. Pushing the text through StatusChip needs care around the live `active` string and is AI5 adoption, out of AI4 scope.
3. **ESLint rule false-positives (Decision 7 / Task 13).** The `no-local-status-builder` heuristic could flag a legit local non-status helper. Mitigated by tight `packages/web/src` path scope + the named patterns + the required RuleTester **negative case** + the post-migration green-tree ordering. Tighten the selector if it over-fires; never loosen the gate.
