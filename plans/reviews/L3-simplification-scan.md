# L3 Simplification Scan — Read-Only

Scope: Artifact primitive (L3) diff vs `main`. Rubric: `.claude/skills/simplification-scan/SKILL.md` + CLAUDE.md (no premature abstraction, no defensive boilerplate, no comments-on-WHAT).

Closed-view-family discipline (8 names) is **respected** — the export boundary test passes, no extra `Artifact*` exports leak.

---

## HIGH

### H1. `getArtifactViewProps` is a 70-line layer used by exactly one caller
**File:** `packages/shared/src/types/artifact.ts:98-178` (called from `packages/design-system/src/ArtifactEmbed.tsx:25`).
**Found:** A second discriminated union `ArtifactViewProps` (5 shapes) and a switch that translates the 12-variant `ArtifactPreview` into it. Only `ArtifactEmbed.viewSummary` consumes the result — and it immediately collapses every shape back to a single string. `ArtifactPreviewSurface` does the same dispatch *directly* on `ArtifactPreview.kind` without going through this layer (compare to `ArtifactPreviewSurface.tsx:31-79`).
**Why over-engineered:** "5 view shapes" was a design abstraction that no renderer actually needs at runtime — both renderers want a string summary or per-kind body. This is a parallel taxonomy maintained for one consumer.
**Minimum simpler form:** Inline a `function viewSummary(preview: ArtifactPreview | null): string` next to `ArtifactEmbed` (or alongside `ArtifactPreviewSurface.renderBody`) and delete `ArtifactViewProps` + `getArtifactViewProps` + the export. Saves ~70 LOC plus a public type from the shared barrel.

### H2. Duplicated per-kind "title" pickers in two components
**File:** `packages/design-system/src/ArtifactPreview.tsx:24-43` (`previewTitle`) and `packages/design-system/src/ArtifactStackItem.tsx:28-47` (`rowTitle`). The two functions are byte-identical in structure (same 6 cases, same default fallback to `producingTaskTitle`).
**Why over-engineered:** Same logic, two copies, inside the closed view family — exactly the spot drift will show up first.
**Minimum simpler form:** One `function artifactDisplayTitle(a: Pick<Artifact, "preview" | "producingTaskTitle">): string` in a `packages/design-system/src/artifact-helpers.ts` (un-exported from barrel — closed view family). Both layouts call it.

### H3. POST handler does an extra SELECT after INSERT to re-hydrate the row
**File:** `packages/server/src/routes/artifacts.ts:271-298`.
**Found:** After `db.insert(artifacts).values(...).run()`, the code immediately re-selects the row and joins to `tasks` to get `taskTitle`. But the title was just looked up two statements earlier (line 262) for FK validation, and every other field is already in the request body or local variables.
**Why over-engineered:** Defensive round-trip to the DB for data the handler already has. The "if (!row) return INTERNAL 500" branch is unreachable — we just inserted the row in the same SQLite connection.
**Minimum simpler form:** Build the response from `body` + `id` + `now` + `taskRow.title` (fetch title in the same initial SELECT). Delete the post-insert SELECT and the `INTERNAL` branch.

---

## MEDIUM

### M1. `try { JSON.parse } catch { preview = null }` swallows corruption silently
**File:** `packages/server/src/routes/artifacts.ts:139-146`.
**Found:** Defensive try/catch around `JSON.parse` of a column we control on the way in (we always `JSON.stringify` valid `ArtifactPreview` before insert). The `catch` silently downgrades to `null` — no log, no observability. Either the data is trusted (then drop the catch and let it propagate) or it isn't (then log and surface).
**Why over-engineered:** Cargo-cult try/catch on internally-controlled data, with the failure mode hidden from operators.
**Minimum simpler form:** Drop the try/catch. If preview-corruption is a real concern, log via observability adapter and convert to an unrecognised-kind response — but don't silently lie.

### M2. `ArtifactKindBadge` accepts `ArtifactKind | string`
**File:** `packages/design-system/src/ArtifactKindBadge.tsx:5-7`.
**Found:** `kind: ArtifactKind | string`. The `| string` widens the type to the universe, defeating the closed enum it sits next to. Every call site passes `data.kind: ArtifactKind` (verified — 4 internal call sites + the stories file). The widening exists to make `kindLabel` accept arbitrary strings, but it never receives one.
**Why over-engineered:** Premature flexibility — `unknown_kind` is already in the closed enum; there's no third source of strings.
**Minimum simpler form:** `kind: ArtifactKind`. Delete the `| string`.

### M3. `ArtifactGalleryCard` / `ArtifactStackItem` carry both `data.threadCount` and a top-level `threadCount` prop
**File:** `packages/design-system/src/ArtifactGalleryCard.tsx:9-14, 34` and `ArtifactStackItem.tsx:8-13, 55`.
**Found:** `data: Omit<Artifact, "threadCount"> & { threadCount?: number }; threadCount?: number;` then `const count = threadCount ?? data.threadCount ?? 0`. Two ways to pass the same value plus a triple-fallback. The shared `Artifact` type already has `threadCount: number` (non-optional, server always returns 0 or higher).
**Why over-engineered:** Configuration knob nobody asked for. The story file is the only place that exercises the override.
**Minimum simpler form:** `data: Artifact`, then `data.threadCount`. Delete the `Omit<… & { threadCount?: number }>` gymnastic and the standalone prop.

