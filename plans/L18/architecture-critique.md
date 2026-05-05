# L18 — Architecture Critique (Reviewer, Round 1)

Source under review: `plans/L18/architecture.md` (designer Round-0).
Verification done by reading source files, not trusting the plan.

## 9-dim scoring

Bar to advance: every dim ≥ 7. Round 1 of max 3.

| Dim | Score | One-line justification |
|---|---|---|
| 1. Spec fit / contract fit | 8 | Honors AC §619 (no parallel comment table), §620 (artifact threads first-class), §621 (bet/task replacements), §622 (volume = UI), §623 (block-anchor via L2). AC mapping table is concrete. |
| 2. Schema integrity | 9 | Verified: `threads.host_kind` is `text not null` (`packages/db/src/schema.ts:179`); the closed `HOST_KINDS` enum in `@hyperidle/shared/thread.ts:17-26` already includes `"artifact"`. No migration is required. The plan is correct here. |
| 3. API hygiene / contract | 6 | New endpoint shape is reasonable; **but** two factual errors and one auth gap. See F1, F2. |
| 4. Dependency direction / layering | 7 | `host-threads.ts` generalises `task-threads.ts` and re-exports — gentle. `HostThreadSection` lives in shell (Tier 3) — correct. The architecture does not reach across layers. |
| 5. Cohesion / over-abstraction | 7 | `HostThreadSection` is justified — it's the same `ThreadShell + composer + resolve-or-create` shape on four surfaces. The `inline?` prop is the only polymorphism. Acceptable, not premature. |
| 6. Test plan completeness | 8 | Vitest list maps to AC §624; Playwright list maps to AC §625. Block-anchor test is named. One missing test: the deprecated `task-threads.ts` re-export round-trip (no callers should break). See F4. |
| 7. Risk surface | 6 | The summary endpoint at large bet (100+ artifacts) is flagged as ⚠️ UNVERIFIED with no concrete plan B; auth on the new endpoint is hand-waved; WS invalidation is out of scope but the plan does not say what stale data the founder will see. See F5. |
| 8. Block-anchor mechanism (L2 fidelity) | 5 | **Major gap.** Plan says `BlockActionsPopover` needs "no code change — consumers add a `discuss-block` action to the `items` array". Read of `packages/web/src/pages/WorkBet.tsx:57-67` (BetPitch): `<Block id={b.id} payload={b.payload} />` is rendered with **no `onOpenActions` callback and no popover at all**. There is no host-side popover plumbing today. L18 must add (per BetPitch and KnowledgeBody): popover open-state, `onOpenActions={() => setOpen(blockId)}`, the `BlockActionsPopover` element + items list, anchor positioning, escape-to-close wiring. This is non-trivial new work, not "consumers add an item". The plan understates it. See F3. |
| 9. Implementation realism (deps + APIs match the codebase) | 4 | **Critical gap.** Plan repeatedly invokes React Query (`["thread", hostKind, hostId]` keys, `queryClient.setQueryData`, hook keyed `["bet", betId, "artifact-thread-summary"]`, "Invalidate when ANY `["thread", "artifact", *]` mutation succeeds"). Reality: **React Query is not installed and not used anywhere in `packages/web`.** Existing hooks (`useBet`, `useArtifact`, `useArtifacts`) all wrap a custom `useFetch` (`packages/web/src/hooks/useArtifacts.ts:5`, `packages/web/src/hooks/useBet.ts`). The architecture footnotes its own "⚠️ UNVERIFIED note: at the time of writing the bet-view fetch is via a custom `useBet` hook" but then continues to spec React Query keys for L18's hooks. This is a contradiction the plan must resolve before code is written. See F1. |

**Round 1 verdict.** **RE-CRITIQUE REQUIRED.** Two dims below 7: dim-9 (4) and dim-8 (5). Plus dim-3 needs polishing. Round 2 expected.

## Findings

### F1 — Critical: React Query is not in the codebase. The hooks section is fiction.

**Where:** `architecture.md` §"Files added" (rows for `useHostThread.ts`, `useArtifactThreadSummary.ts`), §"Data fetching" (entire React Query keys table), §"Cache invalidation on post" (`queryClient.setQueryData`).

