# L3 — Slop Scan (read-only)

Scope: L3 Artifact primitive diff (`git diff main..HEAD`). Scanned the new source files in `packages/shared/src/{types,format}`, `packages/server/src/routes/artifacts.ts`, `packages/db/src/schema*.ts`, `packages/design-system/src/Artifact*.tsx`, `packages/web/src/{hooks/useArtifacts.ts,pages/ArtifactPermalink.tsx}`, plus a sample of tests.

Findings ordered by severity.

---

## HIGH

### H1 — Duplicate `useEffect` block in `useArtifacts.ts` (copy-paste over abstraction)
- File: `packages/web/src/hooks/useArtifacts.ts:21-95`
- What: `useArtifacts(filter)` and `useArtifact(id)` are two near-identical hooks (same state shape, same `cancelled` flag, same fetch+catch pattern, same `err instanceof Error` ladder). 75 lines doing one job twice.
- Why slop: classic AI pattern of "copy the working version and tweak". The two hooks literally inline the same 25-line side effect.
- Clean alt: extract one private `useFetch<T>(url: string | null)` returning `{data,error,isLoading}`, then `useArtifacts = (f) => useFetch<ArtifactPage>(buildUrl(f))` and `useArtifact = (id) => useFetch<Artifact>(\`/api/artifacts/${encodeURIComponent(id)}\`)`. Cuts the file roughly in half.

### H2 — `as never` cast to launder Hono validator typing
- File: `packages/server/src/routes/artifacts.ts:256, 308, 331`
- What: `c.req.valid("json" as never) as z.infer<typeof schema>` appears three times.
- Why slop: `as never` is a type-system bypass and CLAUDE.md/`typescript.md` explicitly forbids unsafe casts (no `any`, no `@ts-ignore`, no unsafe `as`). The `validateBody` middleware should expose a typed accessor; smuggling the schema through `as never` defeats the validator's whole purpose at the call site.
- Clean alt: have `validateBody(schema)` set a typed context var (`c.set("body", parsed)`) and read `c.var.body` — typed, no cast. Or change the helper signature so `c.req.valid("json")` resolves with the inferred type. Either way, the three `as never` instances disappear.

---

## MEDIUM

