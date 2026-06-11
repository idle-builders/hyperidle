# AF15 — Retro: Settings Reachability and Persistence

**Workpackage:** AF15 — Settings reachability and persistence  
**Branch:** `feat/AF15-settings-reachability`  
**Date range:** 2026-06-05 → 2026-06-12 (7 calendar days)  
**Phases:** Design (1d) → Critique (1d) → Revision (1d) → Architecture → Critique (1d) → Tests (red) → Build (green) → Review Phase 4 → Rework (1d) → Ship.

---

## Pipeline cost signals

### Timeline & effort
- **Total calendar:** 7 days (design → ship)
- **Working blocks:** design (6h), architecture (12h), critique R1+R2 (8h), revision (6h), tests (3h), green-phase build (4h), code review R1 (2h), rework (1d), ship + retro (2h)
- **Commits:** 10 total; 1 design, 1 architecture, 1 critique, 1 revision-note, 1 tests, 1 green-feat, 1 code-review, 1 rework, 1 retro
- **Phases run:** All 6 (design → arch → critique → revision → TDD tests → green code → review)

### Review cost
- **Phase 2 (Critique):** 2 WARNING findings (both accuracy/spec gaps, no CRITICAL)
  - WARNING-1: stale `@lore` claim re: AppShell + `SETTINGS_SECTIONS` (false — grep missed binary file)
  - WARNING-2: `PatchModelGatewaySchema` refinement under-specified (high-bug-risk change)
- **Phase 4 (Code Review):** 1 WARNING finding (plan deviation + false justification)
  - WARNING-1: builder kept dead `SETTINGS_SECTIONS` catalog against plan task 6, justified with false grep claim (self-contradiction)

### Notable friction & escalations

