# Architecture Critique: AI3 — One clock

ARCHITECTURE-SCORE: 9/10  rounds=1  score-line: SA:9 LI:9 AC:9 DM:n/a N:9 MD:8 FMC:9 S:9 V:9

**Verdict (Round 2, revised plan 589afc31): APPROVED.** All Round-1 findings — 1 CRITICAL + 3 WARNINGs — verified resolved *in the plan text*, not merely claimed. The revision introduced no new defects. Re-critique detail in the "Round 2" section at the end of this file. The Round-1 body below is preserved for the record.

---

ARCHITECTURE-SCORE (Round 0): 7/10  rounds=0  score-line: SA:8 LI:9 AC:8 DM:n/a N:9 MD:8 FMC:6 S:7 V:7

**Verdict: REVISE** (score ≥7 but one CRITICAL — the AC-2/AC-5 ESLint rule as specified is undeliverable and will block `npm run lint`). The plan is structurally sound — package boundary correct, migration list near-complete, module shape good — but the static-gate mechanism (the load-bearing enforcement for AC-2 and AC-5) is mis-scoped against the actual codebase and must be redesigned before `/write-tests`. One CRITICAL, three WARNINGs.

All claims below independently verified by grep against `packages/web/src` + `packages/design-system/src`.

## CRITICAL

