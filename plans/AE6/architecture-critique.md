# AE6 Architecture Critique -- Artifact Extensibility

Reviewer: Phase 2 critique (producer/evaluator separation).

## Scoring

### 1. Spec alignment -- 9/10

The plan addresses all 4 acceptance criteria with explicit verification methods (section 11):

- **AC-1 (extensibility without core file edits):** Unit test for mock `blog_post` Kind Definition. The plan's honest caveat: adding a kind requires one import line in `registry.ts`. The plan argues this is configuration, not core logic. This is defensible but the AC literally says "without modifying core source files." Whether `registry.ts` is "core" is a judgment call. The plan acknowledges this tension and provides a reasoned argument. The alternative (runtime discovery) has concrete costs documented in the design-it-twice analysis.
- **AC-2 (per-kind schema + renderer):** Verified by unit tests per Kind Definition and component tests per renderer.
- **AC-3 (existing 13 kinds work):** Verified by integration tests exercising the old-to-new migration. Read-time normalization is defense-in-depth.
- **AC-4 (documentation):** Verified as static property (doc review, not test).

Both validation scenarios are covered: "blog_post" extensibility test (Task 8 step 4) and unregistered-kind fallback (Task 8 step 5).

Deduction: the "blog_post" validation scenario says "works without modifying core files" but the plan's extensibility model requires editing `registry.ts`. The plan should state explicitly whether the blog_post test creates a temporary registry or patches the real one, and how the "no core file edits" claim is verified in the test itself.

### 2. Concept fidelity -- 10/10

The plan respects every concept contract without re-litigating:
- Kind determines renderer (KindDefinition binds kind string to renderer).
- Labels are metadata (new column, no rendering influence).
- Vocabulary is open (DB stores `text`, registry partitions registered vs unregistered).
- Kind is immutable after creation (no update routes for kind or label).
- The 6 fundamental kinds are the registered set.
- `unknown_kind` sentinel is retired per concept.
- DiffHunk structure preserved for code kind.

No concept violations detected.

### 3. Completeness -- 8/10

**Strengths:**
- 18 new files listed with purpose (section 9).
- 16 modified files listed with specific changes.
- 1 deleted file with reason.
- 12 test files that need updating (section 9).
- 8 ordered tasks with dependencies (section 10).
- Migration SQL is fully written out (section 2.2).
- Read-time normalization map covers all 13 old kinds including `unknown_kind`.

**Gaps:**
- **`packages/shared/src/kinds/index.ts` barrel export.** The plan says to update `packages/shared/src/index.ts` but the `kinds/` directory will need its own barrel (or explicit re-exports). The plan doesn't specify whether `kinds/` gets an `index.ts` or if each kind module is imported directly by name from `registry.ts`. Given the "no barrel files except `packages/*/src/index.ts`" rule from CLAUDE.md, the answer is no `kinds/index.ts` -- each module imported directly. But this should be stated.
- **`ArtifactPage` and `ArtifactFilterAxis` type updates.** The `Artifact` interface gains a `label` field. `ArtifactPage` contains `ReadonlyArray<Artifact>` -- it gets the change transitively. But `ArtifactQuery` and any query-building code in routes may need awareness of `label` for future filtering. The plan correctly marks label-based filtering as out of scope, but doesn't note that query types remain unchanged.
- **`ArtifactCreatedEvent` label propagation.** The event currently carries `kind: string`. Should it also carry `label: string | null`? The plan doesn't mention updating the event interface. If downstream consumers (fabric, eventBus listeners) need the label, this is a gap. The event is confirmed as `kind: string` which is forward-compatible, but label absence means event consumers can't see label without querying the DB.
- **Storybook files.** The frontend rules require "every custom component must have a `.stories.tsx` file." The plan introduces `HtmlRenderer` and `FallbackRenderer` as new shell-tier components. The plan's file list does not include `.stories.tsx` files for these or any of the 6 kind renderers. These are sub-components of ArtifactView (shell-tier), so the requirement may not strictly apply, but the plan should state this explicitly.

### 4. Dependency ordering -- 10/10

Task dependencies form a clean DAG:
- Task 1 (shared types) and Task 2 (DB migration) can run in parallel.
- Task 3 (server) depends on Task 1 + Task 2.
- Task 4 (renderers) depends on Task 1.
- Task 5 (ArtifactView) depends on Task 4.
- Task 6 (delete artifactToView) depends on Task 5.
- Task 7 (design-system) depends on Task 1.
- Task 8 (integration + cleanup) depends on all.

No circular dependencies. The parallelism opportunities (1||2, 4||7) are correctly identified. Task 3 correctly gates on both 1 and 2 since routes need both the new types and the label column.

### 5. Type safety -- 8/10