**Reality:** `grep -rn "@tanstack\|react-query" packages/web/package.json` returns nothing. `useArtifact` is `useFetch<Artifact>(…)`. `useBet` is `useEffect + useState + fetch`. There is no `QueryClient`, no `QueryClientProvider`, no `useQuery`, no key-based invalidation primitive available.

**Required revision (designer choice — pick ONE):**
- (a) **Match the existing pattern.** Spec `useHostThread` and `useArtifactThreadSummary` as `useFetch`-based hooks, with explicit refetch helpers and an event-bus / window-focus listener for invalidation. Drop all React Query language. This is the lowest-risk path — matches `useArtifact`/`useBet` shape exactly.
- (b) **Introduce React Query.** Add `@tanstack/react-query` + `QueryClientProvider` to `packages/web` as part of L18's scope. This is a real cross-cutting change; bumps L18 effort significantly. Document migration plan for `useBet`/`useArtifact` (or explicitly carve them out). Probably out-of-scope for L18.

The cache-invalidation specifics ("Invalidate when ANY `[thread, artifact, *]` mutation succeeds inside this bet"; "Naive: invalidate the summary key on every artifact-thread post regardless of bet") are unsupportable without the underlying primitive. Until F1 is resolved, these claims are dead text.

### F2 — Factual: artifacts query param is `betId`, not `bet_id`

**Where:** `architecture.md` §API rationale ("Why a new endpoint, not an extension of `/api/artifacts`? … `GET /api/artifacts?bet_id=…`").

**Reality:** `packages/server/src/routes/artifacts.ts:200` reads `c.req.query("betId")` (camelCase). This was already verified in `useArtifacts.ts:9` — `params.set("betId", filter.betId)`.

**Required revision:** rewrite the param name in the rationale; the conclusion (separate endpoint) is still correct, but the architect should not reference an endpoint shape they haven't read. This kind of error implies similar misreads elsewhere.

### F3 — Major: block-anchor mechanism understates the host-side work

**Where:** `architecture.md` §"Files modified" — "`packages/design-system/src/BlockActionsPopover.tsx`: No code change. Consumers add a `discuss-block` action to the `items` array."

**Reality:** `packages/web/src/pages/WorkBet.tsx:57-67` renders `<Block id={b.id} payload={b.payload} />` with no `onOpenActions`, no popover anchor, no popover state. Read of `packages/design-system/src/Block.tsx:60-71`: Block exposes `onOpenActions: () => void`; the host owns popover open-state, items, anchor positioning, focus management. None of this is wired in BetPitch today. KnowledgeBody is in the same state (verify against `packages/web/src/pages/knowledge/KnowledgeBody.tsx`).

**Required revision:** Add a step in the ordered task list specifically for "Block popover wiring on BetPitch and KnowledgeBody" — open-state hook, anchored popover, items list including the new `discuss-block` action, focus-trap, escape-to-close. Reference this as the actual location of the L2 affordance plumbing (the popover component itself is unchanged; the host wiring is brand-new per consumer). Right now the plan reads as if a one-line items addition does the job; it does not.

Also: the plan's `slots.inlineAfterPayload` claim for rendering anchored messages "via the existing block-id attribute" needs a concrete data flow: how does the bet-pitch knowing-which-thread mounts the messages on the right block? Spell out the wiring (page-level read of all bet-thread messages with `payload.blockId`, group by `blockId`, pass into Block as `slots.inlineAfterPayload`).

### F4 — Service rename: `postRequestMessage` vs `postPlainMessage`

**Where:** Plan says "`host-threads.ts` … `postPlainMessage(threadId, text, clientKey, blockId?)`". Existing helper in `packages/web/src/services/task-threads.ts:80` is `postRequestMessage`. The plan also says `task-threads.ts` will re-export from `host-threads.ts` for back-compat.

**Required revision:** Spell out which name wins. Either:
- (a) keep `postRequestMessage` and merely add `blockId?`, OR
- (b) rename to `postPlainMessage` and provide an aliased re-export in `task-threads.ts` so existing callers compile.

Plus: add a Vitest test that the re-export shim still works (`import { postRequestMessage } from "./task-threads"` returns the same function). Without it, "Mark `@deprecated` and re-export" silently breaks every TaskSheet caller.

### F5 — Authorization on the new summary endpoint is hand-waved

**Where:** §API "Authorisation: same as the artifact list — the founder is the implicit caller; per-tenant isolation inherits from the broader auth middleware (open follow-up — see L1's L8 lore comment)."

