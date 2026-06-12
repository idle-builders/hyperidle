# AF16 — Concept

**Verdict: no new or reshaped nouns. Correctness & hygiene workpackage. Concept gate N/A.**

## Phase 0 — noun classification

Walked every acceptance criterion and the spec's "What's genuinely missing" list. Every noun AF16 touches is **Stable** — it already has a contract in `docs/` and AF16 changes none of it. AF16 only changes how existing nouns are *rendered*, *formatted*, *navigated*, *scheduled*, and *documented*.

| Noun | Status | Where it's already defined | AF16's relationship |
|---|---|---|---|
| Bet | Stable | `docs/process-layer/the-five-primitives.md` | Fixes its *progress display* (NaN%), not the primitive. |
| Task | Stable | same | Used as input to bet progress math. |
| Artifact | Stable | `docs/process-layer/artifact-primitive.md`, `docs/blocks/` | Fixes per-*kind rendering*; the Artifact primitive + Kind registry are unchanged. |
| Kind | Stable | `packages/shared/src/kinds/` (AE6 registry) | Reused as-is; no new kind, no schema change. |
| Routine / Agent | Stable | `docs/process-layer/the-five-primitives.md` | Fixes post-mutation list refresh, not the primitives. |
| Money (`WireMoney`/`Money`) | Stable | `packages/shared/src/types/money.ts` (L17/AF10) | Reuses `formatMoney`; introduces no new money concept. |
| Search result | Stable | `packages/server/src/routes/search.ts` (AD7) | Makes ordering deterministic/relevance-aware; result *shape* unchanged. |
| Notification queue / login session / invite code / access log / propagation log | Stable | `packages/db/src/schema.ts` | Adds *retention/TTL pruning*; table shapes unchanged (no new column required). |

**Banned nouns being PURGED (not introduced):** `Rail`, `CoC`/`Chief of Staff`/`coach` (as a HyperIdle role), the false `BullMQ`/`Redis` stack claim, the fictional `file_leases` table. These are vocabulary removals — the opposite of a concept introduction.

No spec/doc contradiction surfaced. The spec's own thesis is "docs must match code"; AF16 *aligns* vocabulary, it does not coin any.

## Affected-surface map (for `/architecture`)

Six sub-batches, all over existing surfaces:

1. **Work-surface display correctness** — `packages/web/src/pages/WorkBet.tsx` (progress stat card, NaN%), money/label formatting via the shared `formatMoney` helper, post-mutation refresh in `packages/web/src/pages/WorkTeam.tsx`.
2. **Dead controls + broken navigation** — `/work` breadcrumb targets in `WorkTask.tsx` + `WorkBet.tsx` (no `/work` route exists in `packages/web/src/router.tsx`), no-op buttons.
3. **Search determinism/relevance** — `packages/server/src/routes/search.ts`.
4. **Artifact rendering per kind** — `packages/design-system/src/ArtifactPreviewSurface.tsx` + the per-kind renderers in `packages/web/src/kinds/`.
5. **Doc/naming hygiene** — `CLAUDE.md`, `docs/architecture/*`, `docs/human-interface-layer/*`; banned-term + false-claim removal.
6. **Retention/TTL sweep** — `packages/db/src/schema.ts` tables + a new reaper wired into `packages/fabric/src/bootstrap.ts` (mirrors `workspace-reaper.ts`).

## Required reading (downstream)

- `docs/process-layer/artifact-primitive.md` — Artifact + Kind contract (so artifact rendering stays inside the locked concept).
- `packages/shared/src/types/money.ts` + `packages/shared/src/format/money.ts` — the Money contract and `formatMoney` (reuse, don't reinvent).
- `docs/architecture/technology-summary.md` + `docs/architecture/components.md` — the docs carrying the false BullMQ/Redis & `file_leases` claims to correct.
- `packages/fabric/src/services/workspace-reaper.ts` — the canonical TTL-reaper pattern the retention sweep must mirror.

## Vocabulary lock (removals only)

| Removed term | Reason | Canonical replacement |
|---|---|---|
| Rail | UI region deleted in U6 (Sidebar) | "Sidebar" where a region is meant; delete otherwise |
| CoC / Chief of Staff / coach (role) | Retired in AD8a | "Assistant" (individual agent) |
| BullMQ / Redis-backed job scheduling | Not installed; false claim | "in-process `setInterval` schedulers in `packages/fabric/src/services/`" |
| `file_leases` table | Never implemented | remove the claim |
