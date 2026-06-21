# AM1 — Conversation Experience: Architecture Plan

**Workpackage:** AM1 (Track AM). Complexity **L**. Depends on **None**.
**Inputs (LOCKED — not re-litigated here):** `plans/AM1/concept.md` (Part model), `plans/AM1/design/approved.md` (Conversation Surface), `plans/AM1/design/full-surface/spec.md`.
**This plan:** translates the approved design into types, contracts, file paths, the routing-hook seam, and an ordered, independently-committable task list. The green phase spans multiple builder sessions — tasks are atomic.

---

## Required reading (the builder reads ONLY these)

1. `plans/AM1/concept.md` — the Part / Embed / Fold / Session-reference primitives, the rejection list, the hard rules. Ground truth for what the nouns ARE.
2. `plans/AM1/design/approved.md` — the LOCKED visual + interaction contract (§3 ReferenceChip, §4 Composer, §5 message-type rendering, §6 OPEN/ROUTING contract, §8 architect questions).
3. `plans/AM1/design/full-surface/spec.md` — round-by-round detail (chip modes, hover states, fold style, composer anatomy).
4. `docs/human-interface-layer/part-model.md` — the ground-truth doc this WP renders within.
5. `packages/shared/src/thread.ts` — `Message`, `MessageType`, payloads, `InlineRef` (`EntityRef | BlockRef | MentionRef`), `ArtifactRef`, `verdictDecisionLabel`, `exhaustiveAssert`. **Unchanged** — AM1 renders within it.
6. `packages/web/src/components/ConversationSurface.tsx` — the approved design as a presentational story (1110 lines). The visual contract embodied. This plan factors it into the Part-model structure.
7. `packages/design-system/src/{ThreadShell,CommentRow,Composer,RichMessageCard}.tsx` — existing rendering primitives + `computeSenderGrouping` (exported, reused).
8. `packages/web/src/pages/Conversations.tsx` — the current page baseline; `renderRefEmbeds` render-prop integration point; `resolveArtifactSlot`.
9. `packages/web/src/services/host-route.js` — host→route resolver (the routing-seam precedent).
10. `packages/shared/src/blocks/types.ts` §`BlockKind` — the `unknown`-kind fallback pattern the Part dispatch mirrors.

---

## Plan reconciliation (spec ⇆ reality)

Every named symbol in the design/concept verified against this branch:

| Spec/concept assumption | Reality on this branch | Plan handles |
|---|---|---|
| `Message` union `plain \| review \| questionnaire \| verdict` | EXISTS, `packages/shared/src/thread.ts` L231-247. Unchanged. | Part dispatch keys on `message.type`. No schema change. |
| `InlineRef = EntityRef \| BlockRef \| MentionRef` | EXISTS L140. `EntityRef.kind ∈ {knowledge_item,task,artifact,bet,message}`; `BlockRef.kind="block"`; `MentionRef.kind="mention"`. | Embed target-kind set maps onto these + a synthetic `diff`/`session-reference` (see §Embed). |
| `ArtifactRef = {id, kind: ArtifactViewShape}` | EXISTS L142-145; `ReviewPayload.artifactRef`. | Review Part reads `artifactRef`; renders as `artifact` ReferenceChip. |
| `verdictDecisionLabel(decision)` | EXISTS L395, single source of truth. | `ReviewResolvedPart` uses it for the verdict echo label — no new vocabulary. |
| `computeSenderGrouping` exported | EXISTS, `ThreadShell.tsx` L126. Groups consecutive same-sender within 5-min window. | Author-grouping reuses it; NOT reimplemented. |
| Route `/knowledge/:knowledgeId` (KnowledgeDetail) | EXISTS, `pages/KnowledgeDetail.tsx`, router L… | `openKnowledgeView` hook targets it. |
| Route `/artifacts/:id` (ArtifactPermalink→ArtifactView) | `ArtifactPermalink.tsx` + `shell/ArtifactView.tsx` EXIST. | `openArtifactView` hook targets it. |
| Route `/work/bet/:betId/review/:reviewId` (ReviewPage→ReviewComposition) | EXISTS, `router.tsx` L91. | `openReviewPage` hook targets it. |
| ConversationSurface story in snapshot net | **NO** — net globs only `packages/design-system/src/*.stories.tsx` + `src/kinds/`. `packages/web/**` stories are NOT in the net (`catalog-snapshot.test.tsx` L51-54). | Promoted DS components (`ReferenceChip`, `Fold`) ENTER the net; the web-layer renderer + ConversationSurface story do NOT. Verification methods account for this (see AC table). |
| `ReferenceChip` exists in DS | **NO** — exists only as a local fn inside ConversationSurface.tsx L378. Five legacy chips already folded into it in the story. | **Task: PROMOTE to `packages/design-system`** (AC-budget: used in composer + messages + review echoes = 3+ contexts). |
| `Fold` exists in DS | **NO** — local fn ConversationSurface.tsx L322. | **Task: PROMOTE to `packages/design-system`** (concept primitive; reused conversation + AM3 session view). |
| `BlockRefEmbed` (web) | EXISTS, fetches via `useBlockResolution`. | Stays; the design's block reference is now a *title-only* `block` ReferenceChip that routes to Knowledge — the heavy resolving embed is NOT what the approved design renders. The renderer maps a `BlockRef` → `block` ReferenceChip (title only). `BlockRefEmbed` is left in place for any non-AM1 consumer; AM1 does not delete it. |

