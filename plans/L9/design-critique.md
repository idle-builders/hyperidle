# L9 — Design Critique (round 1)

**Verdict: APPROVED (>=7)**

DESIGN-CRITIQUE: variant=single-detail-url-addressed score=8/10 rounds=1 axes: H:8 S:8 T:8 C:8 Co:9 St:9 A:8 AS:9 PP:7

The approved variant for L9 is correctly classified as routine. Variant production was a one-variant + considered-alternatives doc, which is the right shape for this workpackage: shell composition unchanged, all visible primitives (`EmptyState`, `ErrorState`, `SkeletonList`, `ThreadShell`) already exist and are token-audited, no new components, no new tokens. The novel ingredient is the not-found copy and link affordance — promoted from a raw "HTTP 404" string to an explicit, navigable `EmptyState`. That promotion is the headline behaviour and it is correctly explicit, not implicit.

I scored against the L9-specific concerns the parent flagged, then against the 9-dim rubric.

---

## L9-specific concerns

### Route topology matches "one queue + one detail surface"

YES. `plans/L9/design/approved.md` §1.1 names exactly two canonical paths under the AppShell layout: `/conversations` (queue, Submenu visible, Main pane shows the empty state) and `/conversations/:threadId` (Submenu visible, Main pane mounts `ThreadShell`). No per-shape routes, no per-host routes. This satisfies AC-1 ("one queue plus one detail surface per thread") and AC-2 ("the detail surface renders whichever thread the user picked") at the route layer. The contract that "adding a new message type adds a branch inside `ThreadShell`, not a sibling page" is reaffirmed in §1.4.

### Legacy redirect strategy preserves history and never 404s

YES, with one subtle correctness check. §1.1 lists four legacy URL shapes: `/conversations/review`, `/conversations/review?id=X`, `/conversations/chat`, `/conversations/chat?thread=X`. All redirect with `replace: true`. The design's reading of "preserve history" is correct: preserve the user's *navigation* history, not the redirect step itself. With `replace`, pressing back from `/conversations/X` lands on whatever was before the legacy URL, not back into the legacy path that would re-redirect. This is what the spec wants. The repository's grep also confirms there are no `/conversations/review/:id` path-style legacy URLs, only query-string forms — so the four enumerated cases are exhaustive for what shipped to users.

### Not-found empty state is explicit (NOT the editable-fallback anti-pattern)

YES. §1.2 State E is the strongest part of this design: explicit `EmptyState` titled "Thread not found", description that names three plausible causes (resolved / archived / wrong link) without exposing the HTTP code, and a `<Link to="/conversations">Back to inbox</Link>` action. Crucially, §1.2 explicitly states that `ThreadShell` is *not* mounted in this state — there is no message list, no composer, no fixture content that could lead a user to author into a non-existent thread. §2-U also rejects pushing this responsibility into `ThreadShell` itself, because "no data" and "the entity is missing" are different contracts. The page owns not-found because the page knows the URL the user typed. This is a clean separation; the spec calls out exactly this anti-pattern in TRACK-L L9 validation scenarios and the design closes it.

### Naming: "Chat" / "Review" banished in favor of one canonical noun

YES. concept.md §2 lays out the vocabulary table and the design's copy table (§1.7) follows it: "Failed to load thread" replaces "Failed to load review"; "Open a thread to see it here" replaces "No thread selected" / "Open a review from the inbox". The design notes one user-language exception — the link text "Back to inbox" — and acknowledges that strict canonical "Back to thread list" is acceptable to the architect. That is reasonable: HIL docs already use "inbox" as the user-language synonym for the queue. The design does not committed to "ConversationDetail" vs "Conversations" — it punts that to the architect, which is correct (concept did the same). The architecture artifact picks `Conversations.tsx` (D1).

### Considered alternatives include modal-as-detail / slug-by-shape

PARTIAL. §2 enumerates five rejected alternatives: shared-hook with two pages (X), per-shape route segment (Y), query-string id (Z), composer-in-empty-state (W), and a wildcard-redirect approach (V). The "slug-by-shape" rejection is exactly Y, well-argued (URLs that mutate based on content invalidate bookmarks and race the WS message-arrived event). The "modal-as-detail" alternative — where the queue stays at `/conversations` and clicking a row pops a side-sheet or modal rather than navigating — is NOT considered. That is a real design choice in collapsing this kind of detail surface, and HIL §form-factors does explicitly rule it out for desktop ("the Main pane is the surface; modals are for transient actions"), but the design doesn't cite that. **Suggestion below.** It does not block APPROVED — the path-based detail is correct, and the unstated alternative would have been rejected anyway by the form-factor doc — but recording the rejection makes the design audit trail complete.

---

## 9-dimension rubric

