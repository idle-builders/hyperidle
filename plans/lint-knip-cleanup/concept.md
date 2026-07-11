# Concept: eslint-disable + knip-ignore cleanup

## Goal
Remove suppressions in `eslint.config.ts`-covered code and `knip.json` that mask real
smells (dead code, dead deps, unwired features, undeclared fragile deps), identified by
a full audit (2026-07-11). Leave every LEGITIMATE suppression untouched. Only act on
SMELL / QUESTIONABLE items below. Re-verify every claim with a fresh grep/read before
acting — the audit could be stale.

## Non-goals
- Do not touch any suppression marked LEGITIMATE in the audit (exhaustive-deps,
  `design/no-mock-data-*`, CJS `require()` in stories, `no-unknown-cast` zod bridge,
  `no-loop-func`, harness binaries, PGlite/drizzle transitive types, vitest setup files,
  fixture dirs, `app-runtime/**` barrel, etc).
- Do not build new lint/knip infrastructure (e.g. don't generalize the `no-mock-data-*`
  tracking-id meta-test mechanism to other rules) — out of scope for this cleanup.
- Do not flip `ignoreExportsUsedInFile` or touch the `__fixtures__/**` /
  `*.stories.tsx` ignore-asymmetry — both judged legitimate-in-substance, just
  under-documented; not worth churn here.

## Items

### A. ESLint — 1 questionable item
1. `packages/web/src/components/SessionView.tsx:604` — `design/no-op-button` disable
   with no tracking id. The button is a deliberate future-affordance placeholder
   (AM3 scope), not a bug. Fix: git-blame the line to find the PR/WP that introduced
   it; if a `gh` issue can be opened in this repo, `gh issue create` a short tracked
   follow-up ("Wire up Insert attachment picker in SessionView, AM3 scope") and append
   `-- tracked in #<n>` to the disable comment, mirroring the `no-mock-data-*`
   convention seen elsewhere in this file's neighbors. If `gh issue create` isn't
   viable in this environment, instead reference the relevant plan/doc path in the
   comment (e.g. `-- tracked in plans/AM3/...`). No behavior change.

### B. Knip — SMELL items (verify then remove)
2. **`packages/web` dead tiptap dependency block** (15 entries in `package.json` +
   matching `ignoreDependencies` in `knip.json`): `@tiptap/react`, `@tiptap/pm`,
   `@tiptap/starter-kit`, `@tiptap/extension-code-block-lowlight`,
   `@tiptap/extension-table`, `@tiptap/extension-table-row`,
   `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`,
   `@tiptap/extension-image`, `@tiptap/extension-placeholder`,
   `@tiptap/extension-link`, `@tiptap/suggestion`, `tiptap-markdown`, `lowlight`,
   `tippy.js`. Re-grep `packages/web/src` for each name first. If genuinely zero
   references, remove from `packages/web/package.json` dependencies AND from
   `knip.json`'s `workspaces["packages/web"].ignoreDependencies`, then `npm install`
   to update the lockfile. The real tiptap editor lives in `@hyperidle/design-system`,
   which declares these itself — leave design-system's copies untouched.

3. **`packages/server/src/middleware/response-validator.ts`** + its test
   `__tests__/response-validator.test.ts`: fully built Hono response-schema-validator
   middleware, never registered in `app.ts`, never called anywhere outside its own
   test. Confirm via fresh grep for `responseValidator(` and `registerResponseSchema(`
   across `packages/server/src` excluding the file itself and its test. If confirmed
   unwired: DELETE both files. Remove its entry from `knip.json`'s root `ignore` array.

4. **`packages/server/src/tools/live-proof-lanes.ts`** + its sole consumer test
   `packages/server/src/__tests__/AL7-harness-absent-fail.test.ts`: already personally
   verified — this AL7-era harness-availability probe (`getLiveProofLaneState`,
   `probeLiveProofHarnessAvailability`) duplicates the exact "absence is never a pass"
   logic that `packages/server/src/harness/__tests__/require-harness.ts`'s
   `requireHarness()` (AR1/AR7) actually enforces across every real harness-facing
   integration test today. It has zero non-test callers. DELETE both files. Remove its
   `ignore` entry from `knip.json`. Do NOT touch `require-harness.ts` or
   `AL7-no-kernel-executor.test.ts` (separate file, judged legitimate, keep as-is).

