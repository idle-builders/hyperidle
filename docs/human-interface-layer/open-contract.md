# The open contract (AM5)

The single, surface-agnostic seam that **resolves WHERE a reference opens (target → destination) AND commits that destination to present via the fold** — the one standardized open presentation. Conversations, bets, knowledge docs, and reviews all open an artifact / block / review / session the same way, through this one contract, presented the same way through the fold, whose destination half renders the resolved **composition** — **Artifact (single)**, **Review (diff)**, or **Block (mixed)** — which composes the canonical **base primitives** (Text family, Code, Image, Link, Html, Table, KPI, Graph). A base primitive is **pure content** (no diff, no state inside it); the **composition owns states** (Artifact's empty/error/loading, Review's no-changes/error, Block's absence; see `docs/process-layer/artifact-primitive.md` §Base-primitive purity). Never a per-surface viewer, never a per-surface panel.

Seeded in `part-model.md` (the conversation-only wiring) and **universalized in AM5**. Concept: `plans/AM5/concept.md`.

## The three nouns

| Noun | What it is | Code |
|---|---|---|
| **Openable reference** | An inline pointer to an openable thing (artifact, block, review, session, entity). Renders inline as a compact embed/chip, never a bare link. | `InlineRef`, `ArtifactRef` (`packages/shared`) |
| **Open target** | The typed routing *intent* a reference carries — a route discriminant + ids. Not a path; an intent the contract resolves. | `OpenTarget` (`packages/shared/src/part.ts`) |
| **Open contract** | The pure, stateless seam resolving an open target to one destination (a `navigate` path or a page-supplied callback) — or a documented no-op — and committing it to present via the fold. | `OpenHandler` / `createOpenHandler` + `resolveHostRoute` (`packages/web/src/services`) |
| **Open presentation (the fold)** | *How* a resolved destination presents: an origin-preserving, resizable, in-place split of the current surface (see below). Its destination half renders the resolved **composition** (Artifact / Review / Block). | the shared fold primitive (`packages/web`) |

## Route closure (CLOSED — adding a route requires a concept-doc update first)

`OpenTarget.route ∈ { host | artifact | review | session }`.

| `route` | Opens | Resolves to |
|---|---|---|
| `host` | the entity's host surface (block / knowledge / bet / task / agent) | `resolveHostRoute(hostKind, hostId)` — total over `BlockHostKind`; `user` is a documented no-op |
| `artifact` | the standardized artifact view | `/artifacts/:id` |
| `review` | the review experience | `/work/bet/:betId/review/:reviewId` (`betId` page-supplied; no-op without it) |
| `session` | the Session view (AM3) | page-supplied `onOpenSession(sessionId)` (no route — a split panel) |

## Hard rules

- **H1.** Every openable reference, from *any* surface, resolves through this one contract. No surface hand-rolls navigation (`navigate('/artifacts/'+id)`), no surface defines its own opener.
- **H2.** A **block** reference opens its host surface **positioned at the block** (block-anchored open). Never a standalone block viewer, never a bespoke panel — a block is a derived region of a markdown body with no standalone identity (`docs/blocks/what-a-block-is-not.md`).
- **H3.** A target with no destination (unknown route, missing page context, unrouted entity such as a `user` host or a `message` ref) yields a documented **no-op or fallback** — never a crash, never a dead URL.
- **H4.** The contract resolves to destinations only; it never renders a view itself — it delegates rendering to the resolved **composition** (**Artifact (single)** composes one base primitive, **Review (diff)** composes two + delta, **Block (mixed)** = Knowledge body; the **composition owns empty/error/loading/no-changes**, not the base primitive; see `docs/process-layer/artifact-primitive.md` §Base primitives × the three compositions × placement / §Base-primitive purity). The composition and its base primitives are a **design-system foundation** (AM5): the base primitives, the generic compare-two-instances `diff` core, and the `mixed` block composition all live in `packages/design-system`, and the review experience in `web` USES the DS `diff` foundation (adding only review chrome) — there is no per-surface viewer and no parallel content family. (AM5 supersedes the prior "Kind × Representation / purified kind renderers" framing: the established block-payload layer is the canonical base-primitive set; the recent `kinds/*-renderer.tsx` duplicate collapses onto it.)
- **F1.** Every reference, from any surface, presents through the one **fold** (the open presentation). No surface hand-rolls its own split/panel/overlay. (H1 extended from *where* to *how*.)
- **F2.** Full-page open is the fully-folded-forward (`full`) terminal state of the fold, not a separate mechanism.
- **F3.** One shared fold primitive (`packages/web`); no per-surface reimplementation. The two existing splits are reconciled onto it.
- **F4.** The fold reuses existing renderers for its destination half — the resolved **composition** (Artifact = base-primitive render, Review = diff canvas, Block = Knowledge body); it authors no renderer and no new view shape.
- **F5.** The only net-new affordances are drag-to-resize and fold-forward/full-screen. Modes are a closed set: `fold-back | split | full`.
- **H5.** Host routing matches real routes: `artifact → /artifacts/:id` and `task →` its parent bet (`/work/bet/:betId/task/:taskId`). No reference resolves to a non-existent route. (AM5 reconciles the two legacy `resolveHostRoute` seams.)

## Open presentation (the fold)

Every transition between surfaces — chat→artifact, review→artifact, chat→knowledge, knowledge→artifact — opens the **same way**: the current surface **folds open**. It splits in half; the destination renders in the new half; the origin stays live beside it. This is the one standardized "how a new page opens" model.

**Three modes (closed set):**

| Mode | What you see | Reached by |
|---|---|---|
| `fold-back` | the origin surface whole (no destination) | fold-back from `split` |
| `split` | origin + destination side by side, **divider draggable to resize** | **fold-forward** from `fold-back` |
| `full` | the destination fills the surface (origin collapsed, resumable) | **fold-forward** again (expand) from `split` |

**Full-page open is the fully-folded-forward (`full`) terminal state of the fold — not a separate navigation mechanism.** There is one continuum: `back ⇄ split ⇄ full`.

**Extracted, not invented.** The fold already ships *twice*, hand-rolled and divergent:

- **chat** — `Conversations.tsx`: a proportional `flex-[3]`/`flex-[2]` split, `border-r` on the origin half, right half = `SessionViewPanel`; close button folds back; `D` toggles dial-in.
- **review** — `ReviewComposition.tsx`: a fixed `w-[620px]` `ExaminePane`, `border-l` on the destination half; ✕ or `Esc` closes; clicking the same artifact row toggles it closed.

AM5 **standardizes on the proportional/resizable split (chat's model)** — it is closest to the founder's drag-resize ask — extracts ONE shared fold primitive (the split container + draggable divider + mode control) into `packages/web`, and reconciles both surfaces onto it (review's fixed-620 becomes a resizable `split`; its `ExaminePane` content and chat's `SessionViewPanel` content are reused as destination-half contents). The destination half is filled by the resolved **composition** — the Artifact's base-primitive render, the Review diff canvas, or the Knowledge body Block (see `docs/process-layer/artifact-primitive.md` §Base primitives × the three compositions × placement) — the fold authors no renderer.

**The genuine gaps (the only net-new affordances):** the shared fold/split primitive, **drag-to-resize** the divider (persisted per surface), and **fold-forward / full-screen** (the expand toggle). The split itself, origin-preservation, fold-back/close, and every destination renderer already ship.

## Context completion at the page seam

A reference is source-agnostic and cannot know everything its destination needs. The **page** supplies the gap once, when it binds the contract: `createOpenHandler(navigate, { betId, onOpenSession })`. The page holds thread→host context (a bet-hosted thread's host *is* the bet) and owns panel placement (the session view). No component below the page owns navigation.

## What this is NOT

- Not a new router or parallel route table — it builds on React Router + `resolveHostRoute`.
- Not a per-surface viewer-opener — one contract or the experience drifts per surface (the bug AM5 exists to kill).
- Not a data-shape change — it consumes existing reference shapes; it adds no field and no on-disk format.
- Not a viewer — it routes to destinations; it never renders one.

The fold is NOT a modal/overlay/dialog (it splits in place, the origin stays live beside it), NOT a route-per-pane (the origin keeps its route/state; `full` is the same fold, not a swap), NOT a peek that vanishes on blur (it persists until folded back), and NOT a reinvented widget (extracted from the two existing splits; only resize + full are new).
