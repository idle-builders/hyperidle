# The open contract (AM5)

The single, surface-agnostic seam that **resolves WHERE a reference opens (target → destination) AND commits that destination to present via the fold** — the one standardized open presentation. Conversations, bets, knowledge docs, and reviews all open an artifact / block / review / session the same way, through this one contract, presented the same way through the fold. The fold's destination half renders the resolved **composition** — Artifact (single), Review (diff), or Block (mixed) — composing the canonical base primitives. Composition semantics, base-primitive purity, and state ownership live in [`docs/process-layer/artifact-primitive.md`](../process-layer/artifact-primitive.md); this doc owns the routing and presentation seam only. Never a per-surface viewer, never a per-surface panel.

Seeded in [`part-model.md`](part-model.md) (the conversation-only wiring) and universalized in AM5. This doc owns the route table; `part-model.md` links here.

## The four nouns

| Noun | What it is | Code |
|---|---|---|
| **Openable reference** | An inline pointer to an openable thing (artifact, block, review, session, entity). Renders inline as a compact embed/chip, never a bare link. | `InlineRef`, `ArtifactRef` (`framework/domain-model/src/thread.ts`) |
| **Open target** | The typed routing *intent* a reference carries — a route discriminant + ids. Not a path; an intent the contract resolves. | `OpenTarget` (`framework/conversation-parts/src/part.ts`) |
| **Open contract** | The pure, stateless seam resolving an open target to one destination (a `navigate` path or a page-supplied callback) — or a documented no-op — and committing it to present via the fold. | `OpenHandler` (`part.ts`), `createOpenHandler` (`layers/core-ui/src/services/open-handler.ts`), `resolveHostRoute` (`layers/core-ui/src/services/host-route.ts`) |
| **Open presentation (the fold)** | *How* a resolved destination presents: an origin-preserving, resizable, in-place split of the current surface (see below). Its destination half renders the resolved composition. | `SplitView` (`framework/design-system/src/SplitView.tsx`, barrel-exported) |

## Route closure (CLOSED — adding a route requires a concept-doc update first)

`OpenTarget.route ∈ { host | artifact | review | session }`.

| `route` | Opens | Resolves to |
|---|---|---|
| `host` | the entity's host surface (block / knowledge / bet / task / agent) | `resolveHostRoute(hostKind, hostId)` — total over host kinds; `user`, `factory`, and (currently) `task` are documented no-ops (`host-route.ts,36-39`) |
| `artifact` | the standardized artifact view | `/artifacts/:id` (`open-handler.ts`) |
| `review` | the review experience | `/work/bet/:betId/review/:reviewId` (`betId` page-supplied; no-op without it, `open-handler.ts`) |
| `session` | the Session view (AM3) | page-supplied `onOpenSession(sessionId)` (no route — a split panel, `open-handler.ts`) |

## Hard rules

