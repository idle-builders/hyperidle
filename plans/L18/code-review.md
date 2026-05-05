# L18 — Code Review (Reviewer, Phase 4)

**Branch:** `feat/L18-thread-attachments` · **Latest:** `b57b9cf` · **PR:** #68

## Verdict

**NOT DONE.**

Two implementation defects are user-visible enough to block ship: (1) on the primary novel surface for AC §623 (block-anchor on Bet detail), the *prefill chip is rendered detached at the page level and never reaches the composer*, so a "Discuss"-on-block flow does not actually post a `blockId`-bearing message. (2) the empty / error / proper-rendering states of `HostThreadSection` — the single component that fulfils AC §619 across all four host kinds — fall short of the approved design (no empty-state copy, no post-error feedback, no real message rendering). These are not nits; they break the user-facing contract on the surfaces where AC §619, §621, §623 must work.

The other findings are major-but-isolatable and several builder-noticed items are real (the "5-mock refresh" is a hook bug, the residual `observationLog` data is real dead code, the `task-threads.ts → host-threads.ts` direction was inverted relative to the architecture).

Verify gates: `bun run check` clean, `bun run lint` 0 errors / 171 pre-existing warnings, `bun run test` 3336 pass / 3 skip / 0 fail. CI on PR #68: pending at write time.

---

## AC completeness audit

| AC | Behaviour | Status |
|---|---|---|
| §619 thread surface mounted on bet/task/knowledge/artifact, uses L1 primitive, no parallel comment table | `HostThreadSection` mounted on all four; uses `useHostThread` → `/api/threads`; no parallel table created. Implementation only renders raw payload text — no states beyond loading/error/messages-rendered, no real ThreadShell. | with-finding (M2) |
| §620 every host carries own thread; "no artifact-attached threads" rule removed | `host_kind=artifact` accepted by L1a; `resolveOrCreateHostThread` creates per host. | pass |
| §621 bet detail comment fixture replaced by real thread; task "open thread" opens same primitive | Bet `comments` removed; legacy `bet-comment-thread` testid asserted absent; `TaskSheet` mounts inline `HostThreadSection`. The architectural direction (task-threads → host-threads as shim) is **inverted** — see M6. | with-finding (M6) |
| §622 volume-management designer call shipped (summary on bet, full thread on artifact) | `ArtifactThreadsSummary` ships with cap=10 + truncated flag + `+N more` link. **Error state missing** (design specified `ErrorState` row); section header copy mismatch (design "ARTIFACT DISCUSSION", impl "Artifact threads" with css uppercase). | with-finding (M3, M4) |
| §623 block-anchored discussion uses L2's affordance, no separate dependency | Popover wired on BetPitch and KnowledgeBody; `discuss-block` action; `blockId` rides in plain payload. **Critical defect on WorkBet:** prefill chip rendered at the page level only, NOT passed to HostThreadSection; consequence — composer does not include `blockId` on submit; KnowledgeDetail wires it correctly. F5 (scroll-into-view, dismiss button) **not implemented anywhere**. | **fail (C1, M1)** |
| §624 vitest covers thread surface lifecycle on each host + posting + block-anchored | Tests landed for all surfaces. The `useHostThread` refresh test absorbs 5 fetch mocks — symptom of the version-fragment bug, not a test oddity (M5). | with-finding (M5) |
| §625 playwright e2e bet thread + artifact thread post→reload persist | Specs landed (`bet-thread.spec.ts`, `artifact-thread.spec.ts`, plus knowledge/task/summary/block-anchor). Not run as part of `bun run test` (vitest only). | with-finding (m9) |
| §626 hardcoded comments removed; matching L6 inventory rows closed | `BetDetail.comments` field removed and `BetComment` marked `@deprecated`-but-kept. `ObservationLog` component deleted, but the **`observationLog` data field, type, and full mock entries still live in `KnowledgeDetail.tsx` (lines 73, 97-113, 170) and `fixtures/knowledge-data.ts` (lines 31, 78, 119)** — fixture data un-rendered but undeleted. Architecture explicitly said delete. | with-finding (M7) |
| §627 verify suite green | `check` clean, `lint` 0 errors, `test` 3336 pass / 0 fail. CI on PR pending. | pass |

