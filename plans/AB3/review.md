# AB3 Code Review

**Workpackage:** AB3 -- Agent Configuration & Customization
**Reviewer:** Phase 4 (code against plan)
**Verdict:** NOT DONE -- 2 critical findings, 5 warnings

---

## AC Completeness

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: Team page surfaces default agents with descriptions | PASS | `AgentCard` renders Avatar, name, `findRoleCatalogEntry(role)?.description`, and category Tag for non-team agents. Tests in `WorkTeam.AB3.test.tsx` lines 178-253 verify all elements. Server test confirms `agentCategory` in roster response. |
| AC-2: Soul edit through guided flow | PASS | `AgentEditDialog` line 182 renders guidance text "Personality, style, and values." Soul textarea pre-filled from `agent.soulPrompt` (line 73 `agentToForm`). Tests lines 260-348 verify dialog open, guidance text, pre-fill, and header. |
| AC-3: Edit flow respects categories | PASS | Strategy agents show amber note (line 187-197), config fields disabled via `disabled={isStrategy \|\| saving}` (lines 255, 273, 303). Team agents show no note, fields enabled. Tests lines 355-466 verify both paths. |
| AC-4: Harness and model tier adjustable | PASS | Config section toggle (line 224-307) exposes harness input, model tier select, max sessions input. Save calls PATCH (lines 96-118). Server integration test verifies PATCH returns updated `modelTierPreference`. Component test verifies PATCH body content. |
| AC-5: Add fully custom agent | PASS | `AgentAddDialog` renders name input, role select (filtered to `category === "team"`), soul textarea, config section (starts expanded). Create calls POST with `teamId: teamMembersId` (line 133). Tests lines 598-714 verify full flow including `teamId === "tm-ab3"`. |
| AC-6: First-time hint | PASS | `"review-agents"` added to `HintId` union and `HINT_CATALOG`. Hint banner rendered with `data-testid="hint-review-agents"` in roster section (line 327-342). Tests lines 726-807 verify visible/dismissed/dismiss-action states. |

All 6 ACs have passing implementation and tests.

---

## Findings

### CRITICAL

#### CRITICAL-1: Nested `<button>` inside `<button>` in AgentCard

**File:** `packages/web/src/pages/WorkTeam.tsx` lines 432-476

The `AgentCard` component renders the entire card as a `<button>` (line 432), and inside it places a `<Button variant="ghost">` (line 465) which itself renders a `<button>` element. This is invalid HTML per the HTML spec (interactive content cannot nest interactive content). Screen readers will misbehave, and browsers may restructure the DOM unpredictably.

**Contract:** Design plan Section 1 specifies "Clickable `<button>` wrapping" with "Customize button: `Button` ghost variant." The plan assumed both could coexist, but HTML does not allow it.

**Fix:** Change the outer card wrapper from `<button>` to `<div role="button" tabIndex={0} onKeyDown={...}>`. Or change the inner "Customize" from `<Button>` to an anchor-styled `<span>` with click handler. The former preserves keyboard accessibility while allowing the inner `<Button>` to remain a real button.

#### CRITICAL-2: Dialog stories will throw in design system viewer

**Files:** `packages/web/src/pages/AgentEditDialog.stories.tsx`, `packages/web/src/pages/AgentAddDialog.stories.tsx`

Both `AgentEditDialog` and `AgentAddDialog` call `useToast()` unconditionally on mount (AgentEditDialog line 56, AgentAddDialog line 55). `useToast()` throws if not inside a `<ToastRegion>` (ToastRegion.tsx line 39). The `/designsystem` route is outside `AppShell` (router.tsx line 98 vs AppShell routes) and does not provide `<ToastRegion>`. Therefore rendering either dialog story at `/designsystem` will throw: "useToast must be used within a <ToastRegion>".

**Contract:** Frontend rules state "Every custom component must have a `.stories.tsx` file." Stories that crash on render do not count as having stories.