**High-severity process signal — binary-grep false negative:**
- **The trap:** Plain `grep` and `git grep` (text mode) classify `AppShell.tsx` as BINARY due to a control-character regex at line 88 (the `sanitizeRouteId` function's `if (/[ --]/.test(id))` guard).
- **The false negative:** `git grep SETTINGS_SECTIONS` reports ZERO hits for AppShell.tsx. The plain-text-mode tool suppresses results for binary files silently.
- **The hazard:** Code review used plain `git grep` to verify "zero live consumers" of `SETTINGS_SECTIONS`, concluding it was dead and should be deleted per the plan.
- **The near-miss:** If the deletion had been merged, `AppShell.tsx:27` (`import { SETTINGS_SECTIONS, type SettingsSectionId } from "../settings/settings-types.js"`) would have broken, deleting live code.
- **Root cause:** The review process trusts grep as an oracle of "no references." Grep is fragile against control bytes; it was explicitly noted as a risk in the architecture-critique (lines 44–45) but the note was ignored during code review.
- **Resolution:** Builder caught the breakage during verify (TypeScript: unused import, knip: unused export). Added a detailed `@lore` comment documenting the binary-grep trap (settings-types.ts:39–45) and kept the code. Committed as `9ee860e0` with explicit annotation.

**Impact:** 
- This is a **recurring-risk process signal** for any future code-review pass that uses plain grep on a codebase with control-character regex patterns.
- The grep pattern used by reviewers is not a reliable oracle. Text-mode tools fail silently on binary files.
- Recommendation for `/compound`: Add a **custom ESLint rule or grep wrapper** that auto-detects binary files and warns, or switch code-review grep to use `git grep -I` (include binary files, show them marked).

---

## Observations

### Design phase (1 day)

**Strengths:**
- Honest-affordance audit in approved.md §2 was exemplary — enumerated every Settings control + its persistence path, concluded "no redesign needed, only a guarantee test." Restrained scope.
- Rejected-directions (§6) substantive: `SettingsTeams` stub, auto-create default edge (User Sovereignty), free-text team name (validation). Grounded reasoning.
- Plan reconciliation table (architecture §Plan reconciliation) resolved 7 spec-vs-reality discrepancies upfront (dead types, Models clobber, Backend hardcode, setup duplicates, org targets, email-digests removal, mute persistence scope).

**Gaps:**
- Section ordering inconsistency: §1 header says "Models → Agents → Assistant"; §1 placement diagram says "Models → Agents → Assistant → Appearance" (contradictory). Architecture plan (task 5) also wavers. Builder had to coin-flip the correct order (Agents is AFTER Assistant per approval, before in the spec diagram — spec was ambiguous).
- Dead-loop fix claim in approved.md §3 asserted "No Work affordance creates teams" but the justification cite was indirect (verified code read in critique, not in design). A pre-implementation verification by the designer would have caught this and hardened the claim.

---

### Critique phase (2 days: Phase 2 + revision round)

**Effective findings:**
- WARNING-1 (false `TeamSetting`/`UserSetting` knip-dead claim) — caught by re-reading settings-types.ts and `useSettings.ts`. The earlier draft claimed types were dead; code inspection proved they're consumed via `SettingsData` fields. **This was the critic's own error, corrected mid-review.** Builder followed the correction faithfully.
- WARNING-2 (`PatchModelGatewaySchema` refinement under-specified) — correctly identified the highest-bug-risk change (3 refinement predicates for partial-tier validation) lacked concrete spec before green phase. Builder addressed with explicit predicate enumeration in the revision round (with text description of each guard).
- WARNING-3 (protected-tests inventory) — flagged that tests using `SettingsData` shape (useSettings.test.ts, AppShell.*-settings.test.tsx) would drift if types changed. Builder added protected-tests block enumerating them (semantics frozen).

**Process strengths:**
- Round-2 critique picked up mid-revision note and refined it further (baseUrl-required validation: patch-level vs. merge-level choice). Critique explicitly resolved both options and chose patch-level with reasoning.
- Critique prompted a design-it-twice section on both Models merge and teams guard (both with real rejections grounded in security/contracts).

---

### Code review phase (1 day: Phase 4 R1 + rework)

**R1 findings (WARNING-1 only):**
- Builder kept `SETTINGS_SECTIONS`/`SettingsSection`/`SettingsSectionId` despite plan task 6 + design §1 explicitly directing deletion.
- Builder's justification: *"grep missed AppShell.tsx (binary file), plan's 'zero live consumers' claim was incorrect."*
- **Fact check:** Plain `git grep SETTINGS_SECTIONS` in AppShell.tsx returns ZERO hits. However, `AppShell.tsx:27` does import them. Grep failed silently (binary-file classification).
- **Self-contradiction:** Builder also removed the identical claim from SettingsWorker.tsx:9-12 as "stale and grep-disproven," then re-asserted it in settings-types.ts:13-17 to keep the dead code. **One claim was true (AppShell reference exists), but the builder's method (grep) could not prove it.**

**Resolution:**
- Builder ultimately kept SETTINGS_SECTIONS with a detailed `@lore` annotation (settings-types.ts:39-45) documenting the binary-grep trap. TypeScript `npm run check` and `knip` both confirmed the import is live.
- The decision (keep the catalog) is functionally correct. The justification (false grep claim) is problematic, but the lore capture is exemplary.

**ACs outcome:**
- All 6 ACs verified PASS.
- AC-1 (launch sections reachable; non-launch removed): PASS (both sections mounted) / WARNING (catalog not deleted per plan — but functionally correct; live reference proved by TS + knip).
- AC-2 through AC-6: PASS.

---

## Cost signals for `/compound`

### Pattern: grep fragility (recurring-risk)

**Observations across this retro and prior retros:**
1. **AF15 WARNING-1 (this retro):** Plain `git grep` misses `SETTINGS_SECTIONS` in AppShell.tsx due to control-character binary-file classification. Code review concludes "zero references" and recommends deletion; builder catches via TypeScript.
2. **T3 friction (retro-log.jsonl:44):** E2E fixture migration incomplete — builder grepped `packages/web/src/` but missed `packages/web/e2e/` fixtures. Grep scope too narrow.
3. **U6 friction (retro-log.jsonl:75):** Stale references scattered across 6 files; builder could have automated grep sweep in Task 11 before declaring done.

**Pattern summary:**
- Plain `grep` is unreliable for code-review "zero references" verdicts when binary files exist in the repo.
- Grep scope (which paths to search) is a constant source of missed files — builders forget to include `e2e/`, migration files, etc.
- Recommendation: **Formalize grep usage in code-review process:**
  - Use `git grep -I` (include binary files, marked in output) instead of `-i`.
  - Use the Read tool or `sed -n` to inspect suspected binary files rather than trusting grep absence.
  - Provide builders with a grep-sweep checklist (list all directories to include).
  - Consider adding a custom ESLint rule (`design/no-untracked-symbols`) that statically validates dead-code claims by scanning the project graph.

---

### Pattern: critique → implementation gap (process-discipline)

**Observations:**
1. **AF15 Phase 2 → green-phase:** Critique flagged "knip-dead" was false; revision notes corrected it; builder implemented based on correction (correct behavior, good loop-closure). But the misstatement was introduced by the critic mid-review, causing a revision cycle.
2. **Prior pattern (retro-log.jsonl:79, U11):** "Pipeline discipline failure pattern recurring (R8, U6, T5, T3, U11 all jumped to verify/ship before code review)." The inverse: when critique findings are unclear, builders have no clear signal to revise. Critique must be **prescriptive, not vague.**
3. **AF15 specifically:** Critique WARNING-2 (refinement under-specified) was prescriptive (named the 3 predicates; specified guards); builder implemented exactly. **Prescriptive critique reduces revision cycles.**

**Recommendation:** Document critique style in the skill (`/architecture-critique`) with emphasis on:
- Every "this is unspecified" finding must list exactly what must be specified (not "specify the schema").
- Every "this might have a bug" finding must cite the exact line or pattern.
- Every rejection of an option must give the real reason (not "this seems wrong").

---

### Pattern: TDD red-phase discipline (working-process, confirmed)

**AF15 observation:**
- Tests written before implementation (1 commit `771d44bc` with 22 web + 21 integration tests, all failing).
- Green-phase implementation (1 commit `4f8b4437`) made all tests pass on first run.
- Code review found 0 MUST-FIX blockers; only 1 WARNING (plan deviation, functionally sound).

**Correlation with prior retros:**
- Matches N4 (success), R2 (success), R5 (success), R6 (success), S1 (success), S2 (success), T1 (success), U4 (success), api-typesafety (success), T5 (success), U6 (success), U11 (success), W2 (success, pattern=CC-010), X2 (success, pattern=CC-010).
- **Tagged as CC-010 in 12+ prior retros:** "TDD red phase eliminates rework." 

**Cost signal:** Red-phase discipline is the single highest-correlation indicator of "code-review PASS on first round." No false negatives observed in retro-log; all instances of TDD red phase → green pass → minimal code-review findings.

**Recommendation for `/compound`:** Formalize as a **required gate:** no green-phase code review without red-phase tests. Make the red-phase test commit a gating rule in the skill.

---

## Lore entries added

**Binary-grep trap (settings-types.ts:39-45):**
- Documented that control-character regex in AppShell.tsx:88 causes git/grep to classify the file as BINARY.
- Text-mode grep silently omits results for binary files, creating a false "zero references" impression.
- Plain grep is not a reliable oracle of live references; use Read tool or `sed -n` for AppShell.tsx.
- This trap nearly caused deletion of live code. Escalated as a recurring-risk process signal.

**AF15 specific decisions (captured in lore throughout):**
- Models merge (server-config.ts): per-tier, per-field merge preserves stored apiKey on omitted patch; drops on provider-away.
- Setup idempotency (teams-routes.ts): first-team guard (not name-keyed).
- Org teams source (org.ts): GET returns `teams:{id,name}[]` via teamMembers⋈teams join.
- SettingsOrgChart solo founder path: `function` mechanism (free-text role) is the zero-dependency first-relationship path (no second human, no team required).

---

## Definition of done & verification

**All 6 ACs verified:**
1. ✅ **AC-1 (launch sections reachable):** Both `SettingsAgents` and `SettingsWorker` mounted in SettingsPage with testids. Non-launch sections absent or explicitly removed.
   - **Caveat:** `SETTINGS_SECTIONS` catalog kept despite plan deletion directive. TypeScript import + knip prove live reference. Functionally correct, plan-deviation noted, lore documents why.
2. ✅ **AC-2 (one-tier edit preserves adjacent key):** Integration test AF15-model-gateway-partial.integration.test.ts:145 proves `reasoning.hasApiKey` true after `fast.model` PATCH; :176 proves provider-away drops key.
3. ✅ **AC-3 (Backend reports actual mode):** SettingsBackend.test.tsx mocks `window.__HYPERIDLE__.backendMode`; three states (web, local, shared) labeled correctly.
4. ✅ **AC-4 (setup idempotency):** teams-routes.ts integration test asserts team count=1, teamMembers=1, unchanged after 2nd POST; fresh DB still 201.
5. ✅ **AC-5 (persistent toggle/non-persistable not shown):** Notifications mute persists factory-level across reload (per-user deferred per architecture scope). Email-digests confirmed absent.
6. ✅ **AC-6 (first org relationship creatable from UI):** org.ts GET returns `teams:{id,name}[]`. SettingsOrgChart deletes `deriveTeams`, sources select from data.teams. Solo founder can create `function` edge (zero dependencies). E2E + integration tests prove team-edge 201, function-edge 201 + round-trip.

**Verify green:**
```
npm run check — 12/12 packages PASS
npm run lint — PASS (baseline)
npm run test:all — 22 web + 21 integration PASS
```

---

## Severity & escalation

- **CRITICAL:** None. All ACs met, no blocking defects.
- **HIGH:** Binary-grep process signal. **Escalate to /compound for grep-reliability fix.** This is a recurring fault (3+ prior instances) and a near-miss that deleted live code.
- **MEDIUM:** 
  - Critique self-error (knip-dead false claim, corrected mid-review). Reviewer process: add a "assume code is correct until proven otherwise" review stance.
  - Plan ambiguity (section ordering) required builder coin-flip. Specification discipline: resolve all contradictions in design/arch before code.

---

## Success patterns confirmed

- **Prescriptive critique (Phase 2):** When critique WARNING findings are specific (name the predicates, cite the line), revision is fast and builder implements correctly.
- **Red-phase tests (TDD):** Every workpackage with red-phase tests before green-phase code review passes on first round (zero MUST-FIX).
- **Architecture reconciliation table:** Plan's upfront spec-vs-reality resolution eliminated mid-stream surprises. Builder started with correct assumptions.

---

## Recommendations for future workpackages

1. **Grep safety (process):** 
   - Switch code-review grep to `git grep -I` (include binary files).
   - Provide scope checklist (include packages/web/src/, packages/web/e2e/, packages/server/src/, etc.).
   - Use Read tool or `sed -n` for suspected binary files rather than relying on grep absence.
   
2. **Critique prescriptiveness:**
   - Every unspecified finding must list what must be specified (not "specify it").
   - Every bug-risk finding must cite the exact line/pattern.
   - Every rejected option must state the real reason.

3. **Red-phase gating:**
   - Formalize: no code review without red-phase tests.
   - Make test commit a requirement in the skill.

4. **Specification precision:**
   - Design and architecture must resolve all contradictions before "approved" (section ordering here was ambiguous).
   - Use reconciliation tables upfront (AF15 example: 7 items settled before code).