5. **`packages/server/src/services/knowledge/projections.ts`**: DB-writing service,
   audit found it exercised only by 2 integration tests, never called from any
   production route/service. Re-grep to confirm zero production call sites (routes,
   services, tools, event-bus subscribers). If confirmed: DELETE the file and any
   integration tests that exist solely to exercise it. Remove its `ignore` entry from
   `knip.json`. If grep instead turns up a real (if indirect, e.g. dynamic import)
   production caller, do NOT delete — leave the `ignore` entry and note the finding
   in the PR description instead.

6. **`ignoreIssues` dead exports** (4 file-level entries in `knip.json`, each mixing
   legitimate exports with dead ones — fix per-export, not per-file):
   - `packages/web/src/pages/review/ReviewRenderedInContext.tsx`: `ReviewEmailBody` /
     `ReviewEmailBodyProps` exports are used only by the matching `.stories.tsx`.
     Per this repo's own convention (a story is never a legitimate entry point),
     inline these into the story file directly and delete the exports from the
     component file. The main component export stays (used via canvas-registry).
     Once the dead exports are gone, remove this file's `ignoreIssues` entry
     entirely if the remaining exports no longer trip knip.
   - `packages/server/src/services/proposed-call-workflow.ts`: `consumeTailoredGrant`
     has zero references anywhere — re-grep to confirm, then DELETE it (and any
     private helper only it uses). Also check `handleUnconsumedGrantOnSessionEnd`
     (described as a "liveness net"): grep for any real (even indirect/dynamic-import)
     wiring to a session-end event subscriber. If it's genuinely never wired anywhere
     outside its own integration test, DELETE it too. If you find evidence it's
     *meant* to be wired to a real session-end event but the wiring was simply never
     landed (a live gap, not dead code), do NOT delete — leave it, drop it from this
     file's `ignoreIssues` list is not required in that case, and flag it clearly in
     the PR description as a follow-up needed, rather than silently deleting a
     half-finished safety feature.
   - `packages/server/src/services/session-lifecycle.ts`: `createSession` (zero refs)
     and `TERMINATION_PRECEDENCE` (defined, never read elsewhere) — re-grep to
     confirm, then DELETE both if confirmed dead. This is an actively-used core file
     with many legitimate exports — touch only these two, verify typecheck/tests
     still pass after removal given how central this file is.
   - After each of the three files above is cleaned, re-check whether its
     `ignoreIssues` entry in `knip.json` is still needed; remove entries that are
     no longer necessary, keep (with fewer flagged issues) whichever are still needed
     for genuinely-legitimate barrel-style exports.

7. **Root `@typescript-eslint/utils` dependency**: zero imports anywhere in the repo.
   Re-grep to confirm, then remove from the root `package.json` devDependencies and
   from `knip.json`'s root-workspace `ignoreDependencies`. Run `npm install` to
   update the lockfile.

### C. Knip — QUESTIONABLE items
8. **`packages/design-system/scripts/feedback-overlay.js`**: audit found zero live
   references and no matching npm script (its doc-comment references a `ds:feedback`
   script that doesn't exist in any package.json). Re-verify, then DELETE the file
   and remove its `ignore` entry from `knip.json` if confirmed orphaned. If it turns
   out something does reference it (e.g. a doc, a CI step, a manual dev workflow
   described in docs/), leave it and note why in the PR description instead.

9. **`packages/desktop` — `electron-builder` binary**: currently only reachable via
   ambient `npx` fetch, not declared as a dependency anywhere — this is what makes
   the `ignoreBinaries` entry "needed" in the first place, and it's fragile. Fix by
   making it explicit rather than removing the ignore: check what version is
   actually resolved/used today (lockfile, CI config, or `npx electron-builder
   --version` if runnable) and add `electron-builder` as an explicit devDependency
   in `packages/desktop/package.json` pinned to that version. Keep the
   `ignoreBinaries` entry (it's still a CLI binary knip can't see, invoked via an
   npm script) — the fix is declaring the dependency, not removing the ignore.

## Verification per item
After each deletion/change, run the narrowest relevant check before moving on
(`npm run check`, `npm run lint`, and/or `npm run test` scoped to the touched
workspace) rather than the full suite every time. Run the full `npm run verify`
once, at the end, before shipping.

## Definition of done
- Every SMELL/QUESTIONABLE item above is either fixed as specified, or explicitly
  left in place with a one-line reason recorded in the PR description (for any case
  where re-verification contradicted the audit).
- `npm run verify` green (check + lint + knip + test:all + build + attestation).
- No LEGITIMATE-verdict suppression touched.
- PR opened targeting `main`, CI green, per `/pipeline:ship`.