I scored each dimension against the design-document's claims plus the existing primitives the design consumes. No screenshots available because there is no `mockup.html` for routine work; the variant cites the existing live primitives, and I confirmed those primitives are token-clean by reading `packages/design-system/src/EmptyState.tsx`, `ErrorState.tsx`, `ThreadShell.tsx`.

| Dim | Score | Reasoning |
|---|---|---|
| Hierarchy | 8 | One clear primary action per state. Empty A: Submenu row click. Loading B: skeleton. Error C: retry. Populated D: read messages / append. NotFound E: back link. The hierarchy is set by the underlying primitives, which were already audited. |
| Spacing | 8 | No new spacing introduced. Reuses `--density-page-gutter`, `--density-card-pad`, `--density-card-gap` via the existing primitives. AQ-001/002/003 not implicated by this workpackage. |
| Typography | 8 | No new type. Empty/Error states inherit the audited type scale. AQ-004 not implicated. |
| Color | 8 | No new color use. Importantly, the design correctly notes (§1.7, §4) that the not-found state is a *neutral* empty state, not a danger state. ErrorState (red-only danger) is reserved for actual fetch errors. This is the right semantic split; conflating "404" with "5xx" would have broken the danger contract. |
| Coherence | 9 | This is the workpackage's whole point: the route shape now matches the L1 primitive's shape. No more page-level dispatch racing the L1 internal dispatch. Concept §3 contract 2 is satisfied at the design layer. |
| States | 9 | Five named states (A/B/C/D/E) with explicit `data-testid` hooks. The state matrix in §3 cross-references URL × body × `aria-current` × composer reachability — that is the right level of detail for a critique to evaluate. |
| A11y | 8 | `<Link>` (semantic navigation, not a button) for the not-found action, `aria-label` on the skeleton, `aria-current` on Submenu row. The `EmptyState` and `ErrorState` primitives are already a11y-audited (`role="alert"` on ErrorState confirmed). |
| Anti-slop | 9 | No emoji, no marketing superlatives, no decorative icons, no purple gradients, no `rounded-2xl`. The design explicitly says "the design uses no icons" on empty states — directly addresses AQ-105 / AQ-113 (over-iconification, list-row icons). |
| Premium polish | 7 | Minimum-viable, not expressive. The design correctly identifies this as the right move for a triage-utility surface: there is no expressive moment because the user's relationship to this surface is utilitarian. The lower score is structural, not a fix-this finding. |

**Average: 8.0/9.0 dimensions × 9 = 72/90, weighted 8/10.** The self-score in §4 came in at 74/90 (~8.2/10); my independent score is one half-point lower on Coherence (the design self-scored 9 and I agree, but A11y and States I weighted slightly more conservatively pending Phase 4 verification of the actual rendered TSX).

---

## CRITICAL

None.

## WARNING

None.

## SUGGESTION

1. **[design/approved.md §2]** Add a sixth considered-alternative — *modal-as-detail* (queue stays at `/conversations`; row click opens a side-sheet/modal). Reject it citing `docs/human-interface-layer/` form-factors (Main pane is the surface; modals are transient). Recording the rejection completes the alternatives audit and shields the design from a future "did you consider…" challenge.
2. **[design/approved.md §1.7]** The "Back to inbox" link copy mixes user-language ("inbox") with the canonical noun ("thread"). Either commit fully ("Back to inbox" — the L8 user-language convention) or fully canonical ("Back to thread list"). Currently the design lets the architect pick, which leaves an inconsistency window. Recommend committing to "Back to inbox" in this design and capturing it as the canonical user-language synonym in `docs/human-interface-layer/` so downstream surfaces follow.
3. **[design/approved.md §1.5 row C]** `data-testid="thread-error"` is listed as "(new)". Confirm whether this is a new testid being introduced or whether the existing `error-state` testid (default in `ErrorState`) is sufficient — the architect should not silently introduce a second testid when the primitive already publishes one. Either keep `thread-error` as a deliberate page-scoped selector (and document why), or drop the override and use the default.

## What's Working Well

- The not-found state is the headline new behaviour and it is *explicit*: it does not mount `ThreadShell`, it does not show a composer, it does not say "404". This is the editable-fallback anti-pattern fix the spec demands, expressed as a deliberate design decision in §1.2 + §2-U + §1.7. Phase 4 should preserve this verbatim.
- The state-matrix table in §3 (URL × body × aria-current × composer-reachable × test-hook) is exactly the level of contract Phase 4 needs to verify against. Five states with five testids and five trigger conditions — every cell is testable.
- The `replace: true` reasoning in §1.1 is correct *and explicit*. Most agents would have copied the existing `replace` pattern without noting why it satisfies the spec's "preserve history" requirement; this design names the semantic explicitly so a future contributor cannot regress to non-replace redirects without breaking the documented contract.
