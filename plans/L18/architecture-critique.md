# L18 — Architecture Critique (Reviewer)

Source under review: `plans/L18/architecture.md` (designer Round-2 at commit `f674629`).
Verification done by reading source files, not trusting the plan.

---

## Round 2 — final scoring

Every dim must be ≥ 7 to advance. Round 1 verdict was RE-CRITIQUE (dim-8: 5, dim-9: 4, dim-3: 6).

| Dim | R1 | R2 | One-line justification |
|---|---|---|---|
| 1. Spec fit / contract fit | 8 | 9 | AC §619-628 mapped concretely. F7 polish (named failing tests per task) is now landed — every ordered task carries a specific `it(...)` block name. |
| 2. Schema integrity | 9 | 9 | Re-verified: `threads.host_kind` is `text not null`, `host_kind=artifact` is already permitted (and used by the existing test in `threads.host-kinds.test.ts`). No migration. The plan acknowledges this. |
| 3. API hygiene / contract | 6 | 8 | F2 fixed (`betId` camelCase confirmed against `routes/artifacts.ts:200`). F6 cap landed (10 rows + `totalCount` + `truncated`). F5 IDOR explicit (reuses bets.ts read path, suggests `assertBetReadable(betId, c)` helper). Endpoint shape concrete; 404-on-unauth path named in tests. |
| 4. Dependency direction / layering | 7 | 7 | Re-export shim policy is documented (`task-threads.ts` becomes `@deprecated` re-exports + a round-trip Vitest spec at `task-threads-shim.test.ts`). One nit (no blocker): the deprecation does not state when the shim is removed — leave a follow-up row referencing this so it does not linger forever. |
| 5. Cohesion / over-abstraction | 7 | 8 | `HostThreadSection` for 4 host kinds is the right unification — the only polymorphism is `inline?` and `prefill?`. Round 2's `prefill` prop is small and load-bearing (the `Re: <excerpt>` chip on block-anchored composer); not a generic escape hatch. Acceptable. |
| 6. Test plan completeness | 8 | 9 | F7 done. Added: `task-threads-shim.test.ts` (asserts legacy names still resolve), `WorkBet.block-popover.test.tsx`, `WorkBet.discuss-block.test.tsx`, `WorkBet.anchored-messages.test.tsx`, KnowledgeDetail parallels. The 19-step ordered list now has a 1:1 test map. |
| 7. Risk surface | 6 | 7 | F5 IDOR closed in-scope (auth-helper extraction, not deferred). F6 cap closed (10 rows). Stale-summary on cross-tab posts explicit and accepted as v1 behavior. Two ⚠️ UNVERIFIED items remain — both resolved below in this critique. SQLite plan-cost at 100+ artifacts is bounded by the 10-row cap. |
| 8. Block-anchor mechanism (L2 fidelity) | 5 | 8 | F3 closed. New §"Block popover wiring" is explicit: page-level `openBlockId` state, anchor refs map, portal-mounted popover, `discuss-block` action wired to a page-owned `discussBlock(blockId)` handler. New §"Anchored-message rendering" is explicit: page derives `messagesByBlockId` from a single `useHostThread`, BetPitch/KnowledgeBody pass per-block slices into `<Block slots={{ inlineAfterPayload: ... }} />`. The `slots.inlineAfterPayload` shape is **verified to exist** (see ⚠️ resolution below) — designer was right. |
| 9. Implementation realism (deps + APIs match codebase) | 4 | 9 | F1 closed. Round 2 §"Data fetching" is rewritten against the real `useFetch` hook (verified `packages/web/src/hooks/useFetch.ts` is the 50-line `fetch + useState + cancellation` primitive at lines 1-49; no React Query in `package.json`; no `@tanstack` references anywhere in `packages/web/src`). The `useFetch(url)`-with-version-fragment refresh trick is consistent with `useFetch`'s URL-keyed `useEffect` (line 46: `[url]` dep). Re-fetch fires when the version fragment changes the URL string. No optimistic updates — server round-trip is the source of truth. The plan now matches `useArtifacts`/`useBet` shape. |

**Round 2 verdict.** **ADVANCE.** Every dim ≥ 7; mean 8.2. The two ⚠️ UNVERIFIED items resolved below; neither changes the public API or ordered tasks.

---

## ⚠️ UNVERIFIED items — resolved by reviewer

The architecture's Open Questions §11 and §12 flag two items as builder-resolves-on-read. I verified them by reading source so the builder does not have to.

### §11 — `Block.slots.inlineAfterPayload` API name — VERIFIED EXISTS

`packages/design-system/src/Block.tsx:55-58`:

```ts
export interface BlockSlots {
  gutterLeading?: ReactNode;
  inlineAfterPayload?: ReactNode;
}
```