- **[plan §"Test plan" AC-2/AC-5 + §"Ordered tasks" #7 + §Risks]** The proposed ESLint `no-restricted-syntax` rule "banning `Date.now()` subtraction and `getTime()` difference arithmetic … in web + design-system, allow-listing `format/time.ts`" is **undeliverable as a syntactic rule** and will false-positive on at least 5 legitimate non-formatting sites, breaking `npm run lint` (which gates merge):
  - `packages/web/src/components/ThreadSections.tsx:54-55, 117, 141-142` — flat-list **sort comparators** (`Date.parse(a.lastActiveAt) - Date.parse(b.lastActiveAt)`). Pure ordering, not formatting. There is no AST-distinguishable difference between "subtract two parsed timestamps to *sort*" and "subtract to *format age*".
  - `packages/design-system/src/ThreadShell.tsx:133, 138` — `computeSenderGrouping` window check (`tsMs - lastTimestampMs < SENDER_GROUP_WINDOW_MS`). Grouping logic, not display.
  - `packages/design-system/src/BlockActionsPopover.tsx:66, 93` — copy-feedback timer (`Date.now() - copiedAt < COPY_FEEDBACK_MS`). UI timing.
  - `packages/web/src/hooks/useSessionActivity.ts:131` — `Date.now()` as a **fallback default** for a missing timestamp. A naive `Date.now()` selector flags it.
  - `packages/design-system/src/Composer.tsx:29` — `Date.now().toString(36)` for client-key ID generation. Flagged by any `Date.now()` selector.
  - `packages/web/src/components/ThreadSections.tsx:201` — `now = Date.now()` default param (the test seam). Flagged.

  The plan's Risk block only acknowledges the *`toLocaleString`* false-positive (number formatting) and proposes narrowing to "Date-receiver calls". It does **not** acknowledge that the **relative-arithmetic half** of the rule cannot be expressed syntactically at all — "age formatting" and "sorting/grouping/timing by ms-diff" are the same AST. As written, task #7 either (a) fails lint on 5+ real sites, forcing per-line `eslint-disable` justifications that defeat the gate's "allowlist surface is empty" intent, or (b) gets silently weakened to only the `toLocale*` half, leaving AC-2's "no surface computes time arithmetic locally" **unenforced**.

  → **Fix:** Split the AC-2/AC-5 enforcement. (1) The deliverable static gate is the **import + `toLocale*` ban**: forbid `toLocaleDateString|toLocaleTimeString|toLocaleString` on `Date` receivers (architecturally distinguishable — `new Date(...).toLocale*`) and forbid importing the deleted `utils/format-time`/`utils/relative-time` paths, allow-listing `format/time.ts`. That cleanly enforces "no local absolute-date formatting" + "dead files stay dead". (2) For the relative-arithmetic half, AC-2's "no surface computes time *for display* locally" is **not statically enforceable** without semantic intent — downgrade it to a **review-checklist item + the AC-3 E2E** (every surface renders the shared label / `—` fallback), and state plainly in the plan that sort/group/timer ms-arithmetic is explicitly out of the rule's scope (it is not display formatting). The plan must name the 5 sites above as *legitimately exempt* so the builder doesn't try to migrate or disable them.

## WARNING

- **[plan §"Migration list" §Design-system #17 + §Risks "CommentRow null-time"]** The CommentRow contract change is under-specified and the plan flags it as "one-line, non-blocking" — but it is a **user-visible behavior decision**, not cosmetic. Today `formatMessageTime` returns `null` → the time span is *omitted* from the sender header. The plan's chosen resolution (gate span on `timeString !== TIME_PLACEHOLDER`) preserves the hide-behavior, which **contradicts AC-3 as literally written** ("an invalid timestamp renders a graceful placeholder on *every surface*"). Either AC-3 has an intentional CommentRow exception (placeholder = absence here) or the span should render `"—"`. → The plan must pick one and state it as the contract, not leave it as a reviewer's-choice footnote. Recommend: hide-on-invalid is correct for a sender-header chip (a dangling `—` in a name row reads as broken), and the plan should record this as an explicit AC-3 carve-out with a one-line rationale, then assert it in the E2E (CommentRow with bad time → no chip, no crash, no `—`).

- **[plan §"Migration list" §Web-absolute #15 + §"Test plan" AC-4]** Site 15 (`SessionActivityPanel.tsx:45`) migrates `toLocaleTimeString(undefined, {hour:"2-digit",minute:"2-digit",second:"2-digit"})` → `clockTime(entry.timestamp, {seconds:true})`, which hard-codes `hour12:false`. On a 12-hour locale this is a **visible behavior change** (today's output is locale-hour-cycle; new output is forced 24h). The spec permits "how it is formatted" to change, so this is in-scope — but the plan asserts the migration is a clean consolidation and does not flag the hour-cycle shift. → Add a line noting site 15 normalizes the activity log to 24h `HH:mm:ss` app-wide (intentional: a tool-call log reads cleaner in 24h), so the builder doesn't treat divergence from the old render as a regression, and so the AC-4 E2E expects `HH:mm:ss` not a locale-12h string.

- **[plan §"Plan reconciliation" + protectedTests]** The protected test `ArtifactTimestamp.test.tsx` "absolute" case asserts only `/2026/` and is correctly predicted to survive the R4 change. **Verified true.** But the test's *name* is "renders an absolute **ISO-style** date" — after R4 the output is `MMM D, YYYY`, not ISO. The assertion passes; the name becomes false. The plan's "assertions must not change semantics, may be relocated" protected-test rule technically permits a rename (name ≠ assertion), but the plan should explicitly authorize the builder to rename it, else the builder may leave a misleading-but-green test (a `/review` slop finding waiting to happen). → Add: "rename the `ArtifactTimestamp` absolute test case to drop 'ISO-style'; assertion unchanged."

## SUGGESTION

- **[plan §"Migration list" §Web-relative #6]** Enumerate **both** KnowledgeList call sites (`:699` and `:797`) — the table says "uses of relativeTime" singular. Both → `relativeShort`; no decision risk, but the builder should rewire both, and the import at `KnowledgeList.tsx:48` is missing the `.js` extension that the other import sites carry — worth a note so the migration's import-rewrite is uniform.

- **[plan §"Test plan" AC-1 E2E]** The AC-1 E2E ("seed fixtures with one shared `createdAt`, capture 4 surfaces, assert labels match within register") is the right proof, but the plan does not name the fixture-seeding mechanism. The repo's E2E suite (`packages/web/e2e/`) has a `fixtures.ts` and many seeded specs — the plan should point the builder at the existing seeding pattern (rather than "seed fixtures") so the E2E doesn't get hand-rolled. Verifiability is currently "write a test"-adjacent on the E2E half; tighten it to name the surfaces' fixture entry points.

- **[plan §"Security & abuse cases"]** Correctly scoped — pure formatter, no endpoint/mutation/path/URL/secret. The input-trust note (timestamps may be agent/DB-authored; `toEpoch` rejects non-finite → placeholder; never echoed as HTML, text-node only; removes the old `ArtifactTimestamp` echo-of-raw-value) is the *right* security observation for this WP and is genuinely an improvement (the old echo leaked arbitrary strings to the DOM). Good. CC-003 satisfied.

## Cross-checks (all pass)

- **Package boundary (Layer Integrity):** VERIFIED. `packages/design-system/package.json` depends on `@hyperidle/shared` (`"@hyperidle/shared": "*"`) and already imports from it (`status-mapping.ts`, `ThreadShell.tsx`, `ArtifactEmbed.tsx`, `CommentRow.tsx`, etc.). `shared` has zero UI deps and already hosts `format/money.ts`, `bet.ts`, `artifact-cost.ts`. `packages/shared/src/format/time.ts` is the correct, only-sane home. No inverted dependency, no new package. The plan's "design-it-twice not run — decision is forced" is honest, not theatre: no alternative respects the boundary. LI:9.
- **Contract honored (old names die):** VERIFIED. The plan deletes `utils/format-time.ts` + `utils/relative-time.ts` (the semantically-swapped names) and the import sites are enumerable — confirmed exactly 3 external import sites survive (`KnowledgeList:48`, `AgentProfile:41`, `WorkTeam:51`) plus the test file. Plan rewires all. Naming N:9.
- **Migration completeness:** The 17 formatting sites in the plan match my independent grep of all `toLocale*` + age-arithmetic *formatting* sites. No formatting site missed. (The 5 non-formatting arithmetic sites in the CRITICAL are correctly NOT migration targets — they're sort/group/timer logic — but the plan must name them as rule-exempt, which is the CRITICAL's point.)
- **No scope creep:** No ticking, no i18n (locale = runtime default, fixed *options* only — correct reading of AC-4), no date pickers. No reach into AI4 status, AG5/6/7. Stories/fixtures hardcoded strings correctly ruled out-of-scope (props, not arithmetic). S:7 (the only over-build risk is the un-deliverable rule, covered in CRITICAL).
- **Module depth:** 5 named exports + `TIME_PLACEHOLDER` + `TimestampInput` type, one internal `toEpoch`. Small surface, real complexity hidden (parse-guard, ladder, memoized `Intl.DateTimeFormat`). The `clockTime({seconds})` and `absoluteDate`/`absoluteDateTime` split is the right granularity — greppable, tree-shakeable, no per-consumer wrapper. MD:8.
- **Test ordering (Verifiability):** RED-first (task #1 writes failing `time.test.ts` before task #2 creates the module). Protected-tests block populated (`ArtifactTimestamp.test.tsx`). AC-3 fallback table is concrete (exact inputs → exact outputs). V:7 — docked because the AC-2 enforcement is named as a test/gate that can't be built as specified (CRITICAL), and the AC-1/AC-3 E2E verification is named but its fixture mechanism isn't pinned (SUGGESTION).

## What's working well

- The package-boundary section is exemplary: it states the constraint, verifies the dependency graph against `package.json`, names the existing sibling pattern (`money.ts`), and honestly declares design-it-twice inapplicable because the decision is forced — no straw-man alternative. This is how a forced decision should be documented.
- The implementation contract is verbatim-executable: exact ms thresholds, floor-everywhere, the `relativeLong = relativeShort + " ago"` guarantee for AC-1, and the per-register fallback rules. A builder can implement this without re-deciding anything — which is the point of the "register assignment is a judgment call, builder does not re-decide" closing note.

---

# Round 2 — Re-critique of revised plan (commit 589afc31)

ARCHITECTURE-SCORE: 9/10  rounds=1  score-line: SA:9 LI:9 AC:9 DM:n/a N:9 MD:8 FMC:9 S:9 V:9

**Verdict: APPROVED** (≥7, no CRITICAL). Every Round-1 finding verified *present and correct in the plan text* — not just asserted in the commit message. Every claim re-grepped against `packages/web/src` + `packages/design-system/src`. The revision added no new defect: the exempt-sites table matches reality line-for-line, the deliverable ESLint rule is now actually expressible and provably green-after-migration, and the CommentRow contract is consistent between `architecture.md` and `approved.md`.

## CRITICAL resolution — ESLint rule (was: undeliverable / 6 false-positive sites)

**RESOLVED.** The plan now splits AC-2/AC-5 enforcement into a deliverable static half + a review/E2E half, exactly as Round 1 prescribed. Verified point-by-point:

- **§"AC-2/AC-5 static gate (split)" + §"Migration list" ‡ + task #7 + AC-2/AC-5 test rows + §Risks** all now carry the split, consistently. No section still claims a single arithmetic-banning rule.
- **The deliverable rule is now expressible.** It bans `toLocaleDateString|toLocaleTimeString|toLocaleString` **on `Date` receivers** + imports of the deleted `utils/{format-time,relative-time}`. I grepped every `toLocale*` site in scope (8 total): **all 8 are the inline `new Date(...).toLocale*()` shape** (`SessionActivityPanel:45`, `WorkRoutine:168/220/227/415`, `AgentProfile:118/392`, `CommentRow:221`). This is AST-distinguishable (`CallExpression` → `callee.object` is a `new Date()` `NewExpression`) and `no-restricted-syntax` can express it. The narrowing also means `Number.prototype.toLocaleString` can never be flagged — and in fact no Number/Array `toLocaleString` site exists in scope, so the gate has zero false-positive surface even before the narrowing.
- **Provably green after migration.** All 8 in-scope `toLocale*` sites ARE the migration targets (sites 9-17). Post-migration, zero `Date`-receiver `toLocale*` remain in `web/src` + `design-system/src` → the rule passes with an empty allowlist surface. The allowlisted `format/time.ts` lives in `shared/src`, outside the rule's scope, so the allowlist is belt-and-suspenders, not load-bearing — harmless.
- **The 6 exempt arithmetic sites are named and verified.** Re-grepped each: `ThreadSections.tsx:54-55,117,141-142` (sort comparators) + `:201` (`now=Date.now()` default-param seam), `ThreadShell.tsx:133,138` (`computeSenderGrouping` window check), `BlockActionsPopover.tsx:66,93` (copy-feedback timer), `useSessionActivity.ts:131` (`Date.now()` fallback default), `Composer.tsx:29` (`Date.now().toString(36)` client-key). Every line matches the plan's exempt table exactly. The plan states the builder does NOT migrate, does NOT `eslint-disable`, and the rule does NOT touch them — and §Risks adds the guard "if a source `eslint-disable` is needed, the rule is mis-scoped — fix the rule, not the call site." Correct.
- **The arithmetic half is correctly downgraded** to a `/review` checklist line ("no migrated formatting surface retains inline age arithmetic") + the AC-3 E2E (each surface renders the shared label / `—`). The plan plainly states sort/group/timer ms-arithmetic is out of the rule's scope. This is the only honest position — intent is not statically recoverable.

## WARNING 1 resolution — CommentRow null-render contract

**RESOLVED, and consistent across both artifacts.** The new §"CommentRow null-render contract (binding)" in `architecture.md` declares the decision: **hide the chip on invalid input, do NOT render `"—"`** — an explicit AC-3 carve-out, with rationale (a dangling `—` beside a name reads as a broken field; the chip has no reserved cell so absence is its native no-value state). Cross-checked `approved.md` §R3 "CommentRow invalid-time contract (binding)": **same decision, same rationale, same carve-out framing.** No contradiction between the two documents. The mechanism (`clockTime` returns `TIME_PLACEHOLDER` → CommentRow coerces back to `null` before the existing `{timeString ? <span> : null}` render) matches the real code: `CommentRow.tsx:243` assigns `timeString`, `:270` is the `{timeString ? … : null}` gate. The negative-space E2E assertion is specified (row renders, no chip, no `—` glyph, no crash) — distinct from the other surfaces' "renders `—`" assertion. This is now a binding contract, not a reviewer's-choice footnote.

> One micro-note (not a finding): today's `formatMessageTime` uses `toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})` — locale hour-cycle, minute precision. The plan migrates it to `clockTime(message.createdAt)` (seconds:false = `{hour:"numeric",minute:"2-digit"}`, no `hour12`). Byte-identical options → CommentRow's *visible* clock output is unchanged by the migration (only the invalid path changes). Plan is internally correct; worth the builder knowing the happy path is a no-op render.

## WARNING 2 resolution — SessionActivityPanel 12h→24h shift

**RESOLVED.** The new note ‡ under §"Migration list" documents the shift explicitly: today `SessionActivityPanel:45` uses `toLocaleTimeString` with no `hour12` override (verified — locale hour-cycle, would render `02:34:07 PM` on en-US); `clockTime(seconds:true)` hard-codes `hour12:false` → `14:34:07`. Plan flags it as an intentional, in-scope 12h→24h normalization (not a regression), and the AC-4 row now asserts the E2E expects `HH:mm:ss` 24h, not a locale-12h string. `approved.md` §R3 carries the same note. The plan also correctly distinguishes the minute variant (`clockTime(seconds:false)`, CommentRow) which *keeps* locale hour-cycle — so R3 is parameterized by both precision AND hour-cycle, stated as deliberate.

## WARNING 3 resolution — ArtifactTimestamp test-name drift

**RESOLVED.** §"Test plan" now has an "Authorized test rename" block explicitly authorizing the builder to drop "ISO-style" from the absolute case name, assertion (`/2026/`) unchanged, within the protected-test rule (name ≠ assertion semantics). Verified the target exists: `ArtifactTimestamp.test.tsx:33` reads `it("renders an absolute ISO-style date when format='absolute'", …)` and `:42` asserts only `/2026/` — so the rename is name-only and the test stays green. `protectedTests` array still populated. Correct.

## SUGGESTION resolutions

- **Both KnowledgeList sites:** RESOLVED. Migration row 6 now names import `:48` + **both** call sites `:699` and `:797` (verified: `grep` shows exactly `:48` import, `:699`/`:797` calls, both `relativeTime(item.updatedAt)`), and notes the `.js`-extension import-convention normalization.
- **E2E fixture mechanism:** RESOLVED. AC-1/AC-3 rows + task #8 now name `packages/web/e2e/fixtures.ts`, the `import { expect, test } from "./fixtures"` pattern, and `page.route()` LIFO override. Verified `fixtures.ts` exists, carries the `@lore M3` header, mocks `/api/threads`, and documents the LIFO last-registered-wins override the plan relies on. No hand-rolled harness.
- **Security block:** unchanged, still correct (CC-003 satisfied) — pure formatter, input-trust addressed via `toEpoch` non-finite → placeholder, text-node only, old raw-value echo removed.

## New-defect scan (did the revision break anything?)

- **Exempt table vs reality:** every one of the 6 sites + their line numbers match current source. No drift.
- **Cross-document consistency:** CommentRow contract, the 24h note, and the register model agree between `architecture.md` and `approved.md`. No fork.
- **Rule scope vs migration completeness:** the deliverable lint rule's scope (`web/src` + `design-system/src`, Date-receiver `toLocale*`) is exactly the set the migration empties — no un-migrated site is left to trip the gate, and no in-scope site is missed. Self-consistent.
- **Task ordering intact:** RED (#1) still precedes GREEN source (#2); deletions/migrations (#3-6) precede the static gate (#7) and E2E (#8); verify last (#9). No inversion introduced.
- **No new scope creep:** the split added enforcement *clarity*, not new surface. No ticking, no i18n, no new package. S unchanged-positive.

## Residual SUGGESTION (non-blocking, does not affect verdict)

- **[§"AC-2/AC-5 static gate (split)" #1 / task #7]** The plan should state the `no-restricted-syntax` selector matches the **inline `new Date(...).toLocale*` shape specifically** (callee.object is a `NewExpression` with callee `Date`), not arbitrary Date-typed *variables* (`const d = new Date(); d.toLocaleString()`). Grep proves all 8 real sites are the inline shape, so coverage is 100% today — but a future variable-held-Date formatter would slip the gate. One sentence pinning the selector shape (and noting the AC-3 E2E backstops any escapee) closes the gap. Not a blocker: zero such sites exist now, and `/architecture` need not re-run for it — the builder can pin the selector wording at `/write-tests`.

## Round-2 dimension notes (deltas from Round 0)

- **SA 8→9, FMC 6→9, S 7→9, V 7→9:** the CRITICAL that docked FMC/V/S is resolved with a deliverable, reality-checked gate; the AC-1/AC-3/AC-4 verification methods are now pinned to a named fixture harness and exact regex/negative-space assertions. AC 8→9: the CommentRow carve-out and 24h normalization are now binding contracts with E2E assertions, closing the two under-specified behaviors.
- **LI 9, N 9, MD 8** unchanged — already strong in Round 0, untouched by the revision.
- **DM n/a** — no schema (pure formatter).

## What's working well (Round 2)

- The split-enforcement section is a model of honest static-analysis scoping: it names exactly what a syntactic rule *can* prove (Date-receiver formatting + dead imports), names what it *cannot* (display-vs-sort intent), lists the 6 sites the naive rule would wrongly catch, and routes the unprovable half to the right gate (review + E2E). No security-theatre lint rule.
- Both binding contracts (CommentRow hide-on-invalid, 24h activity normalization) are now stated identically in `architecture.md` and `approved.md` with rationale and an E2E assertion each — the producer closed the loop the critique opened without introducing a fork between the two artifacts.
