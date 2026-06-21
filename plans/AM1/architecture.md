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
9. `packages/web/src/services/host-route.ts` — host→route resolver (the routing-seam precedent).
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
| `BlockRefEmbed` (web) | EXISTS, fetches via `useBlockResolution`. | Stays; the design's block reference is now a *title-only* `block` ReferenceChip that routes to the block's **host surface** via the existing `resolveHostRoute` (C1 — total over `BlockHostKind`, not knowledge-only) — the heavy resolving embed is NOT what the approved design renders. The renderer maps a `BlockRef` → `block` ReferenceChip (title only, `host` target). `BlockRefEmbed` is left in place for any non-AM1 consumer; AM1 does not delete it. |
| `resolveHostRoute(hostKind, hostId)` total over `HostKind` | EXISTS, `packages/web/src/services/host-route.ts` — `bet/task/knowledge_item/artifact/agent`→route, `user/factory`→null. `HostKind ⊇ BlockHostKind`. | **C1:** the page's `navHandler` resolves a `{route:"host"}` OpenTarget through this existing resolver — no new route table. Makes `BlockRef → OpenTarget` provably total. |

**No spec/reality contradictions that block the plan.** All routing destinations exist on this branch (AM5 dependency note in the design is conservative — the destination *views* exist; AM5 standardizes them. AM1 only wires hooks regardless.)

---

## 1. The Part-model boundary (the load-bearing contract)

The core architectural move: a **source-agnostic `Part[]` renderer**. Two adapters feed it the same `Part[]`; one renderer renders them. This is the AM1↔AM3 reuse contract.

```
Message[]            ──(adapter: derivePartsFromMessages)──┐
                                                            ├──> Part[] ──> <PartList>  (the ONE renderer)
session events[]     ──(adapter: AM3, derivePartsFromSession)┘         (renders calm column, dispatches per Part.kind)
```

**Hard boundary:** the renderer NEVER imports `Message`, `HarnessEvent`, or any source type. It imports only `Part`. The adapters own all knowledge of the source. This is what lets AM3 add a second adapter without touching the renderer (concept hard-rule 4; AC5). **The boundary is enforced as a build-time `no-restricted-imports` ESLint rule** scoped to `PartList.tsx` + `parts/**` (W1) — a static import-graph property is a lint rule, never a test. The adapter (`derivePartsFromMessages` in `packages/shared/src/part.ts`) is the ONLY place permitted to import `Message`/`InlineRef`.

### 1.1 Part discriminant (closed, derived, never stored)

A `Part` is the typed rendering unit. Part kinds are **closed** + an `unknown` fallback (mirrors `BlockKind` `unknown`, `packages/shared/src/blocks/types.ts` L89). Adding a kind is concept-gated.

```ts
// packages/shared/src/part.ts  (NEW — pure types + adapter live here; source-agnostic)
// Imports ONLY closed type vocabulary, never row types:
//   import type { BlockHostKind } from "./blocks/types.js";  // for OpenTarget {route:"host"}
// (the adapter additionally imports Message/InlineRef inside derivePartsFromMessages — see §2.1)

export const PART_KINDS = [
  "prose",        // a plain text body (may carry inline mention/entity-ref Embeds)
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
  | (BasePart & { kind: "prose"; text: string })
  | (BasePart & { kind: "review"; title: string; changeSet: Embed | null; reviewTarget: ReviewTarget })
  | (BasePart & { kind: "resolved"; label: string; resolvedBy: string; summary: string; reviewTarget: ReviewTarget })
  | (BasePart & { kind: "questionnaire"; question: string; options: ReadonlyArray<string> })
  | (BasePart & { kind: "unknown"; reason: "wire-unrecognised-type" | "redacted" });

/** Opaque routing target the review hook resolves (betId/reviewId pair, AM5-owned). */
export interface ReviewTarget { readonly betId: string; readonly reviewId: string; }
export interface FoldDescriptor { readonly label?: string; readonly cta: string; readonly target: OpenTarget; }
```

**W3 — mentions are `mention` Embeds, never a separate field.** A `prose` Part carries mentions **only** as `mention`-kind Embeds in `BasePart.embeds` (the closed Embed set, concept §Closure) — the previously-dual `mentions: MentionRef[]` field is removed. This (a) eliminates the drift risk of two representations, and (b) stops the source type `MentionRef` (`thread.ts`) from leaking into the source-agnostic Part shape — the `mention` Embed already abstracts it to `{identityId, displayName}`. The adapter maps each `MentionRef` in a `PlainPayload`'s refs to one `mention` Embed; the renderer reads `embeds` for inline mention rendering (segmenting prose `text` against the mention Embeds, as `CommentRow`/`segmentMentions` already do).

**W2 — questionnaire options are plain strings; no `recommended` flag.** `QuestionnairePayload.options` is `ReadonlyArray<string>` (`thread.ts` L204) — flat strings, no per-option metadata. The previous `QuestionOption = {label, recommended}` promised source data that does not exist; the adapter could only ever set `recommended:false`. Per concept hard-rule 5 (Thread/Message schema unchanged) a `recommended` source field cannot be added in AM1. **Resolution: `Part.questionnaire.options` is `ReadonlyArray<string>` and the `QuestionOption` type is dropped.** The design §5 "Recommended" tag therefore has **no data source in AM1 and is not rendered** — it becomes data-driven-when-available (a future Thread-schema enhancement, out of AM1 scope). Options render as neutral hover-buttons (design §5); no biased/recommended styling. Stated explicitly, not silently dead.

**Why `prose`, not `plain`:** the Part vocabulary is the *render* vocabulary, deliberately decoupled from the *message-type* vocabulary (`plain`). A session event (AM3) that renders as a text body is also a `prose` Part — it is not a `plain` Message. Keeping the names distinct is what makes the renderer source-agnostic (concept hard-rule 4). The adapter maps `plain → prose`.

**`unknown` mapping (N3 — concrete drift source):** a redacted payload → `unknown` Part with `reason:"redacted"`. The second reason `"wire-unrecognised-type"` is **not** dead defensive code: `MessageType` is closed in TS, but `Message` rows arrive **over the wire** (server JSON via the existing message fetch) and are deserialized at the boundary — a future server-side message type shipped ahead of the web client (forward-compat / staged rollout) would deserialize to a `type` outside the current `MESSAGE_TYPES`. The adapter maps any such row to `unknown` with `reason:"wire-unrecognised-type"` rather than throwing. The renderer renders a quiet one-line placeholder (mirrors Block `unknown`). This is the only branch the TS exhaustiveness check cannot prove unreachable because the input crosses a deserialization boundary.