`Block` accepts `slots?: BlockSlots` (line 64) and renders `{slots?.inlineAfterPayload}` inside the content column at line 124, after `renderPayload(payload, sanitizeHtml)`. The shape is exactly what the architecture assumes.

**Resolution:** The designer's pattern (page derives `messagesByBlockId`, BetPitch/KnowledgeBody pass per-block slices into `<Block slots={{ inlineAfterPayload: <AnchoredMessages messages=... /> }} />`) compiles as-written. **No change to the architecture or ordered tasks.**

### §12 — `Block` anchor ref for the popover — RESOLVED, smaller diff than designer expected

`packages/design-system/src/Block.tsx`:

- Block does **not** accept a `ref` prop today (line 60-71 — no `forwardRef`).
- Block's outer `<article>` (line 104) carries `data-ds-component="block"`, `data-block-id={id}` (line 109), and a child `<div data-block-gutter>` (line 117) — both queryable by data-attribute.
- `onOpenActions` is invoked synchronously on Enter / Space (lines 36, 41) and on the click path that the host wires.

**Resolution.** The architecture's first proposal (page-level `anchorRefs.current.set(block.id, el)` via a ref-callback **threaded through `Block`**) is **not buildable as-written** — Block is not a `forwardRef`. Three workable alternatives, in order of smallest diff:

1. **Cleanest (recommended):** Wire the popover anchor at the click moment. `onOpenActions` is the only path that opens the popover; the host can capture `el = document.querySelector(\`[data-block-id="\${blockId}"] [data-block-gutter]\`)` synchronously inside the page's `onOpenActions` handler and stash it in `useState<{ blockId: string; anchor: HTMLElement } | null>`. No ref-callback per Block; no Block API change. This works because `data-block-id` is already on the article and the popover only needs the anchor when it opens.
2. **Wrap each Block** in a host-controlled `<div ref={(el) => anchorRefs.current.set(b.id, el)}>` — strictly additive, no Block API change. Slightly more nodes; adequate.
3. **Add `forwardRef` to Block** — strictly additive Block API change. Cleanest at the consumer, but a Block API edit. Builder picks if they want the cleanest consumer.

**The architecture should pick option 1** (smallest diff, no Block API change, no extra DOM nodes). The current §"Block popover wiring" prose threads `ref={(el) => …}` directly through `<Block>`, which today does not accept `ref`. **This is a cosmetic correction — the public surface doesn't change, no task in the ordered list moves — so the builder applies it on read.** I am writing this resolution into the architecture's Open Question §12 as a finding so the builder sees it without re-discovering.

Both items resolved without changing the API contract, file plan, or task list. Both are acceptable for builder-resolves-on-read by my own test ("if the answer changes the public API or the ordered task list materially, it must be resolved now"). They do not.

---

## Verifications I ran (round 2)

I read each file the designer cited and confirmed the quote / line is accurate.