**Fix:** Either (a) wrap each story in `<ToastRegion>`, or (b) move the `useToast()` call inside the save handler so it is not called at mount time (this would require a ref-based pattern since hooks cannot be called conditionally).

---

### WARNING

#### WARNING-1: AgentEditDialog always mounted, forces useToast mock in all WorkTeam tests

**Files:** `packages/web/src/pages/WorkTeam.tsx` line 386, `packages/web/src/pages/AgentEditDialog.tsx` line 56

`AgentEditDialog` is always mounted in `WorkTeamLoaded` (not conditional on `editingAgentId !== null`), and calls `useToast()` on every render. This forces every test file that renders `WorkTeam` to mock `useToast` -- confirmed by the three separate `vi.mock("../shell/ToastRegion.js", ...)` additions in `WorkProduct.test.tsx`, `hints.integration.test.tsx`, and `WorkProduct.artifact-section.test.tsx`.

In contrast, `AgentAddDialog` is conditionally mounted (`{addDialogOpen && <AgentAddDialog .../>}` at line 397), which avoids this problem.

**Contract:** Architecture plan Task 5 states "When `agent` transitions from null to non-null, call `dialogRef.current.showModal()`." The null-agent case should mean the dialog is either not mounted or inert. Always mounting it is a valid interpretation but creates unnecessary coupling.

**Recommendation:** Conditionally mount `AgentEditDialog` the same way `AgentAddDialog` is conditionally mounted: `{editingAgentId && <AgentEditDialog ... />}`. This removes the need for three separate `useToast` mocks.

#### WARNING-2: Existing test fixture missing `agentCategory` field

**File:** `packages/web/src/__tests__/WorkProduct.test.tsx` lines 44-46

The `MOCK_PRODUCT_DETAIL` roster members lack `agentCategory`:
```ts
{ agentId: "agent-lead", name: "Lead Agent", role: "lead", isLead: true },
```

`RosterMember` now requires `agentCategory: string | null`. TypeScript does not catch this because the render helper types `overrideData` as `typeof MOCK_PRODUCT_DETAIL | null` (line 77) instead of `TeamDetail | null`. At runtime, `member.agentCategory` is `undefined` which happens to be falsy, so the UI works. But the fixture is structurally incorrect and the type escape hatch masks the problem.

The same issue applies to `WorkTeam.stories.tsx` lines 27-35, where the story fixture also already includes `agentCategory: "team"` -- so stories are fine. But `WorkProduct.test.tsx` is inconsistent.

**Fix:** Add `agentCategory: "team"` (or `null`) to both roster members in `MOCK_PRODUCT_DETAIL`, and change the render helper's type from `typeof MOCK_PRODUCT_DETAIL` to `TeamDetail`.

#### WARNING-3: No AbortController on AgentEditDialog template fetch

**File:** `packages/web/src/pages/AgentEditDialog.tsx` lines 121-134

The `handleLoadTemplate` callback fetches `GET /api/agents/templates/:role` without an AbortController. If a user clicks "Load template," then immediately closes and reopens the dialog for a different agent, the stale response could fill the wrong agent's textarea.

**Contract:** Architecture critique WARNING-4 flagged this exact issue. The AgentAddDialog correctly uses an AbortController pattern (lines 89-108), but the AgentEditDialog does not.

**Fix:** Add an AbortController ref to `handleLoadTemplate`, abort on dialog close / agent change.

#### WARNING-4: `transition-colors` without Hearth motion token

**File:** `packages/web/src/pages/WorkTeam.tsx` line 436

The AgentCard uses `transition-colors` (Tailwind default: 150ms ease) which does not use a Hearth motion token. Per AQ-013, transitions should use `--motion-fast` (120ms).

**Contract:** Design critique SUGGESTION-1 flagged this. The BetRow at line 496 uses the same pattern (pre-existing), so this is consistent with existing code. Not a regression, but not correct either.

#### WARNING-5: Hint banner style inconsistent with existing hint pattern

**File:** `packages/web/src/pages/WorkTeam.tsx` lines 326-342 (review-agents hint) vs lines 284-301 (create-bet hint)