**No spec/reality contradictions that block the plan.** All routing destinations exist on this branch (AM5 dependency note in the design is conservative — the destination *views* exist; AM5 standardizes them. AM1 only wires hooks regardless.)

---

## 1. The Part-model boundary (the load-bearing contract)

The core architectural move: a **source-agnostic `Part[]` renderer**. Two adapters feed it the same `Part[]`; one renderer renders them. This is the AM1↔AM3 reuse contract.

```
Message[]            ──(adapter: derivePartsFromMessages)──┐
                                                            ├──> Part[] ──> <PartList>  (the ONE renderer)
session events[]     ──(adapter: AM3, derivePartsFromSession)┘         (renders calm column, dispatches per Part.kind)
```

**Hard boundary:** the renderer NEVER imports `Message`, `HarnessEvent`, or any source type. It imports only `Part`. The adapters own all knowledge of the source. This is what lets AM3 add a second adapter without touching the renderer (concept hard-rule 4; AC5).

### 1.1 Part discriminant (closed, derived, never stored)

A `Part` is the typed rendering unit. Part kinds are **closed** + an `unknown` fallback (mirrors `BlockKind` `unknown`, `packages/shared/src/blocks/types.ts` L89). Adding a kind is concept-gated.

```ts
// packages/shared/src/part.ts  (NEW — pure types + adapter live here; source-agnostic)

export const PART_KINDS = [
  "prose",        // a plain text body (may carry inline Embeds: mentions/entity-refs)
  "review",       // a review request — compact reference into the review experience
  "resolved",     // a verdict echo (review/questionnaire resolved)
  "questionnaire",// a quick-ask survey
  "unknown",      // fallback — unrecognised source shape (never throws; renders quietly)
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** A Part's identity derives from its source — no new opaque id minted (concept §Identity). */
export type PartId = string; // = source Message.id, or (AM3) session-event identity

interface BasePart {
  readonly id: PartId;
  readonly kind: PartKind;
  /** Sender identity for the group head. Source-agnostic (humans, agents, session actor). */
  readonly author: PartAuthor;
  readonly createdAt: string;
  /** Zero-or-more Embeds the Part hosts (concept: Part → 0..n Embeds). */
  readonly embeds: ReadonlyArray<Embed>;
  /** Optional Fold descriptor — derived, UI-local expand state is owned by the renderer. */
  readonly fold?: FoldDescriptor;
}

export interface PartAuthor {
  readonly id: string;
  readonly name: string;
  readonly isAgent: boolean;
  /** Renderer-local: "is this the viewer" — set by the web adapter, not stored. */
  readonly isMe: boolean;
}

export type Part =
  | (BasePart & { kind: "prose"; text: string; mentions: ReadonlyArray<MentionRef> })
  | (BasePart & { kind: "review"; title: string; changeSet: Embed | null; reviewTarget: ReviewTarget })
  | (BasePart & { kind: "resolved"; label: string; resolvedBy: string; summary: string; reviewTarget: ReviewTarget })
  | (BasePart & { kind: "questionnaire"; question: string; options: ReadonlyArray<QuestionOption> })
  | (BasePart & { kind: "unknown"; reason: "unrecognised-message-type" | "redacted" });

export interface QuestionOption { readonly label: string; readonly recommended: boolean; }
/** Opaque routing target the review hook resolves (betId/reviewId pair, AM5-owned). */
export interface ReviewTarget { readonly betId: string; readonly reviewId: string; }
export interface FoldDescriptor { readonly label?: string; readonly cta: string; readonly target: OpenTarget; }
```

