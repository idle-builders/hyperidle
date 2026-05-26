# Q3 Concept — Human-created bets

**Status:** Locked (inherits from `plans/human-authoring/concept.md`)
**Date:** 2026-05-26

---

## Concept inheritance

Q3 does not introduce new primitives or reshape existing ones. All concept work was completed in the parent concept doc at `plans/human-authoring/concept.md` (status: Locked). This document confirms alignment and notes observations relevant to Q3 implementation.

## Required reading (for downstream /design and /architecture)

- `plans/human-authoring/concept.md` — collaborative continuation principle, vocabulary
- `docs/process-layer/bets-shape-commit-change-ship.md` — bet lifecycle, shaped -> committed flow
- `packages/db/src/schema.ts` lines 63-100 — bets table (pitch, costAppetiteMinor, costAppetiteCurrency, revisionLog)
- `packages/server/src/routes/bets.ts` — POST /api/bets (createBetSchema), PATCH /api/bets/:id, deriveTitleFromPitch()
- `packages/shared/src/types/money.ts` — WireMoney, CurrencyCode, CURRENCY_CODES, CURRENCY_SCALE
- `packages/shared/src/product.ts` — ProductListItem (carries teamId indirectly via team lookup)
- `packages/web/src/shell/Canvas.tsx` — two-column shaped/committed board, CanvasBet interface
- `packages/web/src/shell/PitchSelector.tsx` — existing pitch overlay (potential entry point)
- `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` — native dialog creation pattern (Q2 precedent)
- `packages/design-system/src/BetCard.tsx` — card component for bets on Canvas
- `packages/design-system/src/PitchCard.tsx` — card component for pitches in PitchSelector

## Noun classification for Q3

| Noun | Classification | Notes |
|---|---|---|
| bet | **Stable** | Process primitive; unchanged by Q3. Q3 adds a human creation path via existing POST /api/bets. |
| pitch | **Stable** | `bets.pitch` freeform markdown column. Title derived server-side via `deriveTitleFromPitch()`. |
| cost appetite | **Stable** | WireMoney (`costAppetiteMinor` + `costAppetiteCurrency`). L17 shipped this; Q3 exposes it in a form. |
| canvas | **Stable** | Two-column (shaped/committed) drag-drop board. Shell component exists. Q3 adds an entry point. |
| collaborative continuation | **Stable** (concept locked) | Humans and agents are interchangeable authors. Q3 is the second implementation (Q2 knowledge creation was first). |

## Observations for Q3 implementation

### 1. Missing creation attribution in revisionLog

The POST /api/bets endpoint does not seed `revisionLog` with an initial creation entry. The `revisionLog` column is nullable text (JSON array). Revision entries are only added by PATCH operations. This means a human-created bet has:
- `createdAt` timestamp (no actor)
- No `createdBy` column
- No initial revision log entry

For AC-7 (version history tracks both human and agent edits), the architecture plan should seed an initial revisionLog entry on POST with the actor identity. This is implementation work, not a concept change — Collaborative Continuation says "Authorship is derived from the version log" but the current POST skips seeding it.

### 2. teamId resolution path

The spec requires `teamId` auto-assigned from product's team. The data model supports this: `teams.productId` references `products.id` (1:1 per L13 concept). Two resolution strategies:

- **Client-side:** Frontend fetches products list (useProducts), user picks product, frontend looks up team via a products endpoint that includes teamId. Current `ProductListItem` does NOT include teamId directly — it has `id`, `name`, `phase`, `status`, `leadAgentId`.
- **Server-side:** POST /api/bets already requires `teamId`. The server could resolve it from `productId` automatically. This is cleaner — avoids exposing teamId to the frontend and eliminates a class of bugs where client sends wrong teamId.

Architecture must decide. Server-side resolution is preferred (team is an internal join key per L13 lore).

### 3. Strict schema rejects unknown fields

`createBetSchema` uses `.strict()` — any field not in the schema returns 400. This means the form MUST NOT send deprecated `appetite` (string) or any extra fields. The Money input must serialize to `costAppetite: {minor: number, currency: CurrencyCode}` or omit it entirely.

### 4. Canvas does not fetch its own data

The `Canvas` component is a pure presentational component (`CanvasProps: {bets, capacity, onMoveBet}`). It does not own data fetching. The parent page that hosts Canvas must:
- Fetch bets via GET /api/bets/canvas (returns `{shaped, committed, capacity}`)
- Transform bet rows into `CanvasBet[]` shape (id, title, product, status, appetite, progress)
- Handle the `onMoveBet` callback (POST /api/bets/:id/commit or status transition)
- Handle re-fetching after a new bet is created

Currently, no production page renders Canvas — it only exists in stories/tests. Q3 must either wire Canvas into an existing page or acknowledge that the "new pitch" button lives on the Canvas component itself, requiring the parent to pass down an `onNewPitch` callback.

### 5. BetCard vs PitchCard on Canvas

Canvas currently renders `BetCard` for each bet. The spec says "New pitch appears as PitchCard in shaped column." But BetCard and PitchCard have different prop shapes:
- BetCard: title, product, status, appetite, progress, actions, onClick
- PitchCard: title, hypothesis, proposer, status, appetite, kind, actions, onClick

A freshly created bet has no hypothesis or proposer in the current schema. The architecture must decide: use BetCard for Canvas (current behavior) and accept that shaped bets render as BetCards, or map bet data to PitchCard props. Since BetCard is already what Canvas uses, and the bet table has no hypothesis/proposer columns, BetCard is the pragmatic choice. The spec's reference to "PitchCard" may be aspirational — architecture should clarify.

## Contracts confirmed (from parent concept doc and existing code)

- **Cardinality:** A bet belongs to exactly one product and one team. Team is 1:1 with product (L13).
- **Closure:** BetStatus is a closed 9-value enum. costAppetite uses WireMoney (closed CurrencyCode enum).
- **Mutability:** pitch, costAppetite, doneCondition, hypothesis are mutable via PATCH with reason + revisionLog. Status transitions via dedicated endpoints (commit, ship, kill, pause, resume).
- **Identity:** Opaque UUID (`bets.id`), generated server-side via `crypto.randomUUID()`.
- **Hard rule:** Title is derived from pitch, never stored. Status starts at `shaped` on POST creation. `.strict()` rejects the deprecated `appetite` string field.

## No concept changes required

The parent concept doc covers all Q3 nouns without contradiction. No ground-truth doc updates needed. The work is UI implementation (creation form, Canvas integration) plus a minor API enhancement (seed revisionLog on POST for attribution tracking). Proceed to `/design` and `/architecture`.