**Pass count: 2 / 9 fully pass; 6 with findings; 1 fails.** (Line items: §620, §627 pass; §623 fails; rest with-findings.)

---

## Findings — critical → major → minor → nit

### CRITICAL

**C1. WorkBet block-discuss prefill never reaches the composer; chip is decoupled and undismissable.** (lens: design + adversarial; severity: critical)

`packages/web/src/pages/WorkBet.tsx:398-417`. After "Discuss" is selected, `handleDiscussBlock` (line 266-273) sets `threadPrefill`. The page renders the `Re:` chip itself at line 402-409 and explicitly does NOT pass `prefill` to `<HostThreadSection>` at line 417 (comment on line 411-416 admits the omission is to placate the test mock). Consequences:

1. The user sees the chip but the composer has no idea about `blockId`. Submitting forwards no `blockId` to `postPlainHostMessage`, so the message is **not block-anchored** despite the chip claiming it is. Test the production flow in the browser and the message lands in the chronological log only — never inline-after-payload. AC §623 broken on Bet detail.
2. The chip has no dismiss control (F5 explicitly required `× dismiss`); `setThreadPrefill(undefined)` is never called after a successful post (HostThreadSection doesn't know about it). The chip persists forever once shown.
3. Test asymmetry: `WorkBet.discuss-block.test.tsx` mocks `HostThreadSection` to render the chip when `prefill` is passed, then asserts the chip appears. So the test passes — but only because both the page-level chip AND the mock-injected chip are rendered. Two chips in tests; one chip in production with the wrong wiring.

KnowledgeDetail does this correctly (line 372 passes `prefill={threadPrefill}` to HostThreadSection). The bug is WorkBet-only.

What to do: pass `prefill={threadPrefill}` on `<HostThreadSection>` at line 417; delete the page-level chip at lines 402-409; rewrite the WorkBet test (and the block-popover test) to assert via the mock or via a real-render path — the test must not drive the page into a wrong branch. Add F5 dismiss: HostThreadSection's prefill chip needs an `aria-label="Cancel block reply"` button that calls a callback up to the page to clear `threadPrefill`. Add scrollIntoView on the composer textarea per F5. Same dismiss + scroll path needed on KnowledgeDetail.

### MAJOR

**M1. `HostThreadSection` lacks F5 affordances on every surface (dismiss + scroll-into-view).** (lens: design; severity: major)

`packages/web/src/shell/HostThreadSection.tsx:116-125`. The prefill chip renders the `Re: <excerpt>` but no `×` dismiss control. Design F5 ("Composer prefill UX") spelled out three behaviours in order: scroll the composer into view, render `Re:` chip with `× dismiss`, focus the textarea. None of the three is implemented. Architecture step 14 named the failing test `"renders the Re: chip when prefill is set"` — the chip renders but the dismiss/scroll/focus parts of F5 silently dropped.

What to do: add a `onClearPrefill?: () => void` prop; render a small `<button aria-label="Cancel block reply">×</button>` inside the chip; on prefill change, call `composerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })` and `composerRef.current?.focus()`.

**M2. `HostThreadSection` empty / error / message-rendering states miss the design.** (lens: design; severity: major)

`packages/web/src/shell/HostThreadSection.tsx:54-160`.

- *Empty state:* approved.md (Routine 1) requires `"No discussion yet. Be the first to post in this thread."` (the existing `ThreadShell` empty copy via `EmptyState`). Implementation renders no empty stub; only the composer is shown when `messages.length === 0`. AC §619's "thread surface" looks like a bare textarea on a fresh host.
- *Loading state:* implementation renders a single tiny pulsing stripe; design specified `SkeletonList rows={3}` (the rest of the system uses this). Inconsistent with system loading shape.
- *Post error:* `handleSend` (line 65-83) wraps the `postPlainHostMessage` call in `try { … } finally { setSending(false); }` — **no `catch`**. If the post fails, the textarea clears? No — it doesn't even clear because the `setComposerText("")` runs before the post, in the success branch only. Wait: re-reading — `setComposerText("")` is inside the `try` block before `refresh()`, so on a thrown post the text stays. But the user gets *no error feedback*, the spinner just goes away. Silent failure on the primary write path of AC §619.
- *Message rendering:* line 47-52 — `messageText` returns `"[review]"`, `"[questionnaire]"`, `"[verdict]"` literal strings for non-plain types. No timestamps, no sender chip, no styling depth. The design says "Render `<ThreadShell>`"; this is an ad-hoc renderer. Acceptable as an MVP if it stayed in scope, but the architecture said the convergence point IS `<ThreadShell …/>` (architecture.md line 160). It is not.

What to do: render an `EmptyState` when `data === null` and not loading/error; render `SkeletonList rows={3}` for loading; surface a `role="alert"` line when the post throws; either mount `ThreadShell` or document why an ad-hoc renderer is acceptable in this workpackage and capture the gap as a follow-up.

**M3. `ArtifactThreadsSummary` swallows errors.** (lens: architecture + design; severity: major)

`packages/web/src/components/ArtifactThreadsSummary.tsx:42-56`. Hook returns `{ data, error, isLoading, refresh }`. Component reads `data` and `isLoading` — `error` is destructured *only via the spread in the hook itself* but never checked here. When the API errors, `data === null` and the component returns `null` (line 54-56) — same as "no data". The design (approved.md "Spec for B1") explicitly required: `"Error state: ErrorState title=\"Could not load artifact discussion\" description={…} rendered as a single row inside the section."` The user sees an empty bet view section with no signal.

What to do: destructure `error` from the hook; render an `ErrorState` row inside the section when `error !== null`.

**M4. `ArtifactThreadsSummary` overflow link copy and section header mismatch design.** (lens: design; severity: major)

`packages/web/src/components/ArtifactThreadsSummary.tsx:66-67, 105-112`. Design F3: section header `ARTIFACT DISCUSSION`; overflow row: `View all (N more) →`. Implementation: header `Artifact threads` (lowercase text, css `uppercase`), overflow: `+N more`. The text content matters — screen readers and search both pick up "Artifact discussion" / "View all" not "Artifact threads" / "+N more".

What to do: change the literal text. (5 minutes.)

**M5. `useHostThread` refresh fires up to three needless extra fetches.** (lens: adversarial + simplification; severity: major)

`packages/web/src/hooks/useHostThread.ts:48-87`. The version counter is appended to **both** `listUrl` and `detailUrl`. When `refresh()` bumps version:

1. listUrl changes → list fetch fires.
2. SAME render: `detailUrl` recomputes (version is in its dep array AND threadId is still the old non-null value), so detailUrl also changes → detail fetch fires immediately.
3. List fetch resolves → `listState.data` flips → threadId is recomputed → detailUrl recomputes again → another detail fetch fires.
4. The earlier (step 2) detail fetch's response is delivered into a stale `useFetch` state, but that is overwritten by step 3's response.

The hook's own test (`useHostThread.test.tsx:107-157`) had to mock five sequential responses to placate this; the doc-comment on the test (line 108-114) admits this is an effect-sequencing artifact. Builder noticed but did not touch (NOTICED #1). This is an actual bug — every `refresh()` triggers an extra detail fetch.

What to do: keep the version fragment on `listUrl` only. The detail fetch already runs when `threadId` changes; the new threadId from a refreshed list automatically re-fires it. If the same `threadId` comes back (the common case), the version bump on listUrl is not what re-fires detail — re-derive detailUrl with `threadId` *plus* the version of the list response (e.g. tie a `dataVersion` from listState into detailUrl), or simply force a `setVersion`-driven detail re-fetch only when listState mutates. The simpler fix: do not put `version` in `detailUrl`; restructure so `refresh()` triggers an explicit detail re-fetch via a fresh URL key derived from the (fresh) list result.

**M6. `task-threads.ts` was kept as the "real" implementation; `host-threads.ts` is the duplicate.** (lens: architecture; severity: major)

Architecture (line 139) said: "Replace bodies with re-exports from `host-threads.ts`: `export const resolveOrCreateTaskThread = (taskId, founderId, agentParticipantId) => resolveOrCreateHostThread("task", taskId, founderId, agentParticipantId)` and `export { postPlainHostMessage as postRequestMessage } from "./host-threads"`." Reality: `task-threads.ts` still contains the full original implementation (lines 35-97). `host-threads.ts:19` imports `PLACEHOLDER_AGENT_PARTICIPANT_ID` *from* `task-threads.ts` and reimplements `resolveOrCreate*` and `postPlain*` independently (lines 32-99). The dependency is upside-down: the new generalisation imports from the legacy file it was supposed to replace, and the legacy file's bodies are unchanged.

This means the `task-threads-shim.test.ts` "shim" test is misnamed — it asserts that two parallel implementations have compatible signatures, not that the legacy one delegates. If the two implementations drift (e.g. someone fixes a bug in one), the other silently keeps the old behaviour.

What to do: invert the import direction per architecture. Move `PLACEHOLDER_AGENT_PARTICIPANT_ID` into `host-threads.ts`; reduce `task-threads.ts` to:

```ts
export { PLACEHOLDER_AGENT_PARTICIPANT_ID, postPlainHostMessage as postRequestMessage } from "./host-threads.js";
import { resolveOrCreateHostThread } from "./host-threads.js";
export function resolveOrCreateTaskThread(taskId, founderId, agent) {
  return resolveOrCreateHostThread("task", taskId, founderId, agent);
}
```

**M7. Residual `observationLog` data not deleted (NOTICED #2 confirmed).** (lens: slop; severity: major)

`packages/web/src/pages/KnowledgeDetail.tsx:73 (`observationLog?: ReadonlyArray<MockObservationEntry>` on `DetailItem`), 97-113 (full `LEGACY_DETAILS.k1.observationLog` array of 3 entries), 170 (`fromFixture` propagates the field)`; `packages/web/src/fixtures/knowledge-data.ts:31 (`MockObservationEntry` type), 78 (field on type), 119 (3 fixture entries on a mock item)`. Component is gone; data and type lingering. Architecture (line 137) explicitly said: "Delete `ObservationLog`, `ObservationLogProps`, and the legacy `observationLog` field on `DetailItem`."

This is dead data that future readers will assume is rendered, then have to discover isn't. AC §626 requires the surface and its supporting types removed.

What to do: delete the field from `DetailItem`, the `LEGACY_DETAILS.k1.observationLog` literal, the `fromFixture` plumbing, the `MockObservationEntry` type, and the field on `MockKnowledgeItem`. (A 30-line cleanup.)

### MINOR

**m1. `BetComment` interface kept as `@deprecated`.** (lens: slop; severity: minor)

`packages/web/src/types/bet.ts:20-24`. Architecture (line 133) said: "Remove `BetComment` interface (line 14) and the `comments: BetComment[]` field (line 37)." Field is removed; the type is `@deprecated` but still exported. No live callers (grep confirms only the deprecation comment + a fixture comment reference it). Should be deleted.

**m2. `WorkBet` and `KnowledgeDetail` double-fetch the host thread.** (lens: simplification; severity: minor)

WorkBet (`pages/WorkBet.tsx:200`) calls `useHostThread("bet", bet.id)` to derive `messagesByBlockId`; then mounts `<HostThreadSection hostKind="bet" hostId={bet.id} />` (line 417), which calls `useHostThread` again internally. Same on KnowledgeDetail. Two list+detail round-trips per page load. Architecture acknowledged this (NOTICED #4) but did not require a shared cache. Captured as a follow-up — but with M5 fixed, the cost doubles further.

What to do: lift `useHostThread` to the page once, render `<HostThreadSection messages={…} thread={…} refresh={…} />` with the data passed in. Two-line refactor on `HostThreadSection` to accept optional pre-fetched data.

**m3. Empty-with-artifacts stub uses different copy than the design.** (lens: design; severity: minor)

`ArtifactThreadsSummary.tsx:75`. Implementation: `"No artifact discussions yet."`; design F2: `"No artifact discussion yet."` (singular). Plus the design says: "if the bet has zero artifacts, hide the section entirely" — implementation hides only when `data === null`, which means a 200 with `summaries: []` and `totalCount: 0` and a bet with zero artifacts both render the empty stub. The server returns `{ summaries: [], totalCount: 0, truncated: false }` for both "bet has no artifacts" and "bet has artifacts but no messages" — they are indistinguishable client-side. The design's two-state distinction collapses here.

What to do: add a `betHasArtifacts: boolean` flag to the response (server already knows: `taskIds.length === 0` vs not), and gate the section's render on it client-side. Or accept that the distinction is lost and update the design to match.

**m4. `data-testid` added to a design-system primitive.** (lens: architecture; severity: minor)

`packages/design-system/src/BlockActionsPopover.tsx:72`. Tier-2 design-system components should not carry app-test-specific identifiers. The popover already exposes `role="menu"` (line 75) and `data-ds-component="block-actions-popover"` (line 71); tests can target either. Adding `data-testid` to design-system is a smell — it couples a test harness to a primitive's API surface.

What to do: revert the `data-testid` addition; rewrite the L18 tests that look for it to use `screen.getByRole("menu")` or `[data-ds-component="block-actions-popover"]`.

**m5. `AnchoredMessages` defined twice.** (lens: simplification; severity: minor)

`packages/web/src/pages/WorkBet.tsx:67-89` and `packages/web/src/pages/knowledge/KnowledgeBody.tsx:57-75`. Identical inline component. Single-use helpers defined in two places is the textbook duplication.

What to do: move to `packages/web/src/components/AnchoredMessages.tsx`. Delete both copies. (5 minutes.)

**m6. `assertBetReadable` is existence-only, not access-controlled.** (lens: security; severity: minor — consistent with existing posture)

`packages/server/src/routes/bets.ts:55-58`. The lore comment (line 49-54) flags that the IDOR risk is closed against the same posture as `GET /api/bets/:id`. True: `GET /api/bets/:id` (line 106-117) is also existence-only. So this matches the existing project posture, not introducing a regression. But this is the second time L18 documents an unfixed IDOR ("when auth lands…"). Architecture promised "verify the caller has access" — what landed is "verify the bet exists". Consistent with project state, weaker than architecture wording.

What to do: leave as-is for L18 ship; ensure the cross-cutting `auth-middleware-participant-scope` follow-up (`packages/server/src/routes/threads.ts:152-153`) is broadened to include this endpoint. No code change in L18.

**m7. ArtifactThreadsSummary error-handling pattern: mixed test-key collisions.** (lens: adversarial; severity: minor)

The test run output included this real React warning, fired during the `+N more affordance when truncated` test: `Encountered two children with the same key, 'art-x'`. This is a fixture quality problem in `packages/web/src/components/__tests__/ArtifactThreadsSummary.test.tsx` — the truncated case generates rows with duplicate `artifactId` keys. Test passes but the production component would render duplicates. Inspect the test fixture; if production never produces duplicate keys, fix the test fixture; if it can, fix the component.

**m8. WorkBet's `WorkTeam.task-request.test.tsx` had `+ 14` lines added.** (lens: adversarial; severity: minor — verify behaviour-preserving)

The PR diff shows 14 lines added to a test that is not on the L18 critical path. Builder did not surface this in the PR description. Read it: confirm the additions are mock setup for the new `host-threads` shape and not a regression assertion that has been weakened. (Quick spot-read — looks like fetch-mock plumbing for `useHostThread`'s list+detail round-trip, behaviour-preserving — but flag for explicit confirmation.)

**m9. Playwright e2e specs not part of `bun run test`.** (lens: architecture; severity: minor)

AC §625 lists Playwright specs. Builder added `bet-thread.spec.ts`, `artifact-thread.spec.ts`, `task-thread.spec.ts`, `knowledge-thread.spec.ts`, `bet-artifact-thread-summary.spec.ts`, `block-anchor-comment.spec.ts`. None of these run under `bun run test`. CI may catch them; verify.

What to do: run `bun run e2e` locally before merge; if a CI workflow runs Playwright, attach its result; otherwise this AC is "tests exist" not "tests pass".

### NIT

**n1. `task-threads-shim.test.ts` name is misleading post-M6.** Once M6 is fixed (real shim), the name is right; until then, the file tests two parallel implementations.

**n2. `HostThreadSection`'s message render uses `flex flex-col gap-2 text-sm text-[var(--text-hi)]` — no token for message-row spacing.** Density-aware components should consume `var(--density-gap)` or similar (rule AQ-002). One-line replace.

**n3. The architecture's recommended path for capturing the popover anchor (data-attribute query inside `onOpenActions`) was used — clean.** No code change needed; calling out as positive.

**n4. ArtifactThreadsSummary's `relativeTime` helper is declared at module scope as a one-call helper.** Acceptable but inline-able.

**n5. `HostThreadSection.handleSend` mints a fresh `clientKey` per click via `crypto.randomUUID()` — good.** Idempotency contract honoured.

---

## Builder's NOTICED items — adjudication

| # | Item | Status |
|---|---|---|
| 1 | `useHostThread` refresh required 5 fetch mocks | **Real bug** — see M5. Three needless fetches per refresh. |
| 2 | `observationLog` field still on `DetailItem` and `fromFixture` | **Real dead code** — see M7. Architecture said delete. |
| 3 | WorkBet renders prefill chip at page level vs KnowledgeDetail at section level | **Critical bug** — see C1. Production submit forwards no `blockId` on Bet detail. |
| 4 | Double-fetch by useHostThread (WorkBet + HostThreadSection) | **Real but acceptable v1** — see m2. |

---

## Verify-gate evidence

```
$ bun run check
$ tsc --noEmit -p tsconfig.json
(clean)

$ bun run lint
171 warnings, 8 infos. 0 errors. (pre-existing per builder; spot-checked.)

$ bun run test
Test Files  339 passed | 1 skipped (340)
Tests       3336 passed | 3 skipped (3339)

$ gh pr checks 68
Check / Lint / Test  pending  (in flight at write time)
```

A real warning fires during one of the new tests (`Encountered two children with the same key, 'art-x'`) — see m7.

---

## What to ship — minimum cuts to flip to DONE

1. **C1**: pass `prefill` to `<HostThreadSection>` on WorkBet; delete the page-level chip; rewrite the test path so the production wiring is exercised.
2. **M1**: implement F5 (dismiss `×`, scroll-into-view, focus textarea) inside `HostThreadSection`.
3. **M2**: render an empty-state stub with the design's copy; add a post-error `role="alert"`; render `SkeletonList rows={3}` for loading.
4. **M3**: render an `ErrorState` row in `ArtifactThreadsSummary` when the hook errors.
5. **M4**: fix the section header copy and overflow link copy.
6. **M5**: stop putting `version` in `detailUrl`; the test's 5-mock workaround disappears.
7. **M6**: invert the `task-threads.ts` ↔ `host-threads.ts` direction per architecture.
8. **M7**: delete the `observationLog` data, type, and plumbing.

The minor and nit findings are non-blocking. m9 (Playwright) is a process question, not a code change.