**Why `prose`, not `plain`:** the Part vocabulary is the *render* vocabulary, deliberately decoupled from the *message-type* vocabulary (`plain`). A session event (AM3) that renders as a text body is also a `prose` Part — it is not a `plain` Message. Keeping the names distinct is what makes the renderer source-agnostic (concept hard-rule 4). The adapter maps `plain → prose`.

**`unknown` mapping:** a redacted payload → `unknown` Part with `reason:"redacted"`; an out-of-vocabulary message type (impossible today by TS exhaustiveness, but guards future drift) → `reason:"unrecognised-message-type"`. The renderer renders a quiet one-line placeholder, never throws (mirrors Block `unknown`).

### 1.2 Embed discriminant (closed target-kind set)

Closed set per concept §Closure: `artifact | block | diff | session-reference | entity-ref | mention`. Typed as a discriminated union; new kinds require a concept-doc update.

```ts
// packages/shared/src/part.ts (continued)

export const EMBED_KINDS = [
  "artifact", "block", "diff", "session-reference", "entity-ref", "mention",
] as const;
export type EmbedKind = (typeof EMBED_KINDS)[number];

export type Embed =
  | { kind: "artifact"; label: string; meta?: string; target: OpenTarget }      // → Artifact view
  | { kind: "block"; title: string; target: OpenTarget }                        // → Knowledge view (title ONLY)
  | { kind: "diff"; label: string; meta: string; target: OpenTarget }           // compact +N/−M; → Artifact view
  | { kind: "session-reference"; sessionId: string; summary?: string }          // → AM3 session dial-in (Fold-style)
  | { kind: "entity-ref"; entityKind: EntityRef["kind"]; id: string; label: string; target: OpenTarget }
  | { kind: "mention"; identityId: string; displayName: string };               // inline accent chip
```

**Embed → ReferenceChip mapping (render layer):** `artifact`/`diff` → `<ReferenceChip kind="artifact">`; `block` → `<ReferenceChip kind="block">` (title only); `entity-ref` of `knowledge_item` → `<ReferenceChip kind="knowledge">`; `image` artifacts → `<ReferenceChip kind="image">`; `mention` → inline `MentionToken` (existing CommentRow span); `session-reference` → the subtle `<Fold cta="Show session">` (NOT a chip — round-7 lock, the heavy session card is dead).

### 1.3 OpenTarget — the routing seam (no router in the renderer)