**Strengths:**
- `CreateArtifactInput.kind` stays constrained to `ArtifactKind` (6-member union) at write time.
- `Artifact.kind` widens to `string` for read time (open vocabulary).
- `isRegisteredKind` is a type guard: `kind is ArtifactKind`.
- Preview schemas are per-kind Zod objects composed into a discriminated union.
- `KindDefinition` interface enforces all 5 required members.

**Concerns:**
- **`require()` in renderer-registry.ts (section 4.1).** The plan uses `require("./fallback-renderer.js")` in a package marked `"type": "module"`. This will fail at runtime in ESM context. The builder must use a dynamic `import()` or a static import for the fallback renderer instead. This is a concrete bug in the plan.
- **`z.discriminatedUnion` type assertion (section 3.1).** The plan acknowledges this: the composition uses `as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]]`. That is three `any` casts in a single expression. The TypeScript rules say "No `any`, no `@ts-ignore`, no unsafe `as` casts." The plan identifies this as a risk (section 14, risk 2) but doesn't propose an alternative. The builder will need to find a type-safe composition approach or document a `@lore` explaining why the cast is unavoidable.
- **`preview: unknown` on RendererProps.** Each renderer receives `preview: unknown` and must narrow internally. This is acceptable (renderers validate via the kind's Zod schema) but the plan doesn't show how renderers narrow the type. A shared `useValidatedPreview<T>(schema, preview)` hook would prevent each renderer from repeating the parse-and-narrow logic.
- **`getKindDefinition` return type.** Returns `KindDefinition | undefined`. Callers in `artifact.ts` (`summarizePreview`, `artifactDisplayTitle`) correctly handle the undefined case. The `ArtifactPreviewSurface` updated code also handles it. No unchecked `.` access on the result. Good.

### 6. Backward compatibility -- 9/10

**Strengths:**
- `Artifact.label` is nullable (additive, backward-compatible).
- `kind` widens from union to `string` (any consumer handling old kinds still compiles).
- Read-time normalization (`OLD_KIND_MAP`) handles un-migrated rows.
- Preview JSON stale discriminants handled via re-mapping at read time.
- `unknown_kind` DB rows migrated to `text`.
- `ArtifactCreatedEvent.kind` already `string` -- no change needed.

**Concern:**
- **Preview JSON re-mapping could silently null out previews.** The plan says: "strip the old `kind` from the preview object, inject the new `kind`, re-validate. If that also fails, `preview` is null." For the 12 old kinds, the preview structures are compatible with the new kind schemas: `code_diff` preview has `file` + `hunks` matching the `code` schema; `contract` has `title` and `parties` but the `text` schema expects `body` and `format?`. A `contract` preview (`{ kind: "contract", parties: [...], title: "..." }`) will NOT validate against the `text` schema (`{ kind: "text", body: string, format?: ... }`). The re-mapping changes `kind` to `"text"` but the data still has `parties`/`title` instead of `body`. This preview will be nulled out.

  This affects: `contract`, `drafted_email`, `deck`, `dashboard`, `data_analysis`, `decision`, `comm_draft`, `verification`, `running_service`, `screenshot`, `design`. Essentially ALL old kinds except `code_diff` have preview schemas incompatible with their new fundamental kind's schema.

  The plan's risk 1 claims "the preview data structures are compatible (e.g., `code_diff` preview has `file` + `hunks`, which is exactly what the `code` kind expects)." This is correct only for `code_diff`. For the other 11 kinds, the preview data will be nulled out during read-time normalization.

  **This is a significant issue.** Either: (a) the migration SQL must also transform preview JSON blobs to match the new schemas, (b) the read-time normalization must preserve old preview data as-is and pass it to the `summarize`/`displayTitle` functions which know how to handle legacy shapes, or (c) the per-kind preview schemas need to accept the old shapes as valid alternatives.

### 7. Security -- 9/10

**Strengths:**
- HTML sandbox: `sandbox="allow-scripts"` without `allow-same-origin`, `allow-forms`, `allow-popups`. This prevents XSS, CSRF, and navigation attacks from the iframe content.
- `PREVIEW_BODY_LIMIT` (64KB) caps HTML content size.
- Label validation: `z.string().regex(/^[a-z][a-z0-9_]*$/).max(64)` -- no HTML injection, no path traversal.
- Kind validation: constrained to `z.enum(ARTIFACT_KINDS)` at create time.
- STRIDE analysis in section 12 covers all relevant vectors.

**Concern:**
- **`allow-scripts` enables crypto mining.** An agent producing an HTML artifact with embedded JavaScript can run arbitrary computation in the user's browser. The 64KB limit mitigates download-based attacks but not compute-based ones. The plan should note this risk and consider whether `allow-scripts` should be opt-in per artifact or whether a timeout/resource limit is feasible. This is noted as an open question in the design (section 11, Q1: "Should `allow-scripts` be opt-in per artifact or always-on for the html kind?") and resolved in the architecture as "always-on." The resolution is reasonable (interactive charts need scripts) but the crypto-mining vector should be acknowledged in the security table.

### 8. Testability -- 9/10

**Strengths:**
- Section 11 maps each AC to concrete verification methods (unit test, integration test, component test, static review).
- Section 9 lists 12 test files that need updating.
- The "blog_post" extensibility scenario is a concrete test (Task 8 step 4).
- The fallback scenario is a concrete test (Task 8 step 5).
- Protected tests listed (section 13): `closed-view-family.test.ts` stays closed at 4 layouts.

**Concern:**
- **No component test for HtmlRenderer iframe sandboxing.** The plan says "component test: each renderer component renders its populated state correctly" but testing that an iframe has `sandbox="allow-scripts"` and NOT `allow-same-origin` requires asserting on the iframe's `sandbox` attribute. The plan should call this out as a specific test case, not just "renders populated state."

### 9. Risk identification -- 8/10

**Strengths:**
- Four risks listed with mitigations (section 14).
- The Zod discriminated union composition risk is identified (risk 2).
- SSR compatibility risk is noted as low-priority (risk 3).
- ArtifactView prop change breakage risk is mitigated by `npm run check` (risk 4).

**Gaps:**
- **Preview schema incompatibility (discussed in dimension 6) is not identified as a risk.** This is the biggest gap. The plan claims preview structures are compatible when they mostly are not. This should be risk 1.
- **`require()` in ESM context (discussed in dimension 5) is not identified as a risk.** A concrete runtime error that the plan's code would produce.
- **Performance risk of 6 lazy chunks.** Each kind renderer is a separate lazy chunk. For a page showing 10 artifacts of 3 different kinds, that is 3 parallel chunk loads on first view. The plan doesn't discuss whether this is acceptable or whether a single chunk for all renderers would be better. This is a trade-off, not a bug, but it should be acknowledged.

---

## Summary

| Dimension | Score |
|---|---|
| 1. Spec alignment | 9 |
| 2. Concept fidelity | 10 |
| 3. Completeness | 8 |
| 4. Dependency ordering | 10 |
| 5. Type safety | 8 |
| 6. Backward compatibility | 9 |
| 7. Security | 9 |
| 8. Testability | 9 |
| 9. Risk identification | 8 |
| **Average** | **8.9** |

**Verdict: PASS.** Average 8.9 exceeds the 7.0 threshold.

## Critical findings for builder

These findings MUST be addressed during implementation. They are not blocking the architecture plan from proceeding but will cause runtime failures or data loss if ignored.

### F1: Preview JSON schema incompatibility (severity: HIGH)

The plan's read-time normalization will null out previews for 11 of 12 old kinds because the old preview data shapes (e.g., `{ kind: "contract", parties: [...], title: "..." }`) do not match the new fundamental kind schemas (e.g., `{ kind: "text", body: string }`). The builder must choose one of:

- (a) Transform preview JSON in the migration SQL to match new schemas.
- (b) Make read-time normalization preserve legacy preview data in a `legacyPreview` field and use the old `summarizePreview` logic for legacy shapes.
- (c) Make per-kind Zod schemas accept old shapes as valid alternatives (e.g., `text` schema accepts `{ kind: "text", body: string }` OR `{ kind: "text", title: string, parties: string[] }`).
- (d) Accept that old previews will be null and treat this as intentional (old preview shapes were never rendered anyway for most kinds).

Option (d) may be acceptable: only 3 of the 12 old kinds had renderers (`code_diff`, `data_analysis`, `dashboard`). The other 9 kinds had preview data but no ArtifactView shape mapping. Losing their preview summaries (used in ArtifactPreviewSurface and summarizePreview) is the real cost. The builder should evaluate whether the `summarizePreview` function needs a legacy path.

### F2: `require()` in ESM package (severity: HIGH)

The `renderer-registry.ts` plan uses `require("./fallback-renderer.js")` in the `packages/web` package which is `"type": "module"`. This will throw `ReferenceError: require is not defined`. Use a static import for the fallback renderer (it is bundled in the main chunk per the plan) or use `await import()` with appropriate handling.

### F3: `any` casts in Zod discriminated union composition (severity: MEDIUM)

The plan uses `as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]]` which violates the project's "no `any`" rule. The builder should investigate whether `z.union()` (non-discriminated) can be used instead, or find a type-safe tuple construction. Document the decision with `@lore` if a cast is unavoidable.

## Findings for Phase 4 carry-forward

1. Verify preview JSON migration handles legacy shapes without silent data loss.
2. Verify fallback renderer import uses ESM-compatible syntax.
3. Verify Zod composition avoids `any` or documents unavoidable casts.
4. Verify HtmlRenderer iframe `sandbox` attribute is asserted in tests.
5. Verify `ArtifactCreatedEvent` is evaluated for `label` propagation needs.
6. Verify stories exist for new shell-tier renderer components (or explicit documentation of why they are exempt).
7. Verify the "blog_post" extensibility test clearly demonstrates the "no core file edits" claim.