**Reality:** the L8 lore (`packages/server/src/routes/threads.ts:147-153`) explicitly notes the IDOR risk on `participant_id` is unfixed. The new endpoint at `GET /api/bets/:id/artifact-thread-summary` will return artifact thread snippets for any bet whose id the caller knows — same shape of risk. The plan does not address it.

**Required revision:** Either (a) add an explicit `// @lore L18-auth-gap: same IDOR profile as L1; auth-middleware story closes both` lore note in the architecture's risk section, OR (b) add a route-level participant scope check now (the bet record has owner/team; cross-check against caller identity).

The plan should at minimum **list this in §Open questions / risks** rather than burying it in the API table. Right now it's hidden in one sentence and the risk header below it does not mention it.

### F6 — Pagination of the summary endpoint

**Where:** §"Risks" point 4: SQLite at hundreds of artifacts is ⚠️ UNVERIFIED. No pagination spec.

**Required revision:** Add a hard cap (e.g. `limit=50`, server-enforced) + cursor on `(lastMessageAt, artifactId)` mirroring the existing artifacts cursor (`createdAt|id`, see `routes/artifacts.ts:232-238`). Match the convention. If pagination is deferred to a follow-up, add the cap NOW so a runaway aggregate cannot DoS the bet view. Cap-without-cursor is acceptable as a v1.

### F7 — Test plan: missing the failing-test gates listed in CLAUDE.md

**Where:** §"Tests" enumerates Vitest + Playwright but the §"Ordered tasks" tells the builder "Failing test first" generically.

**Required revision:** For each ordered task, name the **specific** failing test that gates it. The current "Failing tests first" pattern is template language — give the builder one named test per task. (e.g. "Step 4 server endpoint — failing test: `bets.artifact-thread-summary.test.ts > returns one row per artifact with messages`".)

This is a process polish, not a blocker.

### F8 — Knowledge entry: the plan deletes `ObservationLog` and the `observationLog` field, but doesn't say what the L26 follow-up looks like

**Where:** §"Files modified" — "`KnowledgeDetail.tsx`: Replace `<ObservationLog … />` with `<HostThreadSection …/>`. Delete `ObservationLog`, `ObservationLogProps`, and the legacy `observationLog` field on `DetailItem`."

**Concern:** The current `ObservationLog` entries (`packages/web/src/pages/KnowledgeDetail.tsx:309-347`) are agent-attributed `{ agent, text, timestamp }` rows. Threads are message-typed and append-only with sender ids. Are existing observation log entries migrated to thread messages, or is the existing data simply discarded? Read of `packages/web/src/fixtures/knowledge-data.ts` will show whether the entries are real persisted data or pure fixtures. If pure fixture, fine — say so. If persisted, plan a migration.

**Required revision:** One-line answer in §Open questions: "Observation log entries are fixture-only; deletion is non-destructive." (or its opposite, with a migration note).

## Required revisions before advancing

| # | Severity | Required by Round 2 |
|---|---|---|
| F1 | Blocker | Pick (a) `useFetch`-shape OR (b) introduce React Query as part of L18; rewrite §"Data fetching" accordingly. |
| F2 | Polish | Fix `bet_id` → `betId`. |
| F3 | Blocker | Add explicit "Block popover wiring on BetPitch + KnowledgeBody" task with required props/state; describe the message → block-id grouping for `slots.inlineAfterPayload`. |
| F4 | Polish | Pick `postRequestMessage` vs `postPlainMessage`; spell out shim test. |
| F5 | Polish | Add the IDOR risk to §Open questions explicitly + decide cap-now vs follow-up. |
| F6 | Polish | Add `limit=50` server cap on the new endpoint. |
| F7 | Nit | Name the specific failing test per ordered task. |
| F8 | Nit | One-line answer on observation-log data. |

## Verdict

**RE-CRITIQUE.** Round 1 fails dim-8 (5) and dim-9 (4); dim-3 borderline at 6. Two of three failures are unequivocally factual (React Query absent; popover plumbing missing). Designer must address F1 and F3 at minimum to pass Round 2.

Recommendation to the orchestrator: send F1–F8 back to the designer (`a69924c6873f11ee5`) for a Round-2 revision focused on F1 (data-fetching realism) and F3 (block popover wiring). The other points are tractable polish.