### M4. `ArtifactEmbed.data` strips `threadCount` only to make it optional
**File:** `packages/design-system/src/ArtifactEmbed.tsx:12-15`.
**Found:** `data: Omit<Artifact, "threadCount"> & { threadCount?: number }` — but `ArtifactEmbed` never reads `threadCount` at all. The override exists for no consumer.
**Minimum simpler form:** `data: Artifact`. Delete the `Omit & {...}`.

### M5. `EM_DASH` constant for a single literal usage
**File:** `packages/design-system/src/ArtifactCostChip.tsx:14, 16`.
**Found:** `const EM_DASH = "—"` used once.
**Why over-engineered:** Naming a one-off literal constant adds indirection without intent.
**Minimum simpler form:** Inline `"—"` at line 16.

### M6. `RECOGNISED_KINDS` Set built from a 13-element tuple
**File:** `packages/server/src/routes/artifacts.ts:20`.
**Found:** `new Set<string>(ARTIFACT_KINDS)` to do one membership check per row in `rowToArtifact`. The `kind` column is constrained at INSERT to the 12 recognised values (Zod `enum(ARTIFACT_KINDS).refine(k !== "unknown_kind")`). The only way to read a row whose kind is NOT in the set is forward-compat data from a future code version — and at that point the JSON.parse `parsed.kind === kind` check (line 142) handles it.
**Why over-engineered:** Belt-and-braces for a case that today cannot happen and that the secondary check already covers.
**Minimum simpler form:** Drop `RECOGNISED_KINDS`; rely on the discriminant equality at line 142 alone, or move the normalisation to a single boolean expression.

### M7. `_eventBus` parameter never used
**File:** `packages/server/src/routes/artifacts.ts:163`.
**Found:** `createArtifactRoutes(db, _eventBus)` — leading underscore announces "I don't use this". No `eventBus.emit(...)` anywhere in the file.
**Why over-engineered:** Premature plumbing for an event we haven't decided to publish. Drop until the consumer arrives.
**Minimum simpler form:** Remove the parameter and update the one call site.

---

## LOW

### L1. `ArtifactCostFromSession` is re-exported from `format/artifact-cost.ts`
**File:** `packages/shared/src/format/artifact-cost.ts:7`.
**Found:** `export type { ArtifactCostFromSession } from "../types/artifact.js"` — a re-export through the formatter module that nobody imports via this path (the barrel exports it directly from `types/artifact.ts`).
**Minimum simpler form:** Delete line 7.

### L2. Redundant comments restating the obvious
**File:** `packages/server/src/routes/artifacts.ts:166, 237, 250, 301, 328` (`// GET /api/artifacts (axis discriminator on query)`, `// GET /api/artifacts/:id (permalink)`, etc.).
**Found:** Each route has a `// METHOD /api/...` comment immediately above the literal `router.get("/", ...)` that says the same thing.
**Why over-engineered:** Comments-explaining-WHAT, the rule violation called out in CLAUDE.md.
**Minimum simpler form:** Delete the line-above-route comments. Keep the two `@lore` blocks (those carry WHY).

### L3. `useArtifact` and `useArtifacts` are byte-similar but not extracted
**File:** `packages/web/src/hooks/useArtifacts.ts:21-95`.
**Found:** Two hooks with identical fetch/cancel/error scaffolding (~35 lines each). Not a problem yet — but flagged as the next duplication if a third hook lands.
**Note:** Do NOT extract preemptively. Leave for now (rule of three). Listed for awareness only.

### L4. `c.req.valid("json" as never)` cast pattern
**File:** `packages/server/src/routes/artifacts.ts:256, 308, 331`.
**Found:** Three identical `as never` casts to work around middleware typing. Possible Hono-typing limitation — not a simplification candidate, but worth a `@lore` capturing why.

---

## VERDICT

Severity tally: **3 high, 7 medium, 4 low.**

Single most over-engineered piece: **H1 — `getArtifactViewProps` + `ArtifactViewProps`** (`packages/shared/src/types/artifact.ts:98-178`). 70 LOC of parallel taxonomy that exists for one consumer that immediately stringifies the result.

Block-ship: **No.** Nothing here is a correctness bug; it's all subtractable surface area. Apply pass (Step 9) can land all of HIGH and MEDIUM in a single commit without behaviour change. M1 (silent JSON catch) is the only finding with a runtime-behaviour consequence (operability).

Closed-view-family discipline: **Respected.** The export-boundary test passes; exactly the 8 sanctioned names are exported. No `ArtifactCard`, no bare `Artifact` symbol, no unauthorised `Artifact*.tsx` file.