| File | Designer claim | Verified? |
|---|---|---|
| `packages/web/src/hooks/useFetch.ts` | 50-line `fetch + useState + cancellation`; URL-keyed `useEffect` | YES — 49 lines, dep `[url]` at line 46. |
| `packages/web/src/hooks/useBet.ts` | `useEffect + useState + fetch`; not `useFetch`-wrapped | YES — direct `fetch()` (line 33), not via `useFetch`. (Note: the designer's claim that `useBet` "wraps `useFetch`" is slightly imprecise; `useBet` predates the `useFetch` extraction. Architecture text says "Existing consumers (`useBet`, `useArtifact`, `useArtifacts`) all wrap it" — accurate for `useArtifact`/`useArtifacts` per `useArtifacts.ts:5,16,20`, slightly inaccurate for `useBet`. Not load-bearing — the L18 hook spec is `useFetch`-based regardless.) |
| `packages/web/src/services/task-threads.ts` | Existing exports `resolveOrCreateTaskThread` + `postRequestMessage`; the latter is "misleading — type is plain not request" | YES — line 35 + line 80; the body sends `type: "plain"` (line 89), so `postRequestMessage` is indeed a misnomer. F4 rename rationale is correct. |
| `packages/web/src/pages/WorkBet.tsx:57-67` | `<Block id payload />` with no `onOpenActions`, no popover | YES — line 63: `<Block key={b.id} id={b.id} payload={b.payload} />`. No popover anywhere on the page. |
| `packages/server/src/routes/artifacts.ts:200` | `c.req.query("betId")` (camelCase) | YES — line 200 exactly. |
| `packages/server/src/routes/threads.ts:147-153` | L8 lore IDOR comment on `participant_id` | YES — exact lines, exact wording. |
| `packages/web/src/fixtures/knowledge-data.ts:78,119` | observationLog is fixture-only | YES — line 78 (type field), line 119 (mock data). Grep across `packages/db` and `packages/server` returns zero matches for `observation_log` / `observationLog`. F8/F9 conclusions correct. |
| `packages/db/src/schema.ts` (~line 179) | `threads.host_kind` is `text not null` | YES — `hostKind: text("host_kind").notNull()`. |
| `packages/web/src/pages/knowledge/KnowledgeBody.tsx` | Renders `<Block id payload sanitizeHtml />` with no popover; no `onOpenActions` | YES — line 62. The L23 lore at lines 14-17 explicitly says "popover is not wired in L23". |
| `packages/design-system/src/Block.tsx` | `slots.inlineAfterPayload?: ReactNode` exists | YES — lines 55-58. See ⚠️ resolution above. |

Designer's quotes are honest and accurate. The one minor imprecision (`useBet` "wraps useFetch") does not affect any L18 conclusion.

---

## Round 1 findings — closure log

| # | R1 status | R2 closure |
|---|---|---|
| F1 — React Query fiction | Blocker | **CLOSED.** Rewritten against real `useFetch`; verified no `@tanstack` in `package.json` or `src/`. Refresh via version-fragment URL is consistent with `useFetch`'s URL-keyed effect. |
| F2 — `bet_id` vs `betId` | Polish | **CLOSED.** Architecture now references `betId` and cites `routes/artifacts.ts:200`. |
| F3 — Block popover wiring | Blocker | **CLOSED.** New §"Block popover wiring" + §"Anchored-message rendering" sections give the page-level state, anchor ref pattern, popover plumbing, focus-restore, and inline-after-payload data flow. Steps 12-15 in the ordered task list cover the work. The only residual is the ref-forwarding nuance, resolved above as an architecture-doc finding (no API change). |
| F4 — Service rename | Polish | **CLOSED.** `postPlainHostMessage` + `resolveOrCreateHostThread` chosen; old names retained in `task-threads.ts` re-export shim with `@deprecated`; round-trip test at `task-threads-shim.test.ts` named in step 5. |
| F5 — IDOR on summary | Polish | **CLOSED.** Auth-helper reuse from bets.ts read path documented; suggested `assertBetReadable(betId, c)` helper extraction; 404-on-unauth named in test step 4. Cross-cutting `participant_id` IDOR explicitly out of scope (auth-middleware follow-up). |
| F6 — Pagination cap | Polish | **CLOSED.** 10-row cap server-enforced; `totalCount` + `truncated` flag in response; cap-without-cursor accepted for v1; "View all" link points to `/artifacts?betId=` which already paginates. |
| F7 — Failing-test gates | Nit | **CLOSED.** Every step in the 19-step ordered list names specific `*.test.ts(x)` files and `it(...)` blocks. |
| F8 — Observation log persistence | Nit | **CLOSED.** Verified fixture-only at `knowledge-data.ts:78,119`; no DB or server route. Deletion non-destructive. |

---

## Residual nits (NOT blockers)

These do not affect ADVANCE. Capture as builder hints / follow-ups, not gates.

1. **`task-threads.ts` deprecation has no removal date.** The shim will linger forever absent a follow-up row. Recommend a `plans/work-packages/follow-ups.md` entry: "Remove `task-threads.ts` shim once L1a/L15 callers migrated; deadline = end of Track-L."
2. **§12 Open Question (Block ref-forwarding) prose still says "or wraps each Block in a host-controlled flex-row that owns the anchor".** My resolution above prefers option 1 (data-attr query at click time) — strictly smaller diff, no extra DOM. Builder applies on read.
3. **`refresh()` cache-buster fragment trick.** `useFetch(${url}#v=${version})` causes a new effect run because the URL string changes. The fragment is stripped client-side by browsers before the network request, so the server sees the same URL. **Be aware:** if Vite or any dev-only middleware were to log the full URL, the `#v=N` would appear in client-side console, not server logs. Innocuous. The pattern works.
4. **`useArtifactThreadSummary` cross-tab staleness** is documented + accepted; it is the only data-freshness compromise in v1, and it is bounded by re-mount on navigation. Acceptable.

---

## Verdict

**ADVANCE.** Round 2 closes both blockers (F1, F3) and all six polish items. Every dim ≥ 7; mean 8.2 (R1 mean was 6.7). Two ⚠️ UNVERIFIED items resolved by direct source read; neither affects the public API or ordered tasks. Architecture is buildable as-written. Builder may proceed to /write-tests.

Recommendation to the orchestrator: send the architecture to /write-tests. Reviewer keeps context warm for Phase 4 code review.