### 1.2 Embed discriminant (closed target-kind set)

Closed set per concept §Closure: `artifact | block | diff | session-reference | entity-ref | mention | unknown`. Typed as a discriminated union; new kinds require a concept-doc update. (`unknown` is the quiet non-navigating fallback — W5: a `message` entity-ref with no permalink route.)

```ts
// packages/shared/src/part.ts (continued)

export const EMBED_KINDS = [
  "artifact", "block", "diff", "session-reference", "entity-ref", "mention", "unknown",
] as const;
export type EmbedKind = (typeof EMBED_KINDS)[number];

export type Embed =
  | { kind: "artifact"; label: string; meta?: string; target: OpenTarget }      // → Artifact view
  | { kind: "block"; title: string; target: OpenTarget }                        // → host surface (title ONLY); target is {route:"host",…}
  | { kind: "diff"; label: string; meta: string; target: OpenTarget }           // compact +N/−M; → Artifact view
  | { kind: "session-reference"; sessionId: string; summary?: string }          // → AM3 session dial-in (Fold-style)
  | { kind: "entity-ref"; entityKind: Exclude<EntityRef["kind"], "message">; id: string; label: string; target: OpenTarget }
  | { kind: "mention"; identityId: string; displayName: string }                // inline accent chip
  | { kind: "unknown"; label: string };                                         // non-navigating ref (W5: message entity-ref — no permalink route, no target)
```

The `block` Embed's `target` is always `{ route: "host", hostKind, hostId }` (C1) — derived from the `BlockRef` triple; the chip renders the block **title only** (design §6) and opens its host surface. The `entity-ref` Embed's `target` is `{route:"host"}` for host-navigable kinds (`bet`/`task`/`knowledge_item`) and `{route:"artifact"}` for `artifact` refs (the adapter picks per `EntityRef.kind`).

**W5 — `entity-ref → OpenTarget` is TOTAL over all five `EntityRef.kind` members.** `EntityRef.kind ∈ {knowledge_item, task, artifact, bet, message}` (`thread.ts` L112). Four kinds map cleanly: `artifact → {route:"artifact"}`; `knowledge_item`/`task`/`bet → {route:"host", hostKind, hostId}` (each `EntityRef.kind` is a valid `BlockHostKind`). **`message` does NOT** — `BlockHostKind` excludes `"message"`, so it cannot use a `host` target, and **no message-permalink route exists** (verified: `router.tsx` has no `message/:id` path; `host-route.ts` has no `message` case). **Rule: `EntityRef.kind === "message"` → the `unknown` Embed.** It collapses to `{ kind: "unknown" }` (label-only, no `target`, no `onOpen`) — the same quiet-degradation pattern as a `wire-unrecognised` Part, chosen over a new `onOpen`-less `entity-ref` variant because it adds no Embed shape and reuses the existing fallback render path. The adapter dispatch over `EntityRef.kind` is therefore exhaustive across all five members (TS `exhaustiveAssert` on the `entity-ref` branch). This requires adding `"unknown"` to `EMBED_KINDS` + an `{ kind: "unknown"; label: string }` Embed variant (render: a non-navigating inline label, no chip affordance).

**Embed → ReferenceChip mapping (render layer):** `artifact`/`diff` → `<ReferenceChip kind="artifact">`; `block` → `<ReferenceChip kind="block">` (title only; opens its host surface via the `host` target); `entity-ref` of `knowledge_item` → `<ReferenceChip kind="knowledge">`; `image` artifacts → `<ReferenceChip kind="image">`; `mention` → inline `MentionToken` (existing CommentRow span); `session-reference` → the subtle `<Fold cta="Show session">` (NOT a chip — round-7 lock, the heavy session card is dead); `unknown` → a non-navigating inline label (no chip affordance, no `onOpen` — W5: a `message` entity-ref with no permalink route).

### 1.3 OpenTarget — the routing seam (no router in the renderer)