### M1 — `pluralizeThreads` defined twice across sibling components
- Files: `packages/design-system/src/ArtifactGalleryCard.tsx:24-26`, `packages/design-system/src/ArtifactStackItem.tsx:24-26` — identical 3-line function.
- Why slop: two copies of `n === 1 ? "1 thread" : \`${n} threads\`` in the same package, in files that are obviously a family.
- Clean alt: one shared helper in a small utility module (or inline at use site — it's three tokens).

### M2 — `previewTitle` / `rowTitle` are the same function with one default
- Files: `packages/design-system/src/ArtifactPreview.tsx:24-43`, `packages/design-system/src/ArtifactStackItem.tsx:28-47`
- What: both switch on the same six preview kinds and return the same fields; the only delta is whether `dashboard` falls through (both fall through to task title).
- Why slop: parallel switch statements that drift independently are a guaranteed bug source. `getArtifactViewProps` already exists in shared/types — the title selection should live alongside it.
- Clean alt: one `getArtifactDisplayTitle(artifact): string` in `packages/shared/src/types/artifact.ts`, reused by both components and `ArtifactEmbed.viewSummary`.

### M3 — Stale "CONFUSION resolved" PR-body content captured in test file
- File: `packages/shared/src/__tests__/artifact-cost.test.ts:3-7`
- What: comment narrates the write-tests step's decision to relocate the formatter ("CONFUSION resolved … plan put formatArtifactCost in packages/server …; we lift it to shared so the wire-shape test does not invert layer deps.").
- Why slop: PR/changelog rationale leaking into source. The next reader sees "CONFUSION" at the top of a passing test and gets confused.
- Clean alt: keep the one-line lore in `format/artifact-cost.ts` if needed; delete the narrative from the test.

### M4 — `ArtifactPermalink` uses `p-6` (off-grid + on the AI-aesthetic boundary)
- File: `packages/web/src/pages/ArtifactPermalink.tsx:14, 19, 28, 38`
- What: every branch wraps in `<div className="p-6">`. `p-6 = 24px` is fine on the 4px grid, but it's hardcoded four times and the page-level layout padding belongs in the shell, not the leaf page. (`p-8/10/12` are blacklisted; `p-6` is at the upper edge — the AESTHETICS guidance is to consume `--density-pad-*` tokens for component internals.)
- Why slop: AQ-002 says "no hardcoded `p-[Npx]`"; `p-6` is the Tailwind-native equivalent. The pattern multiplied across four returns is the smell.
- Clean alt: one wrapper `<div className="p-[var(--density-pad-page)]">` (or rely on the route shell's existing padding) — single source of padding for the page.

### M5 — `EventBus` parameter accepted then ignored
- File: `packages/server/src/routes/artifacts.ts:163` — `createArtifactRoutes(db: HyperIdleDb, _eventBus: EventBus)`
- What: `_eventBus` is in the signature but unused; events are not emitted on POST/PATCH despite the architecture plan describing artifact events.
- Why slop: API surface lying about its capabilities. Either wire it (and fire `artifact.created` / `cost.settled`) or drop the parameter and the import.
- Clean alt: if events are out of scope for L3, remove `EventBus` from the signature and let L4 add it back when it actually emits.

---

## LOW

### L1 — Verbose `kindLabel` round-trip via regex for a 13-element constant
- File: `packages/design-system/src/ArtifactKindBadge.tsx:12-14` — `kind.replace(/_/g, " ").toUpperCase()`
- Why minor slop: works fine but a closed `ARTIFACT_KINDS` set would benefit from a static label map (gives designers one place to override "DRAFTED EMAIL" → "EMAIL DRAFT" without editing a regex).
- Clean alt: `const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {...}` in shared.

### L2 — `Number.isFinite(limitRaw) && limitRaw > 0` after `parseInt("", 10)`
- File: `packages/server/src/routes/artifacts.ts:173-174`
- What: parses query then guards. Standard, but the page also silently caps at `DEFAULT_LIMIT` for bad input and rejects `> HARD_LIMIT_CAP` with an error — inconsistent: garbage gets a default, oversize gets a 400.
- Why minor slop: input handling has two policies for invalid input. Pick one (reject both, or clamp both).

### L3 — `EM_DASH` constant for a single character
- File: `packages/design-system/src/ArtifactCostChip.tsx:13` — `const EM_DASH = "—";`
- Why minor slop: pure naming theatre — the literal `"—"` is more readable inline.
- Clean alt: inline it, drop the constant.

### L4 — Comment "Build query" above an obvious query builder
- File: `packages/server/src/routes/artifacts.ts:206`
- Why: comment restates the next line ("`const baseQuery = db.select(...)`"). Banned by SKILL.md ("comments that restate the code").
- Clean alt: delete the comment.

### L5 — `state?: "populated" | "loading" | "error"` defaulted but not consumed
- Files: `ArtifactGalleryCard.tsx:14, 41`, `ArtifactStackItem.tsx:13, 62`, `ArtifactPreview.tsx:12, 51`
- What: `state` is destructured with a `populated` default and forwarded to `data-state={state}`, but no styles/behaviour key off `data-state` in the TSX.
- Why minor slop: prop exists for parity with the HTML mockup but only contributes a DOM attribute today. Either wire skeleton/error variants now or drop the prop until the consumer needs it.

### L6 — Redundant `producingTaskTitle` round-trip on POST response
- File: `packages/server/src/routes/artifacts.ts:288-297`
- What: after insert, re-`SELECT … INNER JOIN tasks` to fetch the title that was already validated to exist five lines earlier.
- Why minor slop: extra query for data already in scope. Could `db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, body.producingTaskId)).get()` once at the top and reuse, or include title in the validation step.

---

## NOT FOUND (verified clean)

- No purple/indigo gradients, no `bg-clip-text` over gradients (AQ-102, AQ-111).
- No `rounded-2xl`/`rounded-3xl` (AQ-101, AQ-011).
- No `p-8`/`p-10`/`p-12`/`p-14`/`p-16` (AQ-103). `p-6` flagged separately as M4.
- No hero sections, no `text-center` page chrome, no `backdrop-blur` (AQ-104, AQ-106, AQ-107).
- No marketing register: no `Welcome to`, `Powered by`, `Effortless`, `Seamless`, `Stunning`, `Game-changing`. Copy is professional throughout — `"Artifact not found"`, `"Failed to load artifact"`, `"PREVIEW PENDING"`.
- No emoji as iconography (the `→` in `ArtifactEmbed.tsx:54` is a literal arrow glyph, not an emoji — acceptable).
- No `grid-cols-3` identical card grid (AQ-108).
- No `any`/`@ts-ignore` (the `as never` in M2/H2 is the only type-bypass).
- No `Lorem ipsum` / `Click here` placeholders (AQ-109).
- No "TODO: implement" / "for now" / "in production" tells.
- No empty catch blocks; the `catch { preview = null }` at `routes/artifacts.ts:143-145` is a documented JSON-parse fallback (acceptable).

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | 2     |
| MEDIUM   | 5     |
| LOW      | 6     |
| **Total**| **13**|

Worst single instance: **H1** — duplicate hook bodies in `packages/web/src/hooks/useArtifacts.ts:21-95`. Two near-identical 30-line side effects copy-pasted; should be one `useFetch<T>` helper.

No AI-aesthetic anti-patterns slipped through. Copy register stays professional. Type safety is mostly clean — the `as never` casts (H2) are the only bypass and stem from the validator's typing, not from sloppy authorship.