The `review-agents` hint uses a green-tinted background (`rgba(22,118,79,0.03)`) and a `Button` component for "Got it". The existing `create-bet` hint uses `bg-[var(--surface-container)]` (no green tint) and a raw `<button>` element for "Got it". Two visually different hint styles on the same page.

**Contract:** Design critique WARNING-1 flagged this. The design intentionally specified the green tint following AQ-016, but the existing hint does not match. The builder correctly followed the design spec for the new hint, but consistency with the existing hint on the same page is broken.

---

### INFO

#### INFO-1: `as` casts on JSON responses are acceptable

**Files:** `AgentEditDialog.tsx` line 127, `AgentAddDialog.tsx` line 100, `useTeamAgents.ts` line 70

Three `as` casts for typing `res.json()` responses. This is the standard pattern for untyped fetch responses. Not a concern.

#### INFO-2: Redundant `style` attribute for border-top in dialog footers

**Files:** `AgentEditDialog.tsx` line 313, `AgentAddDialog.tsx` line 305

Both dialogs use `style={{ borderTop: "1px solid var(--border-subtle)" }}` instead of Tailwind's `border-t border-[var(--border-subtle)]`. The inline style works but is inconsistent with the rest of the codebase which uses Tailwind utilities for borders.

#### INFO-3: Good defensive patterns observed

- `useMemo` on `rosterAgentIds` in WorkTeam (line 194) prevents re-fetch loops, addressing architecture critique WARNING-1.
- `idsKey` JSON-serialized comparison in `useTeamAgents` (line 41) prevents false-positive dependency changes.
- `cancelled` flag in useTeamAgents fetch effect (line 63) prevents state updates after unmount.
- `teamMembersId` prop naming (AgentAddDialog line 22) explicitly prevents the `team.id` vs `team_members.id` confusion.
- AbortController pattern in AgentAddDialog (lines 89-108) for template fetch on role change.
- Lore comments document all non-obvious decisions.

#### INFO-4: AgentAddDialog textarea rows differ from design spec

**File:** `packages/web/src/pages/AgentAddDialog.tsx` line 220

The design spec says 12 rows for the soul textarea. The AgentAddDialog uses 10 rows. The edit dialog correctly uses 12 rows. Minor discrepancy -- the add dialog starts with config expanded so less vertical space is available, making 10 rows a reasonable adaptation.

---

## Lens Summary

| Lens | Assessment |
|------|-----------|
| **Architecture** | Sound. Type signatures match the plan. Data flow (team endpoint + separate agent fetch) matches design-it-twice decision. All 8 tasks delivered. Layer boundaries respected (shared types in shared, server logic in server, UI in web). |
| **Design** | Mostly matches approved design. Card structure, dialog layout, section headers, spacing all correct. Tag uses neutral kind per architecture reconciliation. Two deviations: hint style inconsistency with existing hint, and 10-row vs 12-row textarea in add dialog. |
| **Security** | No new endpoints created. Existing Zod validation covers POST/PATCH inputs. soulPrompt displayed in textarea (no innerHTML). `encodeURIComponent` used on agent IDs in URL construction. No secret exposure. |
| **Adversarial** | Nested button is an HTML validity issue that will cause unpredictable behavior in screen readers and potentially in browser DOM parsing. Stories crashing in design system viewer means visual verification is blocked for these components. |
| **Simplification** | AgentEditDialog should be conditionally mounted (like AgentAddDialog) to avoid the mock cascade. No dead code detected. No unnecessary abstractions. |
| **Slop** | No console.log, no TODO comments, no placeholder text. All comments are substantive lore annotations. No AI aesthetic tells. Clean, dense code. |

---

## Verdict: NOT DONE

Two critical findings must be resolved:
1. Nested `<button>` in AgentCard (invalid HTML, accessibility)
2. Dialog stories crash in design system viewer (useToast outside ToastRegion)

The three warnings (WARNING-1, WARNING-2, WARNING-3) should also be addressed but are not blocking.