The renderer/adapters carry **descriptors**, not navigate calls. A single `OpenTarget` discriminant is resolved by the page-level `onOpen` handler (or the story's console-info hook). This is the §6 routing contract as a typed seam — mirrors `resolveHostRoute`.

```ts
// packages/shared/src/part.ts (continued)

export type OpenTarget =
  | { route: "host"; hostKind: BlockHostKind; hostId: string }          // a block/entity routed to its HOST surface (total over BlockHostKind)
  | { route: "artifact"; artifactId: string }                           // /artifacts/:id
  | { route: "review"; betId: string; reviewId: string }                // /work/bet/:betId/review/:reviewId
  | { route: "session"; sessionId: string };                            // AM3 dial-in

/** The single open-hook the renderer calls. The page binds it to navigate(); the story to console.info. */
export type OpenHandler = (target: OpenTarget) => void;
```

The renderer takes ONE prop `onOpen: OpenHandler`. Every chip/fold/review-button calls `onOpen(part.…​.target)`. No callback-prop explosion (`onOpenBlock`/`onOpenArtifact`/`onOpenReview` collapse to one). The page maps `OpenTarget → navigate(path)` once; AM1 does NOT build the destination views (they exist; AM5 standardizes them).

**C1 — `BlockRef → OpenTarget` is TOTAL over all of `BlockHostKind` (the load-bearing rule).** A `BlockRef` is `{ blockId, hostKind, hostId }` with `hostKind ∈ {bet, task, knowledge_item, artifact, agent, user}` (`blocks/types.ts` L20-27). **Only `knowledge_item` yields a `knowledgeId`** — so a single `{route:"knowledge"}` target is NOT total. The fix: a block (and any `entity-ref`) routes to its **host surface** via the `host` `OpenTarget`, which the page resolves through the **existing** `resolveHostRoute(hostKind, hostId)` (`packages/web/src/services/host-route.ts`) — already total over `HostKind` (a superset of `BlockHostKind`): `bet → /work/bet/:id`, `task → /work/task/:id`, `knowledge_item → /knowledge/:id`, `artifact → /work/artifact/:id`, `agent → /work/agent/:id`, `user → null`. The design §6 "block → Knowledge view" case is the `knowledge_item` branch of this total rule (the common case); the other five host kinds resolve to their own host surface, and `user` (no navigable host) is a documented no-op (matching `resolveHostRoute`'s existing `null` return).

The adapter therefore maps **every** `BlockRef` to `{ route: "host", hostKind: ref.hostKind, hostId: ref.hostId }` — no host kind is unhandled, no `knowledgeId` is fabricated, and the page reuses the one existing resolver rather than re-deriving routes. This collapses the previous `knowledge`-only target (which silently dropped 5 of 6 host kinds) into a provably exhaustive seam.

> **Block-anchoring deferred to AM5 (W4).** The previous `blockAnchor?` field on the knowledge target is **dropped**. `KnowledgeDetail.tsx` consumes only the `knowledgeId` route param (L268) and has **no** anchor/hash param consumption (it scrolls to `data-block-id` only from in-page actions, L697). A `blockAnchor` would therefore be decorative — the destination ignores it. Per design §6 ("anchored to the block") the anchor intent is real but **unmet by current destinations**; standardizing block-anchored navigation belongs to AM5 (the standardized artifact-view & open/routing contract), which the design already names as the owner of routing standardization. AM1 routes to the host surface; AM5 adds the anchor. Stated, not silently dropped.

---

## 2. Component / file map

### 2.1 NEW — shared (source-agnostic, pure)

| File | Exports | Why |
|---|---|---|
| `packages/shared/src/part.ts` | `PART_KINDS, PartKind, Part, PartAuthor, Embed, EmbedKind, OpenTarget, OpenHandler, ReviewTarget, FoldDescriptor` + `derivePartsFromMessages(messages, viewerId, identities)` + `groupParts(parts)` | The Part vocabulary + the Message→Part adapter. Pure, testable in `packages/shared`. Source-agnostic so AM3 adds `derivePartsFromSession` beside it. Imports `BlockHostKind` (closed type) for the `host` OpenTarget; the adapter body imports `Message`/`InlineRef` — the renderer never does (W1 lint). |
| `packages/shared/src/index.ts` | re-export `./part.js` | Barrel (the only allowed barrel). `sharedFiles`. |

`derivePartsFromMessages` is the only place that knows `Message`. Mapping: `plain→prose` (each `InlineRef` in `payload.refs` → one Embed: `BlockRef`→`block` Embed with `target:{route:"host",hostKind,hostId}` (C1); `EntityRef` of `artifact`→`artifact`/`diff` Embed; `EntityRef` of `knowledge_item`/`bet`/`task`→`entity-ref` Embed with `host` target; **`EntityRef` of `message`→`unknown` Embed** (W5 — no permalink route exists, no `target`; the dispatch over `EntityRef.kind` is exhaustive across all 5 members via `exhaustiveAssert`); `MentionRef`→`mention` Embed (the prose Part has NO separate `mentions` field — W3)), `review→review` (artifactRef→artifact/diff Embed + reviewTarget), `questionnaire→questionnaire` (options pass through as `ReadonlyArray<string>` — W2, no `recommended`), `verdict→` folded into the *resolved* Part of the message it resolves (a verdict is not its own Part — it echoes onto the resolved review/questionnaire via `resolvesMessageId`; matches `ReviewResolvedPart`). Redacted→`unknown` (`reason:"redacted"`); a wire-unrecognised `type`→`unknown` (`reason:"wire-unrecognised-type"`).

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
| `plain` | `prose` | text + inline mention Embeds + ref Embeds (block→host-surface chip (C1), artifact→Artifact chip, session-ref→Fold). Mentions are `mention` Embeds, no separate field (W3). |
| `review` (unresolved) | `review` | compact reference: "?" marker + `REVIEW REQUESTED` caps + proposal line + change-set `artifact` ReferenceChip + single **Open review** button. **NO inline decision, NO inline code/diff.** |
| `review`/`questionnaire` (resolved) | `resolved` | `ReviewResolvedPart`: "✓ **Approved** by … · …" via `verdictDecisionLabel` + quiet **View review**. No buttons. |
| `questionnaire` (unresolved) | `questionnaire` | "?" marker + question + neutral hover-button options (`ReadonlyArray<string>`). **No "Recommended" tag in AM1** — the source `QuestionnairePayload.options` is flat strings with no per-option metadata (W2); the tag becomes data-driven when a future Thread-schema enhancement adds it. Prominence from layering, never accent border or biased answer. |
| `verdict` | — | NOT its own Part. Folded onto the `resolved` Part of the message it resolves (`resolvesMessageId`). |
| redacted | `unknown` | quiet placeholder. |

Session activity NEVER becomes a Part (concept hard-rule 3) — it appears only as a `session-reference` Embed rendered as a subtle Fold.

---

## 6. Routing-hook interface

The §6 contract realised as the `OpenTarget`/`OpenHandler` seam (§1.3). Single hook `onOpen: OpenHandler` on `PartList`.

**route-checklist** (the reviewer greps the impl against this — every hook must resolve to its route):

| OpenTarget.route | Resolves to path | Source affordance |
|---|---|---|
| `host` | `resolveHostRoute(hostKind, hostId)` — total over `BlockHostKind`: `knowledge_item`→`/knowledge/:id`, `bet`→`/work/bet/:id`, `task`→`/work/task/:id`, `artifact`→`/work/artifact/:id`, `agent`→`/work/agent/:id`, `user`→`null` (no-op) | `block` chip; work-fold; knowledge-source chips; non-artifact `entity-ref` chips |
| `artifact` | `/artifacts/:id` | `artifact`/`diff`/image chip; composer-draft code chip |
| `review` | `/work/bet/:betId/review/:reviewId` | Open review / View review |
| `session` | AM3 session dial-in (no route yet) | session-reference Fold ("Show session") |

- **C1 — `host` is total.** The design §6 "block → Knowledge view" is the `knowledge_item` branch (common case); the other five host kinds resolve to their own host surface through the **existing** `resolveHostRoute`. No `BlockHostKind` is unhandled. **Block-anchoring is deferred to AM5** (the "+ block anchor" the design promises is unmet by `KnowledgeDetail`, which consumes no anchor param — see §1.3 W4 note); AM1 routes to the host, AM5 adds the anchor.
- **Page binding (`Conversations.tsx`):** `navHandler(target)` switches on `target.route`; for `host` it calls `resolveHostRoute(hostKind, hostId)` and `navigate(path)` (or no-ops when the resolver returns `null`, e.g. `user`). The `session` route is a no-op-with-toast until AM3 lands (documented; not a blocker — the Fold still renders).
- **Story binding (`PartList.stories.tsx`, `ConversationSurface.stories.tsx`):** `onOpen = (t) => console.info("[AM1] open", t.route, t)`. No router, nothing mounts inline.

AM1 builds NO destination view. The conversation owns no viewing surface (design §6 LOCKED).

---

## 7. Acceptance criteria + verification methods

| # | AC (from TRACK-AM) | Verification method |
|---|---|---|
| AC1 | Reader follows a calm threaded conversation of deliberate messages (people + agents), easy to scan | **Component test** `PartList.test.tsx`: render `derivePartsFromMessages(fixture)` with 2 humans + 1 agent; assert author-group heads (name+time) present, consecutive same-author grouped (one head), agent group marked by agent cue. |
| AC2 | A deliberate message can embed what it refers to (≥ referenced block/artifact + a session link) inline | **Unit test** `part.test.ts`: `derivePartsFromMessages` over a message with a `BlockRef` (knowledge-hosted) + a `BlockRef` (bet-hosted, C1) + `ArtifactRef` + session ref → Part carries two `block` Embeds (each with a `{route:"host"}` target keyed to its `hostKind`) + `artifact` + `session-reference` Embeds. **Component test:** `PartList` renders the blocks/artifact as `ReferenceChip`, the session as a `Fold` (not a chip). |
| AC3 | Honors the Thread model — host attachment, participants, all message types render in the new style | **Component test:** render a `Part[]` derived from one message of EACH type (`plain/review/questionnaire/verdict`) → assert each Part kind renders its contract (prose/review/questionnaire/resolved) and verdict echoes onto resolved. **Type check:** `derivePartsFromMessages` exhaustive over `MessageType` (compile fails if a type is unmapped). |
| AC4 | Session work-activity NOT first-class content; session is a reference, not an inlined work-log | **Unit test** `part.test.ts`: a session reference → an `Embed{kind:"session-reference"}` ONLY; assert NO `Part` is produced from session activity, and `PART_KINDS` has no session/work-log/event kind. **Lint/type:** `PartKind` is the closed list — a `session`/`event` kind cannot exist. **Component test:** session renders as a `Fold`, asserts no work-log DOM (tool-call rows) in the conversation. |
| AC5 | Rendering structure factored so another surface (AM3) reuses it without reimplementing | **(static property) ESLint `no-restricted-imports` rule** (W1): a new config block in `eslint.config.ts` scoped `files: ["packages/web/src/components/PartList.tsx", "packages/web/src/components/parts/**/*.tsx"]` bans importing `@hyperidle/shared/.../thread*`, the source `Message`/`InlineRef` symbols, and any `harness` path — so the renderer provably imports the source-agnostic `Part` ONLY. This is the durable build-time enforcement (CLAUDE.md: static import-absence → lint rule, never a test; a vitest `readFileSync`-grep is a lint rule in disguise, and a type-level test cannot assert import *absence*). The existing `no-restricted-imports` infra (`eslint.config.ts` L348+) is the precedent. **+ Runtime proof (the executable half):** `derivePartsFromMessages` and a stub `derivePartsFromSession` both produce `Part[]` accepted by `<PartList>` with zero renderer change (the AM1↔AM3 contract made executable). |
| AC6 | `ReferenceChip` is the single shared attachment/reference primitive | **DOM-snapshot net** (it enters the net once in DS): `ReferenceChip.stories.tsx` variants {artifact,image,knowledge,block}×{draft,posted} snapshot. Promoting `ReferenceChip` + `Fold` adds **2** DS story modules → the enumeration-guard floors in `catalog-snapshot.test.tsx` must rise by 2 (N4): L73 `≥59`→`≥61`, L223 `≥58`→`≥60`. **Component test:** draft mode = 2 hit targets (open body + remove ✕); posted = whole-chip open, no ✕. |
| AC7 | Exhaustive Part dispatch + `unknown` fallback | **Component test:** a Part with `kind:"unknown"` renders the quiet placeholder (no throw). **Type:** the `default: assertNeverPart(part)` branch type-checks only while the switch is exhaustive. |
| AC8 | Routing hooks wired to the §6 routes (not building views) | **Component test** `PartList.test.tsx`: spy `onOpen`; click a **knowledge-hosted** block chip → `onOpen({route:"host",hostKind:"knowledge_item",hostId})`; click a **bet-hosted** block chip (C1 — the non-knowledge case, so the totality hole can't hide) → `onOpen({route:"host",hostKind:"bet",hostId})`; artifact chip → `{route:"artifact"}`; Open review → `{route:"review"}`; session Fold → `{route:"session"}`. Assert NO destination view mounts. **Page test** (N1 — assert navigation, not a string map): render `Conversations.tsx` (or the `navHandler` bound to a **spied `navigate`** + real `resolveHostRoute`) inside a `MemoryRouter`; invoke each `OpenTarget` and assert `navigate` is **called** with the resolved path (`host`+`knowledge_item`→`/knowledge/:id`, `host`+`bet`→`/work/bet/:id`); assert `host`+`user` (null route) does **not** call `navigate`. This proves real navigation wiring, not a format function. |

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

1. **`part.ts` types (red).** Add `packages/shared/src/part.ts` with `PART_KINDS`, `Part` (prose has no `mentions` field — W3; questionnaire options are `ReadonlyArray<string>` — W2), `Embed`, `EmbedKind`, `OpenTarget` (`host`/`artifact`/`review`/`session` — C1; no `knowledge`/`blockAnchor`), `OpenHandler`, `PartAuthor`, `ReviewTarget`, `FoldDescriptor`. Import `BlockHostKind` from `./blocks/types.js`. Export from `index.ts`. Write `part.test.ts` (red) asserting the discriminant + closure (`PART_KINDS` has no session/work-log kind — AC4). Commit: `feat(AM1): Part/Embed/OpenTarget type vocabulary`.
2. **`derivePartsFromMessages` (green).** Implement the Message→Part adapter + `groupParts`. The `EntityRef`→Embed dispatch is **exhaustive over all 5 `EntityRef.kind` members** (`exhaustiveAssert` on the branch): `artifact`→`artifact`/`diff`, `knowledge_item`/`bet`/`task`→`entity-ref` (host target), **`message`→`unknown` Embed** (W5 — no permalink route, label-only, no target). Make `part.test.ts` green: each `MessageType` maps (AC3), refs→Embeds incl. **every `BlockRef.hostKind` → `{route:"host",…}`** (AC2/C1 — test a knowledge-hosted AND a bet-hosted block) **and a `message` `EntityRef` → an `unknown` Embed with no `target`** (W5), verdict→resolved fold, redacted→unknown, wire-unrecognised type→unknown, no Part from session activity (AC4). Commit: `feat(AM1): Message→Part adapter`.
3. **Promote `ReferenceChip` to DS.** Move the local fn to `packages/design-system/src/ReferenceChip.tsx` + `.stories.tsx` (kinds×modes variants). Export. Bless the snapshot net for the NEW story (additive — read the diff). **Bump the enumeration-guard floor +1** in `catalog-snapshot.test.tsx` (N4). Component test for draft/posted hit-targets (AC6). Commit: `feat(AM1): promote ReferenceChip to design-system`.
4. **Promote `Fold` to DS.** Move to `packages/design-system/src/Fold.tsx` + `.stories.tsx`. Export. Bless new snapshot. **Bump the enumeration-guard floor +1** (N4 — cumulative with task 3: L73 `≥61`, L223 `≥60`). Commit: `feat(AM1): promote Fold to design-system`.
5. **Per-kind Part renderers.** Extract `parts/{ProsePart,ReviewRequestPart,ReviewResolvedPart,QuestionnairePart,UnknownPart}.tsx` from ConversationSurface, retyped to consume a `Part`, using promoted `ReferenceChip`/`Fold`. Visual output unchanged. Commit: `feat(AM1): per-kind Part renderers`.
6. **`PartList` renderer + dispatch (green) + AC5 lint rule.** Add `PartList.tsx` (author-group via `groupParts`, exhaustive `renderPart` + `assertNeverPart`→`UnknownPart`), `PartList.stories.tsx`. **Add the AC5 `no-restricted-imports` config block to `eslint.config.ts`** scoped to `PartList.tsx`+`parts/**` banning `thread*`/`Message`/`InlineRef`/`harness` imports (W1; mirror the existing L348 block). Tests: AC1 (grouping), AC7 (unknown fallback), AC8 (onOpen targets via spy, incl. non-knowledge host — C1). Commit: `feat(AM1): source-agnostic PartList renderer + import-boundary lint`.
7. **Composer upgrade.** Extend DS `Composer` with unified "+" menu, draft `ReferenceChip` row, conditional reply banner, taller textarea, no footer (design §4). Story variant. Commit: `feat(AM1): unified composer tools menu`.
8. **OpenTarget seam pre-wired (DONE).** `createOpenHandler(navigate)` (`packages/web/src/services/open-handler.ts`) resolves every `OpenTarget` per the route-checklist; `Conversations.tsx` already constructs it (`openTarget`) and feeds `renderRefEmbedsForConversations` through it. This task is **superseded by the live-page migration tasks 11-14** (§12) — the page still renders `ThreadShell`, not `PartList`. Task 8 is now: keep the `createOpenHandler` seam, and the migration tasks consume it as `<PartList onOpen={openTarget}>`. Page-level navigation proof moves to task 12. (No standalone commit; folded into 11-14.)
9. **AM3-reuse proof.** Add a stub `derivePartsFromSession` (or a test-only fixture) producing `Part[]`; assert `<PartList>` renders it with zero renderer change (AC5 executable proof). Commit: `test(AM1): prove Part renderer is source-agnostic`.
10. **Refactor `ConversationSurface` to compose `PartList`.** ConversationSurface renders `<PartList>` over a fixed `Part[]` so the approved design and the production renderer cannot drift. Commit: `refactor(AM1): ConversationSurface composes PartList`.

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
- **Missing failure modes:** unknown Part kind (covered — `unknown` fallback, no throw); redacted payload (covered — `unknown`/`redacted`); wire-unrecognised message type (covered — `unknown`/`wire-unrecognised-type`, concrete deserialization-drift source, N3); **non-knowledge-hosted block routing** (covered — C1: the `host` OpenTarget is total over `BlockHostKind` via the existing `resolveHostRoute`; the AC8 test exercises a bet-hosted block so the hole can't hide); `user` host (no navigable surface → documented no-op); **`message` entity-ref** (covered — W5: no permalink route exists, collapses to the `unknown` Embed, label-only, no target; adapter dispatch exhaustive over all 5 `EntityRef.kind`); session route absent (covered — R3 no-op); HTML injection via agent text (covered — §8, reuse existing sanitizer, no new raw-HTML path); chip label injection (covered — React-escaped text).
- **Critique resolutions (this revision):** C1 — `BlockRef → OpenTarget` made total via a single `host` target resolved through the existing `resolveHostRoute` (no fabricated `knowledgeId`, no unhandled host kind). W1 — AC5 enforced by a scoped `no-restricted-imports` lint rule (existing infra), not a vitest grep. W2 — `recommended`/`QuestionOption` dropped (no source field; concept hard-rule 5 forbids the schema change); the design's "Recommended" tag is deferred until a future schema enhancement. W3 — duplicate mention representation collapsed to the `mention` Embed only (no `MentionRef` leak into the Part). W4 — `blockAnchor` dropped + anchoring explicitly deferred to AM5 (KnowledgeDetail consumes no anchor param today). W5 — `entity-ref → OpenTarget` made total over all 5 `EntityRef.kind`: `message` (no permalink route, excluded from `BlockHostKind`) collapses to the `unknown` Embed (label-only, no target); adapter dispatch exhaustive via `exhaustiveAssert`. N1–N5 folded in (N5: `host-route.js`→`host-route.ts`).
- **Did I respect the snapshot-net reality?** Yes — flagged R2 honestly; verification for the web renderer is component tests + viewer, not the net (the net does not glob web). I did not invent a snapshot gate that doesn't exist.
- **Naming:** `Part`/`Embed`/`Fold`/`OpenTarget` — all concept-locked or literal (no `Manager`/`Service`/`Helper`). `derivePartsFromMessages`/`groupParts` describe the act. `prose` deliberately ≠ `plain` to keep the render vocabulary source-agnostic (rationale stated). 
- **Biggest residual risk:** R4 (DS Composer extensibility) — a build-time discovery, not a plan-time unknown; the fallback is documented.

Verdict: plan is minimal, the boundary is enforceable, no layer reaches past its neighbor (Human Interface only; no Meta/Runtime touch), no Thread/Message/verdict change, no token change.

---

## 12. AMENDMENT — Live-page migration (founder: "desktop app, versioned releases, no live cutover; every change done completely")

**Decision (authoritative, founder):** HyperIdle is a desktop app shipped as versioned releases. There is no gradual cutover and no "keep the old page behind a flag." The new Part-based conversation **becomes** the conversation. The live page `packages/web/src/pages/Conversations.tsx` must render the new Part-based surface; `ThreadShell`/`RichMessageCard`/inline-verdict are removed from the conversation. Substrate tasks 1-7, 9, 10 are DONE + green (`shared/src/part.ts` adapter, `PartList` + `parts/*`, DS `ReferenceChip`+`Fold`, `createOpenHandler`, `ConversationSurface` composes `PartList`). What remains is migrating the live page onto that substrate.

### 12.1 Render-path decision — **render `<ConversationSurface>` fed real props** (not `<PartList>` directly)

Two candidates:

- **(A) `Conversations.tsx` renders `<PartList>` directly + a page-local composer.** The page derives parts, renders `<PartList parts onOpen={openTarget}/>`, and hand-rolls header + a composer beside it.
- **(B chosen) `Conversations.tsx` renders `<ConversationSurface>` fed real props.** `ConversationSurface` ALREADY composes `<PartList>` + the unified-"+" composer + the header chrome (the approved, founder-locked design embodied). Make it accept real props; the page passes real data in.

**Choose (B).** Rationale (concrete, not "more flexible"):
- **Zero drift, by construction.** The approved design and the production page become the *same component*. With (A) the page would re-implement the header + composer the design already specifies, and the two would drift on the next design change — exactly the failure the round-10 lore (`ConversationSurface composes PartList`) was built to prevent. (B) extends that no-drift guarantee from the message column to the whole surface.
- **The composer is already in `ConversationSurface`.** (A) requires a *second* composer (the page-local one) — a budget violation and a duplicate of the unified-"+" composer. (B) reuses the one composer.
- **Migration cost is lower.** (B) changes `ConversationSurface`'s prop boundary (story keeps passing its fixture; page passes real data) + deletes the `ThreadShell` block from the page. (A) requires building page-local header + composer wiring from scratch.

Cost of (B): `ConversationSurface` gains a real-props mode (today it is fixture-only with `{scroll?, composerActive?}`). This is a controlled prop-contract widening, specified in 12.2 — the story remains the default/uncontrolled render.

### 12.2 `ConversationSurface` real-props contract

`ConversationSurface` becomes prop-driven. The **story** keeps rendering its fixture (it passes the fixture `parts` + a console-`onOpen` + its own header strings); the **page** passes real data. Prop shape:

```ts
export interface ConversationSurfaceProps {
  /** The derived render units (page: derivePartsFromMessages(...); story: PARTS fixture). */
  parts: ReadonlyArray<Part>;
  /** The routing seam. page: createOpenHandler(navigate); story: console.info noop. */
  onOpen: OpenHandler;
  /** Thread identity for the header (title + host tag/context). */
  header: { title: string; hostKind: string; hostTitle: string; hostRoute: string | null };
  /** Participants for the header AvatarGroup (derived from identities). */
  participants: ReadonlyArray<{ id: string; name: string; isAgent: boolean }>;
  /** The send path. page: posts a plain message via the existing endpoint; story: noop. */
  onSend: (text: string) => Promise<void> | void;
  /** Story-only visual toggles (default false; the page never sets these). */
  scroll?: boolean;
  composerActive?: boolean;
}
```

- The current default-export signature `({scroll, composerActive} = {})` widens to take the full props; the `.stories.tsx` supplies `parts={PARTS}`, the fixture header/participants, `onOpen={console.info noop}`, `onSend={noop}`. **The story render stays byte-identical** (it just passes what was previously module-internal as props) — so the viewer/`:8098` embodiment does not change.
- `ConversationSurface` no longer hard-codes `PARTS`/`FOUNDER`/`MARA`/`ATLAS` in the render path; those move into the `.stories.tsx` as the fixture it passes in. (Pure mechanical lift; visual output unchanged.)
- The standalone extra `<Fold>` demo block (story lines 526-532) is **story-only** — keep it in the story, do NOT render it in the page (the page's session Folds come from `PartList`'s `session-reference` embeds).

### 12.3 Page wiring (`Conversations.tsx`)

`ConversationsDetail` (the `status==="ready"` branch) replaces **both** `ThreadShell` mounts (the dial-in split's left pane AND the main pane) with `<ConversationSurface>`:

1. **Parts:** `const parts = derivePartsFromMessages(data.messages, viewerId, identitiesToAuthors(data.identities))`. The adapter wants `ReadonlyArray<PartAuthor>`; `data.identities` is `Record<id, {name, role?, isAgent?}>`. Add a tiny page-local `identitiesToAuthors(identities, viewerId)` mapping each entry to `{ id, name, isAgent: !!isAgent, isMe: id === viewerId }`. `viewerId` = the founder identity id already available to the page (the same id used today for "You"/own-message styling). **No new fetch** — same `data` from `useThreadDetail`.
2. **onOpen:** pass the existing `openTarget = createOpenHandler(navigate)` (already constructed in the page) straight through.
3. **header / participants:** derive from the values the page already computes — `threadTitle`, `data.thread.hostKind`, `hostTitle`, `hostRoute` (all present today, lines 396-401), and `participants` from `data.identities` keys.
4. **onSend:** the MINIMAL functional send (12.5) — wraps the existing `onAppend` with a `{ type:"plain", payload:{ text, refs:[] }, clientKey: crypto.randomUUID() }` shape, POSTing to the existing `/api/threads/:id/messages` endpoint that `onAppend` already calls. **The endpoint, the POST, and `useThreadDetail.retry()` refresh are unchanged** — only the call site moves from `ThreadShell`'s composer to `ConversationSurface`'s composer.
5. **Retire:** `renderRefEmbedsForConversations`, `resolveArtifactSlot`, `SHAPE_TO_KIND`, the `ArtifactView` import, the `hideHostBanner`/`artifactSlot`/`onAppendMessage`/`renderRefEmbeds` props on the now-removed `ThreadShell`, and the `ThreadShell` import. Block-reference rendering now flows through the Part adapter's `block` Embed → `ReferenceChip` (title-only, host target). `knip`/`lint` will flag any genuinely-orphaned symbol — remove only those.
6. **Dial-in split:** keep the companion-split layout (`SessionActivityPanel` on the right) — it is AM3-adjacent and unchanged. Only its left pane swaps `ThreadShell` → `ConversationSurface`. The "Dial in" button, `useActiveSessionForTask`, and the `D` keyboard shortcut stay as-is.
7. **States:** loading/not-found/error/empty branches are **unchanged** (per memory: design variants render only the populated state; the page's existing state machine already owns empty/loading/error). `ConversationSurface` renders only the populated `ready` state.

### 12.4 Inline verdict — REMOVED from the conversation

The conversation no longer dispatches verdicts inline. Per the LOCKED design §5:
- An **unresolved** `review` message renders as a `review` Part (`ReviewRequestPart`): `REVIEW REQUESTED` + proposal line + change-set `ReferenceChip` + a single **"Open review"** button → `onOpen({route:"review", betId, reviewId})` → `/work/bet/:betId/review/:reviewId` (the existing, real `ReviewPage`).
- A **resolved** review/questionnaire renders as a `resolved` Part (`ReviewResolvedPart`): the verdict echo "✓ **Approved** by … · …" via `verdictDecisionLabel` + a quiet **"View review"** → same review route. No buttons.
- The inline **Approve / Request changes / Reject** dispatch is **removed** from the conversation. The `onAppend`'s verdict-POST path (and its `committedType === "verdict"` async-ack branch) is no longer reachable from the conversation, because no conversation affordance emits a verdict anymore. `onAppend` is reduced to the plain-send path (12.5); the verdict-specific branches are deleted.

**Verdict-taking reachability (confirmed):** the decision UI lives on `ReviewPage` (`packages/web/src/pages/review/ReviewPage.tsx`, route `work/bet/:betId/review/:reviewId` in `router.tsx`), which fetches `/api/reviews/:id` and renders `ReviewComposition`. The "Open review" button routes there; the verdict is taken there. The conversation is a *reference into* that surface, never the surface. **The reviewer must confirm `ReviewPage` actually exposes the Approve/Request-changes/Reject controls + posts the verdict** (the builder verifies the route mounts and the controls are present; if `ReviewComposition` lacks the verdict controls today that is an AM5/review-page gap, NOT an AM1 regression — flag it, do not re-add inline dispatch).

### 12.5 Reasoning → Fold; `promotedRichMessageId`

- The old `RichMessageCard` reasoning toggle (`> N reasons`, collapsed long-form) maps to the **`Fold`** device: a review/agent Part with multi-step reasoning renders the reasoning behind a `<Fold cta="Show" label="Worked for…">`-style collapse (design §5 "Worked for 1m 12s · Show"). In AM1 the `ReviewRequestPart` shows the proposal line + change-set + "Open review"; deep reasoning is NOT inlined in the conversation (it belongs to the review page). So the reasoning toggle does not migrate as a toggle — its content relocates to the review page, and the conversation's only fold is the calm session/work Fold. (Net: the conversation gets simpler; reasoning depth lives where the decision is made.)
- **`promotedRichMessageId`** (the page-local state that promoted one review message to the rich inline card) is **deleted**. There is no "promoted card" concept in the Part model — every review message renders as a `review` Part uniformly; promotion/inline-decision is gone. Remove the state, its setter, and any prop threading it. (`packages/web/src/__tests__/promotedRichMessageId.test.ts`, listed as protected, asserts Thread/Message behavior, not the promotion UI — confirm it does not assert the deleted state; if it does, it updates per 12.6.)

### 12.6 Composer scope — MINIMAL functional, rest deferred as affordance

The live composer must be **usable**: you can type and send a plain message. Scope split:

**Functional in AM1 (must work):**
- Type in the textarea + click **Send** → POSTs a `plain` message via the existing endpoint (12.5 `onSend`) → `useThreadDetail.retry()` refreshes the thread → the new message renders as a `prose` Part. This is the one end-to-end path proven (task 12 test).
- The unified **"+"** menu opens/closes (already wired in `ConversationSurface`'s `InsertMenu` — open/close + outside-click/Escape work today).
- Draft attachments **render** as `ReferenceChip(mode="draft")` in the wrapping row (the visual contract; present in `ComposerDraftBody`).

**Deferred as affordance in AM1 (present, not yet wired — explicitly out of scope):**
- The "+" menu items (Insert block / Attach file / Mention / Reference item / Format / Emoji) are **visible affordances** but do NOT yet mutate the draft or attach real refs. Picking an item closes the menu (current behavior). Wiring real insert-block editing / file attach / mention picker into the send payload is **deferred** (AM2/later) — `onSend` sends `refs:[]` in AM1. This is the honest minimum: the conversation is usable (send works), the rich-compose affordances are visible but inert, and nothing fakes a capability. Documented, not silently dead.

Rationale for the split: the founder asked for "done completely" on the *migration* (the page renders the new surface, send works, no old page) — NOT for AM1 to also build the full rich-compose pipeline, which is its own scope. Send-works is the load-bearing "usable" bar; insert-block wiring is a separate capability.

### 12.7 Protected-test updates (intended-behavior change, founder-approved — NOT weakening)

These three tests assert the OLD inline-verdict / RichMessageCard / heavy-block-embed behavior that the founder-approved design **deliberately removes**. They are updated to assert the NEW behavior. This is a spec change driven by an approved design, not tests bent to pass (per memory: tests must not *drive* behavior — here behavior changed first, by founder decision, and the tests follow).

- **`Conversations.dispatch.test.tsx`** (currently: click Approve in `RichMessageCard` → POST verdict). **Now asserts:** the review message renders as a `review` Part with an **"Open review"** affordance and **NO** inline Approve/Request-changes/Reject button; clicking "Open review" calls `navigate("/work/bet/:betId/review/:reviewId")` (spy `navigate`). It asserts the conversation **does not** POST a verdict (no verdict POST is reachable from the conversation). Rename to reflect the new contract (e.g. `Conversations.review-routing.test.tsx`). The verdict-POST *semantics* are still covered where verdicts are actually taken (review page / server tests) — see AC reconciliation below.
- **`Conversations.reasoning.test.tsx`** (currently: reasoning toggle inside `RichMessageCard`, collapsed long-form). **Now asserts:** the review Part renders the proposal + "Open review" with **no** `> N reasons` toggle in the conversation (reasoning depth relocated to the review page). Either retarget to assert the absence of the conversation toggle + presence of the review reference, or retire if it no longer maps to any conversation behavior (prefer retarget so the absence is guarded).
- **`e2e/T4-block-reference.spec.ts`** (currently: heavy `BlockRefEmbed` resolve, `block-ref-embed-degraded`/`block-ref-embed-error` testids). **Now asserts:** a message carrying a `block` ref renders a **title-only `ReferenceChip`** (kind `block`) in the conversation; clicking it routes to the block's **host surface** (the `host` OpenTarget). The degraded/heavy-resolve assertions are removed (the heavy `BlockRefEmbed` is no longer wired into the conversation — design §6). The chip-attach flow (CocAttachButton → chip appears) stays where it still applies; only the in-conversation *render* assertion changes from heavy embed → title-only chip.

### 12.8 New ordered tasks (atomic, independently committable)

11. **Widen `ConversationSurface` to real props + lift fixture to story.** Add `ConversationSurfaceProps` (12.2); move `PARTS`/identities into `.stories.tsx` as the passed-in fixture; keep the story render byte-identical (the `:8098` viewer unchanged); keep the story-only standalone `<Fold>` demo in the story. **Verification:** the existing `ConversationSurface.stories.tsx` renders unchanged in the viewer; component test mounts `<ConversationSurface>` with a fixture `parts` + spy `onSend`/`onOpen` and asserts header title + participant avatars + the message column render. Commit: `feat(AM1): ConversationSurface accepts real props`.
12. **Render `Conversations.tsx` through `ConversationSurface` + functional send + remove inline verdict.** Replace both `ThreadShell` mounts with `<ConversationSurface>` fed `derivePartsFromMessages` + `identitiesToAuthors` + `openTarget` + header/participants + `onSend` (plain-send via existing endpoint); delete `promotedRichMessageId` and the verdict branches of `onAppend`; retire `renderRefEmbedsForConversations`/`resolveArtifactSlot`/`SHAPE_TO_KIND`/`ThreadShell` import. **Verification (component test, `MemoryRouter`):** (a) a thread with a `plain` + a `review` + a `resolved` message renders the calm Part column (prose/review/resolved), NO `rich-message-card`, NO inline Approve button; (b) type + Send → POST to `/api/threads/:id/messages` with `{type:"plain", payload:{text, refs:[]}}` + a uuid `clientKey`, then `retry` refreshes; (c) click "Open review" → spy `navigate` called with `/work/bet/:betId/review/:reviewId`; (d) click a `block` chip → `navigate` to the host route. Commit: `feat(AM1): render Conversations through ConversationSurface; remove inline verdict`.
13. **Update the 3 protected tests to the new contract (12.7).** `Conversations.dispatch.test.tsx` → review-routing (no inline verdict POST; "Open review" navigates); `Conversations.reasoning.test.tsx` → no conversation reasoning toggle; `e2e/T4-block-reference.spec.ts` → title-only `block` chip routes to host (drop heavy-embed/degraded assertions). **Verification:** the updated specs are green against task-12 behavior and each asserts a NEW positive behavior (not merely deleted assertions). Commit: `test(AM1): update Conversations dispatch/reasoning/block-ref tests to Part-model behavior`.
14. **Confirm `ReviewPage` verdict path is reachable + clean up.** Verify the `work/bet/:betId/review/:reviewId` route mounts `ReviewPage` and exposes the verdict controls (Approve/Request-changes/Reject) that took over from the inline dispatch; run `npm run lint`/`knip` to remove genuinely-orphaned symbols (`BlockRefEmbed` only if truly unused; leave it if any non-AM1 consumer remains — R5). **Verification:** a smoke component/route test that `ReviewPage` renders for a `:betId/:reviewId` and shows the verdict controls; lint/knip clean. Commit: `chore(AM1): confirm review-page verdict path; prune orphaned conversation embed code`.

Task ordering: 11 → 12 → 13 (13 depends on 12's behavior) → 14. 11 depends only on the DONE substrate. These are the green-phase remainder; expect one builder session.

### 12.9 AC reconciliation — "verdict flow is unaffected"

The AM-track AC "the verdict flow is unaffected" is reconciled against this migration as: **the verdict SEMANTICS are unchanged; the verdict DECISION UI relocates.**

- **Unchanged (semantics):** the `Message` `verdict` type, `VerdictPayload` (`decision` + `resolvesMessageId`), `verdictDecisionLabel` vocabulary, the resolves-relationship (a verdict folds onto its target → `resolved` Part echo), and the POST shape to `/api/threads/:id/messages`. The Thread/Message/verdict primitives are untouched (concept hard-rule 5). The conversation still **echoes** the verdict (`ReviewResolvedPart`) using the same vocabulary.
- **Relocated (UI):** the act of *taking* a verdict (Approve/Request-changes/Reject) moves OUT of the conversation and INTO the review page (`ReviewPage`/`ReviewComposition`), per the LOCKED design §5 ("NO inline decision … the decision is made on the review page"). The conversation becomes a reference into the review experience, not the verdict-taking surface.

So "verdict flow unaffected" = the data model + the verdict-echo path are byte-identical; only the *location* of the decision affordance changes (conversation → review page), which is the founder-approved design intent. The `Conversations.dispatch.test.tsx` rename from "verdict dispatch in the card" to "review routing" encodes exactly this relocation.