- **H1.** Every openable reference, from *any* surface, resolves through this one contract. No surface hand-rolls navigation (`navigate('/artifacts/'+id)`), no surface defines its own opener. `PartList` takes one `onOpen` prop (`PartList.tsx`).
- **H2.** A **block** reference opens its host surface **positioned at the block** (block-anchored open): the handler appends `#block-<encodeURIComponent(blockId)>`; KnowledgeDetail scrolls to the matching `data-block-id` (`open-handler.ts`). Never a standalone block viewer, never a bespoke panel — a block is a derived region of a markdown body with no standalone identity ([`docs/blocks/definition.md`](../blocks/definition.md)).
- **H3.** A target with no destination (unknown route, missing page context, unrouted entity such as a `user`, `factory`, or `task` host, or a `message` ref) yields a documented **no-op or fallback** — never a crash, never a dead URL. (`task` is separately documented as a current no-op in H5.) A `message` entity-ref degrades to a non-navigating `unknown` embed (`part.ts`).
- **H4.** The contract resolves to destinations only; it never renders a view itself — it delegates rendering to the resolved composition. The compositions and their base primitives are a **design-system foundation**: block payloads (`design-system/src/block/*`), `KpiStat` + `Sparkline`, the generic `diff/` core, and `kinds/compose-artifact-body.tsx` live in `framework/design-system`; the review experience in `web` uses the DS diff foundation, adding only review chrome. No per-surface viewer, no parallel content family. Composition/base-primitive semantics: [`artifact-primitive.md`](../process-layer/artifact-primitive.md).
- **F1.** Every reference, from any surface, presents through the one **fold** (the open presentation). No surface hand-rolls its own split/panel/overlay. (H1 extended from *where* to *how*.)
- **F2.** Full-page open is the fully-folded-forward (`full`) terminal state of the fold, not a separate mechanism.
- **F3.** One shared fold primitive (`SplitView` in `framework/design-system`); no per-surface reimplementation.
- **F4.** The fold reuses existing renderers for its destination half — the resolved composition; it authors no renderer and no new view shape.
- **H5.** Host routing matches real routes only. `artifact → /artifacts/:id` (fixed from the dead `/work/artifact/:id`, `host-route.ts`). `task` currently resolves to **null** — the `/work/bet/:betId/task/:taskId` route needs a `betId` not available at the `resolveHostRoute` seam; documented no-op, task→parent-bet routing deferred to a future WP (`host-route.ts`, BLOCKER-1 lore). No reference resolves to a non-existent route.

## Open presentation (the fold)

Every transition between surfaces — chat→artifact, review→artifact, chat→knowledge, knowledge→artifact — opens the **same way**: the current surface **folds open**. It splits in half; the destination renders in the new half; the origin stays live beside it. This is the one standardized "how a new page opens" model.

**Three modes (closed set)** — `FoldMode = "fold-back" | "split" | "full"` (`SplitView.tsx`):

| Mode | What you see | Reached by |
|---|---|---|
| `fold-back` | the origin surface whole (no destination) | fold-back from `split` |
| `split` | origin + destination side by side, **divider draggable to resize** | **fold-forward** from `fold-back` |
| `full` | the destination fills the surface (origin collapsed, resumable) | **fold-forward** again (expand) from `split` |

One continuum: `back ⇄ split ⇄ full`. Full-page open is the `full` terminal state of the fold — not a separate navigation mechanism; the origin keeps its route and state.

**Extracted, not invented.** AM5 extracted the fold from two pre-existing, divergent hand-rolled splits — chat's proportional `flex-[3]`/`flex-[2]` split and review's fixed `w-[620px]` `ExaminePane` — and reconciled both onto the shared `SplitView` primitive (`Conversations.tsx,505`; `ReviewComposition.tsx,745`). `ExaminePane` and `SessionViewPanel` survive as destination-half contents; the fold authors no renderer.

**Divider ratio persists per surface**: web composes `SplitView` with `useUiPreference(surfaceKey, default)` (localStorage; keys such as `conversation.dial-in`, `conversation.session`, `review`). `SplitView` itself stays presentational — props in, drag state local (`SplitView.tsx,51-95`).

## Context completion at the page seam

A reference is source-agnostic and cannot know everything its destination needs. The **page** supplies the gap once, when it binds the contract: `createOpenHandler(navigate, { betId, onOpenSession })` (`OpenHandlerContext`, `open-handler.ts`). The page holds thread→host context (a bet-hosted thread's host *is* the bet; page-supplied `betId` wins over target-carried) and owns panel placement (the session view). No component below the page owns navigation.

## What this is NOT

- Not a new router or parallel route table — it builds on React Router + `resolveHostRoute`.
- Not a per-surface viewer-opener — one contract or the experience drifts per surface (the bug AM5 exists to kill).
- Not a data-shape change — it consumes existing reference shapes; it adds no field and no on-disk format.
- Not a viewer — it routes to destinations; it never renders one.

The fold is NOT a modal/overlay/dialog (it splits in place, the origin stays live beside it), NOT a route-per-pane (the origin keeps its route/state; `full` is the same fold, not a swap), NOT a peek that vanishes on blur (it persists until folded back), and NOT a reinvented widget (extracted from the two pre-existing splits).