The renderer/adapters carry **descriptors**, not navigate calls. A single `OpenTarget` discriminant is resolved by the page-level `onOpen` handler (or the story's console-info hook). This is the §6 routing contract as a typed seam — mirrors `resolveHostRoute`.

```ts
// packages/shared/src/part.ts (continued)

export type OpenTarget =
  | { route: "knowledge"; knowledgeId: string; blockAnchor?: string }   // /knowledge/:knowledgeId
  | { route: "artifact"; artifactId: string }                           // /artifacts/:id
  | { route: "review"; betId: string; reviewId: string }                // /work/bet/:betId/review/:reviewId
  | { route: "session"; sessionId: string };                            // AM3 dial-in

/** The single open-hook the renderer calls. The page binds it to navigate(); the story to console.info. */
export type OpenHandler = (target: OpenTarget) => void;
```

The renderer takes ONE prop `onOpen: OpenHandler`. Every chip/fold/review-button calls `onOpen(part.…​.target)`. No callback-prop explosion (`onOpenBlock`/`onOpenArtifact`/`onOpenReview` collapse to one). The page maps `OpenTarget → navigate(path)` once; AM1 does NOT build the destination views (they exist; AM5 standardizes them).

---

## 2. Component / file map

### 2.1 NEW — shared (source-agnostic, pure)

| File | Exports | Why |
|---|---|---|
| `packages/shared/src/part.ts` | `PART_KINDS, PartKind, Part, PartAuthor, Embed, EmbedKind, OpenTarget, OpenHandler, ReviewTarget, FoldDescriptor, QuestionOption` + `derivePartsFromMessages(messages, viewerId, identities)` | The Part vocabulary + the Message→Part adapter. Pure, testable in `packages/shared`. Source-agnostic so AM3 adds `derivePartsFromSession` beside it. |
| `packages/shared/src/index.ts` | re-export `./part.js` | Barrel (the only allowed barrel). `sharedFiles`. |

`derivePartsFromMessages` is the only place that knows `Message`. Mapping: `plain→prose` (refs→embeds: block/artifact/entity → Embed; mention→mention Embed), `review→review` (artifactRef→artifact/diff Embed + reviewTarget), `questionnaire→questionnaire`, `verdict→` folded into the *resolved* Part of the message it resolves (a verdict is not its own Part — it echoes onto the resolved review/questionnaire; matches `ReviewResolvedPart`). Redacted→`unknown`.

### 2.2 NEW — web (the renderer + page wiring)

| File | Exports | Why |
|---|---|---|
| `packages/web/src/components/PartList.tsx` | `PartList({ parts, onOpen })` | **The source-agnostic renderer.** Author-groups parts (reuse grouping), exhaustively dispatches per `Part.kind`, renders the calm column. Imports `Part` ONLY — never `Message`. This is the AC5 reuse seam. |
| `packages/web/src/components/PartList.stories.tsx` | variants `Populated` | Story rendering a fixed `Part[]` (no router) so the renderer is viewable + diffable. Story-only console-info `onOpen`. |
| `packages/web/src/components/parts/{ProsePart,ReviewRequestPart,ReviewResolvedPart,QuestionnairePart,UnknownPart}.tsx` | one component per Part kind | Per-kind sub-renderers, factored out of ConversationSurface. Each renders one `Part` variant. (Keeps `PartList` a thin dispatcher.) |

> **Factoring note:** ConversationSurface.tsx already contains every per-kind render (ReviewRequestPart, ReviewResolvedPart, QuestionnairePart, MessageGroup, Fold, ReferenceChip). The task is **extraction + retyping to consume `Part`**, not green-field. The visual output must remain byte-identical to the approved story.

### 2.3 PROMOTED — design-system (enters the snapshot net)

| File | From | Budget justification |
|---|---|---|
| `packages/design-system/src/ReferenceChip.tsx` (+ `.stories.tsx`) | local fn in ConversationSurface.tsx L378 | kinds `{artifact,image,knowledge,block}`, modes `{draft,posted}`. Used in composer drafts + in-message embeds + review change-set echoes = 3+ contexts. Replaces 5 legacy divergent chips. **In budget.** |
| `packages/design-system/src/Fold.tsx` (+ `.stories.tsx`) | local fn ConversationSurface.tsx L322 | The concept's load-bearing calm device. Reused in conversation work-fold + session-reference fold + AM3 session view. **In budget (concept primitive).** |
| `packages/design-system/src/index.ts` | barrel | export both. `sharedFiles`. |

Both are **presentational, fetch-free** (DS purity rule). `ReferenceChip` takes `kind, label, meta?, mode, onOpen?, onRemove?`; `Fold` takes `label?, cta, onShow`. No tokens added.

### 2.4 REUSED (unchanged)

- `computeSenderGrouping` (`ThreadShell.tsx`) — author-grouping. `PartList` calls it adapted to `Part[]` (group by `author.id` + time window) — **or** a tiny `groupParts(parts)` mirror in `part.ts` if the `Message`-typed signature can't be reused directly. **Decision:** add `groupParts(parts: Part[])` to `part.ts` (source-agnostic; `computeSenderGrouping` is `Message`-typed and would couple the renderer to `Message`). Keep the 5-min window constant shared.
- `verdictDecisionLabel`, `exhaustiveAssert` (`thread.ts`) — resolved-Part label + exhaustive dispatch guard.
- `Avatar`/`AvatarGroup`, `Button`, `Menu`, `Composer` (DS) — the builder maps hand-rolled chrome to these where it does not risk the approved visual (header avatars, composer shell). The approved ConversationSurface hand-rolls for standalone render; production page reuses DS.
- `MentionToken` (CommentRow) — inline mention render.
- `resolveHostRoute` — precedent for the OpenTarget→path resolver shape.

### 2.5 UPGRADED page

- `packages/web/src/pages/Conversations.tsx` — replace the `ThreadShell` render path with: `derivePartsFromMessages(messages, viewerId, identities)` → `<PartList parts onOpen={navHandler} />`, where `navHandler` maps `OpenTarget → navigate(path)`. Composer upgrade per §4 (unified "+" menu, draft ReferenceChips, conditional reply quote, taller textarea, no footer). `renderRefEmbedsForConversations`/`resolveArtifactSlot` retire (the Part adapter owns ref→Embed mapping).

**`sharedFiles`:** `packages/shared/src/part.ts`, `packages/shared/src/index.ts`, `packages/design-system/src/index.ts`, `packages/web/src/pages/Conversations.tsx`.

---

## 3. Exhaustive Part dispatch

`PartList` dispatches with an exhaustive switch + `unknown` fallback, never throwing on an unrecognised kind:

```ts
function renderPart(part: Part, onOpen: OpenHandler): JSX.Element {
  switch (part.kind) {
    case "prose":         return <ProsePart part={part} onOpen={onOpen} />;
    case "review":        return <ReviewRequestPart part={part} onOpen={onOpen} />;
    case "resolved":      return <ReviewResolvedPart part={part} onOpen={onOpen} />;
    case "questionnaire": return <QuestionnairePart part={part} onOpen={onOpen} />;
    case "unknown":       return <UnknownPart part={part} />;
    default:              return assertNeverPart(part); // compile-time exhaustiveness
  }
}
```

`assertNeverPart(value: never)` mirrors `exhaustiveAssert` but returns an `<UnknownPart>` at runtime rather than throwing (a future drifted kind degrades quietly, like Block `unknown`). Adding a `PartKind` triggers exactly ONE TS narrowing failure here — concept-gated by construction.

---

## 4. Composer (unified "+" tools menu)

Per design §4 — already embodied in ConversationSurface.tsx (`InsertMenu`, `ComposerDraftBody`, `ComposerReplyBanner`, `ComposerInputRow`). Production: the builder either (a) extends DS `Composer` with these slots, or (b) keeps the page-local composer that the story embodies. **Decision:** extend DS `Composer` — the design doc names `Composer` as the single owner; a second composer violates the budget. Contract:

- ONE "+" → ONE grounded popover: `Insert block · Attach file · Mention · Reference item · Format · Emoji`. Insert-block is accent-highlighted. Opaque `--surface-overlay` + `--shadow-elevated`, anchored to "+", opens upward (inline-style background/z-index per the story's JIT lore).
- Draft attachments → `ReferenceChip(mode="draft")` in a horizontal wrapping row.
- Conditional reply banner — only when replying.
- Taller textarea (`rows=3`, `min-h-[72px]`); NO bottom footer.
- One accent Send. NO model/effort/mode pills (those are AM3).

---

## 5. Message-type rendering (per design §5)

| Message type | Part kind | Render contract |
|---|---|---|
| `plain` | `prose` | text + inline mentions + embeds (block→Knowledge chip, artifact→Artifact chip, session-ref→Fold). |
| `review` (unresolved) | `review` | compact reference: "?" marker + `REVIEW REQUESTED` caps + proposal line + change-set `artifact` ReferenceChip + single **Open review** button. **NO inline decision, NO inline code/diff.** |
| `review`/`questionnaire` (resolved) | `resolved` | `ReviewResolvedPart`: "✓ **Approved** by … · …" via `verdictDecisionLabel` + quiet **View review**. No buttons. |
| `questionnaire` (unresolved) | `questionnaire` | "?" marker + question + neutral hover-button options + neutral "Recommended" tag. Prominence from layering, never accent border or biased answer. |
| `verdict` | — | NOT its own Part. Folded onto the `resolved` Part of the message it resolves (`resolvesMessageId`). |
| redacted | `unknown` | quiet placeholder. |

Session activity NEVER becomes a Part (concept hard-rule 3) — it appears only as a `session-reference` Embed rendered as a subtle Fold.

---

## 6. Routing-hook interface

The §6 contract realised as the `OpenTarget`/`OpenHandler` seam (§1.3). Single hook `onOpen: OpenHandler` on `PartList`.

**route-checklist** (the reviewer greps the impl against this — every hook must resolve to its route):

| OpenTarget.route | Resolves to path | Source affordance |
|---|---|---|
| `knowledge` | `/knowledge/:knowledgeId` (+ block anchor) | `block` chip; work-fold; knowledge-source chips |
| `artifact` | `/artifacts/:id` | `artifact`/`diff`/image chip; composer-draft code chip |
| `review` | `/work/bet/:betId/review/:reviewId` | Open review / View review |
| `session` | AM3 session dial-in (no route yet) | session-reference Fold ("Show session") |

- **Page binding (`Conversations.tsx`):** `navHandler(target)` switches on `target.route` → `navigate(path)`. The `session` route is a no-op-with-toast until AM3 lands (documented; not a blocker — the Fold still renders).
- **Story binding (`PartList.stories.tsx`, `ConversationSurface.stories.tsx`):** `onOpen = (t) => console.info("[AM1] open", t.route, t)`. No router, nothing mounts inline.

AM1 builds NO destination view. The conversation owns no viewing surface (design §6 LOCKED).

---

## 7. Acceptance criteria + verification methods

| # | AC (from TRACK-AM) | Verification method |
|---|---|---|
| AC1 | Reader follows a calm threaded conversation of deliberate messages (people + agents), easy to scan | **Component test** `PartList.test.tsx`: render `derivePartsFromMessages(fixture)` with 2 humans + 1 agent; assert author-group heads (name+time) present, consecutive same-author grouped (one head), agent group marked by agent cue. |
| AC2 | A deliberate message can embed what it refers to (≥ referenced block/artifact + a session link) inline | **Unit test** `part.test.ts`: `derivePartsFromMessages` over a message with a `BlockRef` + `ArtifactRef` + session ref → Part carries `block`+`artifact`+`session-reference` Embeds. **Component test:** `PartList` renders the block/artifact as `ReferenceChip`, the session as a `Fold` (not a chip). |
| AC3 | Honors the Thread model — host attachment, participants, all message types render in the new style | **Component test:** render a `Part[]` derived from one message of EACH type (`plain/review/questionnaire/verdict`) → assert each Part kind renders its contract (prose/review/questionnaire/resolved) and verdict echoes onto resolved. **Type check:** `derivePartsFromMessages` exhaustive over `MessageType` (compile fails if a type is unmapped). |
| AC4 | Session work-activity NOT first-class content; session is a reference, not an inlined work-log | **Unit test** `part.test.ts`: a session reference → an `Embed{kind:"session-reference"}` ONLY; assert NO `Part` is produced from session activity, and `PART_KINDS` has no session/work-log/event kind. **Lint/type:** `PartKind` is the closed list — a `session`/`event` kind cannot exist. **Component test:** session renders as a `Fold`, asserts no work-log DOM (tool-call rows) in the conversation. |
| AC5 | Rendering structure factored so another surface (AM3) reuses it without reimplementing | **Type/import test** `PartList.dependency.test.ts`: assert (via static import-graph check or a type-level test) that `PartList.tsx` does NOT import `Message`/`thread.js`/`harness`. **Unit test:** `derivePartsFromMessages` and a stub `derivePartsFromSession` both produce `Part[]` accepted by `<PartList>` — proves a second adapter needs zero renderer change. (This is the AM1↔AM3 contract made executable.) |
| AC6 | `ReferenceChip` is the single shared attachment/reference primitive | **DOM-snapshot net** (it enters the net once in DS): `ReferenceChip.stories.tsx` variants {artifact,image,knowledge,block}×{draft,posted} snapshot. **Component test:** draft mode = 2 hit targets (open body + remove ✕); posted = whole-chip open, no ✕. |
| AC7 | Exhaustive Part dispatch + `unknown` fallback | **Component test:** a Part with `kind:"unknown"` renders the quiet placeholder (no throw). **Type:** the `default: assertNeverPart(part)` branch type-checks only while the switch is exhaustive. |
| AC8 | Routing hooks wired to the §6 routes (not building views) | **Component test** `PartList.test.tsx`: spy `onOpen`; click block chip → `onOpen({route:"knowledge",…})`; artifact chip → `{route:"artifact"}`; Open review → `{route:"review"}`; session Fold → `{route:"session"}`. Assert NO destination view mounts. **Page test** (light): `Conversations.tsx` `navHandler` maps each route to the expected path string. |

**protectedTests:** none yet (no existing AM1 tests). The reviewer should treat `packages/shared/src/__tests__/thread*.test.ts` and `promotedRichMessageId.test.ts` as protected — AM1 must not change Thread/Message/verdict behavior. List for DoD audit: `packages/web/src/__tests__/promotedRichMessageId.test.ts`, `packages/shared/src/__tests__/thread-events.test.ts`.

---

## 8. Security & abuse cases

AM1 is a **render-only** reshape — no new POST/PATCH, no new endpoint, no new credential, no path/URL input, no agent-authored field newly trusted.

| Class | Applicability |
|---|---|
| Rate-limit on POST/PATCH | **N/A** — AM1 adds no mutation route. Composer Send reuses the existing message POST (unchanged). |
| Input-trust boundary (agent-authored fields) | **Applicable + addressed by reuse.** Agent message text/refs already flow through the existing `CommentRow`/`renderPayload` sanitization path (`sanitizeHtml`, `MentionToken` segmentation). The Part adapter passes text through unchanged; the renderer must keep using the existing sanitizer for any HTML payload — it must NOT introduce a raw-HTML render path. Verified by: `ProsePart` renders through the existing payload pipeline (no `dangerouslySetInnerHTML` introduced). |
| Embed label/meta injection | **Applicable + addressed.** `ReferenceChip` renders `label`/`meta` as text content (React-escaped), never as HTML. The block chip shows title only (never code), per §6. |
| Secret-handling / path-traversal / SSRF | **N/A** — no credential, file path, or outbound URL input in AM1. `OpenTarget` ids are opaque strings consumed only by `navigate()` (client-side route, no fetch from user-controlled URL). |

---

## 9. Design-it-twice (the one non-trivial decision)

**Decision: where does the source→Part adapter live, and what is the renderer's input boundary?** (4+ surfaces will consume the Part model: conversation, AM3 session view, potentially review echoes.)

**Option A — `Part` types + adapter in `packages/shared`; renderer in `packages/web`.** (chosen)
Shape: `part.ts` (shared) owns `Part`, `Embed`, `OpenTarget`, `derivePartsFromMessages`, `groupParts`. `PartList` (web) imports only `Part`. AM3 adds `derivePartsFromSession` in shared.
Trade-off: the pure adapter is unit-testable in shared (fast, no jsdom); the renderer is a thin web component. Cons: the `Part` types live one package away from the renderer.
Reject reason for the alternative: —

**Option B — everything in `packages/web` (Part types + adapter + renderer co-located).**
Shape: a single `packages/web/src/conversation/` folder owns types, adapter, renderer.
Trade-off: co-location reads nicely. Cons: AM3's session adapter would import the source-agnostic `Part` from a web *component* file, coupling AM3 to web; the adapter could not be unit-tested without jsdom; the source-agnostic boundary is weaker (easy to accidentally import `Message` into the renderer when they share a folder).
**Rejected:** weakens the AM1↔AM3 reuse contract (AC5) — the whole point. Shared placement makes "renderer imports no source type" enforceable and gives AM3 a clean import target.

**Synthesis (taken):** A. Pure `Part`/adapter in shared; renderer in web importing only `Part`; the `OpenTarget` seam keeps routing out of both. AC5 becomes a real import-graph assertion.

---

## 10. Ordered task list (atomic, independently committable)

Each task ends at a committable boundary. L WP — expect 2-3 builder sessions.

1. **`part.ts` types (red).** Add `packages/shared/src/part.ts` with `PART_KINDS`, `Part`, `Embed`, `EmbedKind`, `OpenTarget`, `OpenHandler`, `PartAuthor`, support types. Export from `index.ts`. Write `part.test.ts` (red) asserting the discriminant + closure (`PART_KINDS` has no session/work-log kind — AC4). Commit: `feat(AM1): Part/Embed/OpenTarget type vocabulary`.
2. **`derivePartsFromMessages` (green).** Implement the Message→Part adapter + `groupParts`. Make `part.test.ts` green: each `MessageType` maps (AC3), refs→Embeds (AC2), verdict→resolved fold, redacted→unknown, no Part from session activity (AC4). Commit: `feat(AM1): Message→Part adapter`.
3. **Promote `ReferenceChip` to DS.** Move the local fn to `packages/design-system/src/ReferenceChip.tsx` + `.stories.tsx` (kinds×modes variants). Export. Bless the snapshot net for the NEW story (additive — read the diff). Component test for draft/posted hit-targets (AC6). Commit: `feat(AM1): promote ReferenceChip to design-system`.
4. **Promote `Fold` to DS.** Move to `packages/design-system/src/Fold.tsx` + `.stories.tsx`. Export. Bless new snapshot. Commit: `feat(AM1): promote Fold to design-system`.
5. **Per-kind Part renderers.** Extract `parts/{ProsePart,ReviewRequestPart,ReviewResolvedPart,QuestionnairePart,UnknownPart}.tsx` from ConversationSurface, retyped to consume a `Part`, using promoted `ReferenceChip`/`Fold`. Visual output unchanged. Commit: `feat(AM1): per-kind Part renderers`.
6. **`PartList` renderer + dispatch (green).** Add `PartList.tsx` (author-group via `groupParts`, exhaustive `renderPart` + `assertNeverPart`→`UnknownPart`), `PartList.stories.tsx`. Tests: AC1 (grouping), AC7 (unknown fallback), AC8 (onOpen targets via spy), AC5 (`PartList` imports no `Message`/`harness`). Commit: `feat(AM1): source-agnostic PartList renderer`.
7. **Composer upgrade.** Extend DS `Composer` with unified "+" menu, draft `ReferenceChip` row, conditional reply banner, taller textarea, no footer (design §4). Story variant. Commit: `feat(AM1): unified composer tools menu`.
8. **Wire `Conversations.tsx`.** Replace ThreadShell render path with `derivePartsFromMessages` → `<PartList onOpen={navHandler}>`; bind `navHandler` to `navigate()` per route-checklist; retire `renderRefEmbedsForConversations`/`resolveArtifactSlot`. Page test: navHandler route→path map (AC8). Commit: `feat(AM1): render Conversations through the Part model`.
9. **AM3-reuse proof.** Add a stub `derivePartsFromSession` (or a test-only fixture) producing `Part[]`; assert `<PartList>` renders it with zero renderer change (AC5 executable proof). Commit: `test(AM1): prove Part renderer is source-agnostic`.
10. **Retire `ConversationSurface` story (or keep as the visual reference).** Reconcile: ConversationSurface stays as the approved visual reference story OR is refactored to compose `PartList`. **Decision: refactor ConversationSurface to render `<PartList>` over a fixed `Part[]`** so the approved design and the production renderer cannot drift. Commit: `refactor(AM1): ConversationSurface composes PartList`.

Tasks 1-2 (shared) and 3-4 (DS promotions) are parallel-safe. 5-6 depend on 1-4. 7 is independent. 8 depends on 6. 9-10 depend on 6.

---

## 11. Risks / open decisions for reviewer + builder

- **R1 — `computeSenderGrouping` is `Message`-typed.** Reusing it directly would couple `PartList` to `Message`, breaking AC5. **Decision taken:** add a source-agnostic `groupParts(parts)` in `part.ts` (same 5-min window, shared constant). Reviewer: confirm the duplication is acceptable vs the coupling it avoids (it is — coupling kills the WP's reason to exist).
- **R2 — Snapshot-net coverage gap.** `PartList`/`ConversationSurface` live in `packages/web` and are NOT in the DOM-snapshot net (only DS root globs). Only promoted `ReferenceChip`/`Fold` enter the net. The renderer is covered by **component tests** (RTL in `packages/web/src/__tests__/`) + the `:8098` viewer, not the snapshot. This is consistent with the net's documented scope — flag for the reviewer so it isn't mistaken for a missing gate.
- **R3 — `session` route has no destination yet (AM3).** The `session` `OpenTarget` resolves to a documented no-op/toast until AM3. NOT a blocker — the Fold renders and the hook fires. Builder: do not stub a fake session view.
- **R4 — Composer: extend DS `Composer` vs page-local.** Plan chose extend-DS (budget). If the DS `Composer`'s current API can't host the unified menu without a broad rewrite, the builder may keep the page-local composer the story embodies, but must document the budget exception. Reviewer to confirm.
- **R5 — `BlockRefEmbed` (the fetching embed) is now unused by AM1.** The approved design renders block references as title-only chips routing to Knowledge, not the resolving `BlockRefEmbed`. AM1 leaves `BlockRefEmbed` in place (other consumers may exist) but does not wire it. Knip may flag it if it becomes orphaned — builder checks `npm run lint`/knip and removes only if truly unused.
- **No BLOCKERs.** All routing destinations exist on this branch; the concept + design are locked; the Thread primitive is untouched.

---

## Self-critique (in-session, the `/architecture` mandate)

- **Over-engineering check:** Is the shared `Part`/adapter split justified, or gold-plating? — Justified: AC5 (AM3 reuse with no duplicated renderer) is an explicit acceptance criterion and the WP's stated reason to exist. The split is the minimum that makes it *enforceable* (import-graph assertion). Without it, "factored for reuse" is unverifiable prose. Keep.
- **Scope creep check:** Did I add anything beyond the design? — No new endpoints, no schema, no destination views, no AM2/AM3/AL4 work. `OpenTarget` collapses 3 callback props into 1 (simplification, not creep). Composer reuses DS. Verdict: in scope.
- **Missing failure modes:** unknown Part kind (covered — `unknown` fallback, no throw); redacted payload (covered — `unknown`); session route absent (covered — R3 no-op); HTML injection via agent text (covered — §8, reuse existing sanitizer, no new raw-HTML path); chip label injection (covered — React-escaped text). 
- **Did I respect the snapshot-net reality?** Yes — flagged R2 honestly; verification for the web renderer is component tests + viewer, not the net (the net does not glob web). I did not invent a snapshot gate that doesn't exist.
- **Naming:** `Part`/`Embed`/`Fold`/`OpenTarget` — all concept-locked or literal (no `Manager`/`Service`/`Helper`). `derivePartsFromMessages`/`groupParts` describe the act. `prose` deliberately ≠ `plain` to keep the render vocabulary source-agnostic (rationale stated). 
- **Biggest residual risk:** R4 (DS Composer extensibility) — a build-time discovery, not a plan-time unknown; the fallback is documented.

Verdict: plan is minimal, the boundary is enforceable, no layer reaches past its neighbor (Human Interface only; no Meta/Runtime touch), no Thread/Message/verdict change, no token change.
