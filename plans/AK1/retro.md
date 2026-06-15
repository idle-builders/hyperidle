# AK1 Retro — Harness-vocabulary rename rollout

**Workpackage:** AK1 (harness-vocabulary rename — cross-cutting, behaviour-preserving rename to locked nouns per `docs/architecture/kernel-strategy-split.md` §4)

**Branch:** `feat/AK1-harness-vocabulary-rename`

**Commit phases:** 8 commits across 4 phases (plan, critique, build, review, minors).

**Diff scale:** 271 files, ~6700 insertions, ~2100 deletions. Large mechanical rename across all layers.

---

## Cost Signals & Timeline

| Phase | Commits | Focus | Outcome |
|---|---|---|---|
| **Phase 1: Scaffolding** | 1 | Pipeline WIP setup | `plans/AK1/` created, branch ready |
| **Phase 2: Design** | 2 | Architecture + critique | Locked nouns inventory, two CRITICAL gaps caught |
| **Phase 3: Build** | 3 | Implementation + testing | All 6 ACs met; guard validates renamed code |
| **Phase 4: Review** | 2 | Code review + minors | Three MINOR residuals addressed |

**Cost in phases:** 4. **Fix rounds required:** 2 (critique → plan revision; code review → builder fix-up commit).

---

## What Went Well

### 1. **Static guard as AC enforcement — the right tool for "no dangling references"**

The plan correctly identified that "no dangling run-unit identifiers" is a static codebase property, not a runtime assertion. The builder copied `nimmly-guard.ts` structure exactly, creating `harness-vocab-guard.ts` with:
- Banned regex patterns for dropped terms (`/\bsoul/i`, `/materializ/i`, `/\{\{workspace\}\}/`)
- Three-tier workspace ban (typed identifiers only; bare `workspace` too noisy)
- Explicit allowlists for legitimate kept terms (npm workspaces, `/workspace` cwd, external flags)
- Unit test (`AK1-harness-vocab-guard.test.ts`) asserting on guard behavior

**Result:** Guard wired into `verify` script; exits 0 on full tree. This is a reusable precedent for future cross-cutting renames (the "dropped-terms guard" pattern is now in the playbook).

### 2. **Bottom-up step order kept the tree compiling at every checkpoint**

The plan's ordered task list (schema → shared → fabric → server/harness → server/tools → session-provisioning → routes → web → eval/docs → guard) forced compiler-enforced validation. `SessionConfig.workspacePath → sandboxPath` in shared (step 3) rippled downstream, blocking step 5 (server/harness adapters) until all field consumers were updated. **No dead-end compilation breaks; every step was shippable.**

### 3. **AGENTS.md dual-write default is behaviour-safe**

The plan's decision to "write BOTH AGENTS.md + CLAUDE.md, identical content" was conservative and correct. Builder implemented it; the dedicated test `AK1-dual-write.test.ts` proves both files exist in sandbox root with byte-identical content. Every harness auto-discovering CLAUDE.md keeps working; the Linux-Foundation AGENTS.md standard surface is satisfied. **Zero behaviour change; AC met with a compatibility layer.**

### 4. **Protected tests held the behaviour-equivalence AC**

The plan explicitly froze value semantics on `X5-cli-harness-adapter.test.ts` + `docker-workspace-adapter.security.test.ts`. Builder correctly updated only identifier/label strings (`{{workspace}}→{{sandbox}}`, `workspacePath→sandboxPath`), leaving all S5/S6 shell-injection assertions byte-identical. `npm run check` confirmed all types renamed; pre-existing test suite renamed and re-ran green. **Behaviour-preserving rename proven.**

---

## What Cost Extra Rounds

### **Round 1: Architecture Critique caught 2 CRITICAL classification gaps (plan revised)**

The critique identified:

1. **`{{workspace}}` mis-classification as external.** The plan KEEPed `{{workspace}}` calling it "aider/goose/opencode's own flag." Verified false: it's HyperIdle's OWN template-variable DSL token (`cli-harness-adapter.ts:29`). The plan did not decide whether to rename it. **Fix in plan:** move to RENAME list, decide on `{{sandbox}}`. Builder then renamed the token + all resolver calls + test assertions.

   **Why it slipped:** The inventory conflated the **external contract** (goose's bare `--workspace` flag, which stays) with **our DSL token** (which names the run-unit and should move). Grepping for `{{workspace}}` was implicit, not explicit — no dedicated search for "HyperIdle-defined template tokens."

2. **Missing second `workspacePath` on `CliHarnessConfig`.** The plan listed session-provisioning `workspacePath` and `ToolContext.workspacePath` but never named `cli-harness-adapter.ts:170`'s `config.workspacePath` — a different field on a different type. The plan's step 5 ("server/harness") did not enumerate this file. Builder could have missed it; the guard didn't catch it (bans `/workspacePath/` but assumes typed-identifier bans are sufficient).

   **Why it slipped:** The inventory was itemized **by type** (WorkspaceAdapter, WorkspaceHandle, ToolContext) but the builder needed an **itemized by file** checklist. The plan assumed "bare fields caught indirectly"; they weren't.

**Fix approach (critique → plan revision):** The architect re-read `cli-harness-adapter.ts`, added explicit decision on `{{workspace}}` → `{{sandbox}}`, and added the file to Term-2 inventory with `CliHarnessConfig.workspacePath → sandboxPath` and `{{workspace}}` token together (making the two inseparable in the builder's mind).

**Lesson for process:** For large mechanical renames, the inventory should distinguish **by term + by surface (type/field/constant/comment/token)** + **by file** — a three-dimensional grid. Type-level enumeration misses field-name collisions and DSL tokens. The risk of "assume the compiler catches it" is highest when a field is just a string (`workspacePath` is happy on any type).

### **Round 2: Code review caught a plan-specified rename the builder missed (fix-up commit)**

The code review identified **M1: `SandboxHandle.workspaceId` field not renamed to `sandboxId`.** This is the ID **of** the sandbox (its identity), and the plan explicitly listed it (`architecture.md:63`). The builder renamed the class but missed the field.

**Why it slipped:** The field is internal-only (no wire/DB exposure), and the guard bans `/workspacePath/` + typed identifiers but not bare `workspaceId`. A field with a generic name (`workspaceId` could exist on any adapter type) slipped past.

**Fix:** Builder added a fix-up commit (`fe7c365c fix(AK1): apply review minors`) completing the rename (`workspaceId → sandboxId`) and updating ID prefixes (`local-ws-` → `local-snd-`, `docker-ws-` → `docker-snd-`). Test: `npm run check` confirms.

**Lesson for process:** When a plan-specified rename is a field (especially a simple generic-name field like `workspaceId`), the builder should echo the plan's rename checklist as a self-check before sign-off. A grep against the plan's own term list (`workspacePath`, `workspaceId`, `WorkspaceHandle`, etc.) would have caught the miss. Renaming is tedious and mistake-prone; a self-check grep is free.

---

## Process Observations Worth Feeding to `/compound`

1. **For large mechanical renames (100+ files, 4+ terms), the inventory step should explicitly distinguish `internal-vs-external` token usage and `term-by-file` grid.**
   - A **term** can appear as: type name, field name, DB column, constant, comment, external flag, our DSL token, test fixture.
   - A **file** can carry multiple terms (session-provisioning touches all four simultaneously).
   - Grepping "by term" misses field collisions; grepping "by file" misses cross-file patterns.
   - **Mitigation:** Make the inventory a table with **[Term × File]** cells marked "rename" or "keep"; let the builder iterate the checklist.

2. **Builder self-check step should be mandatory for field-level renames.**
   - A generic-name field like `workspaceId` is high-miss risk (compiler is happy, guard doesn't catch bare field names).
   - **Mitigation:** After implementation, builder runs `grep -rn 'workspacePath\|workspaceId\|workspaceBasePath\|…' packages/ --include='*.ts' | grep -v drizzle | grep -v node_modules` against the plan's own term list and confirms zero hits before sign-off.

3. **The "assume the guard catches it" trap.**
   - Guards are precise (they catch what you explicitly ban) but can be false-safe (if the pattern is too narrow, a genuine miss passes).
   - **Rationale:** `/workspacePath/` is unambiguous; banning bare `workspace` would be 50+ false positives. The guard is right to be narrow.
   - **But:** The guard's narrowness is a feature, not a failure mode — the route-checklist grep is the human-readable cross-check. Making the checklist explicit in the architecture and having the builder echo it prevents misses.

4. **Migration drop+add hazard — needs a pre-flight gate.**
   - The plan flagged "Drizzle might emit DROP+ADD instead of RENAME COLUMN for SQLite." The builder hand-authored the migration (correct), and the code review verified the SQL.
   - **Mitigation for future:** Add a CI gate that rejects migrations with both DROP and ADD on the same column. The gate would be a small shell script in `.github/workflows/` that greps the migration file.

---

## Blockers & Merge Order

**AK1 must merge before AK2** (the kernel/strategy split builds on the final vocabulary). The two CRITICALs in the plan were caught and fixed; the three MINORs (M1, M2, M3) were caught by code review and addressed in a follow-up commit. The guard is green. All ACs are met.

**No regressions detected.** Protected tests hold behaviour-equivalence; `npm run check` confirms all types renamed; `npm run verify` passes (check + lint + knip + test:all + build).

---

## Captured Lore

Two `@lore AK1` comments added:

1. **`context-assembly-prompt.ts:260`** — Explains dual-write rationale: "AGENTS.md (standard surface) + CLAUDE.md (current harness auto-discovery), pending universal AGENTS.md adoption."

2. **`harness-vocab-guard.ts:20`** — Explains why bare `workspace` is not banned: "bare `workspace` guard ban would false-positive on npm workspaces, `/workspace` cwd, external flags. The guard bans only the run-unit type identifiers (WorkspaceAdapter, workspaceSnapshot, etc.); bare-field dangling references are caught by the route-checklist grep, not the guard."

These prevent future agents from re-litigating the guard's scope or the dual-write trade-off.

---

## Summary

**AK1 is done.** 8 commits across 4 phases; 2 fix rounds (plan revision + builder fix-up). The three-term rename (soul → system prompt, workspace → sandbox, skill-tools → tools) + context assembly file renames + AGENTS.md dual-write + static guard are all complete and proven. Guard is green; all ACs met; behaviour-preserving; merge-ready. The minor residuals (M1 doc filename, M2 user-doc label, M3 lore typo) were addressed in a follow-up commit.

**Cost efficiency:** Large mechanical rename, tight scope definition, bottom-up build order, and guard validation prevented the common pitfalls (dangling references, silent behaviour changes, compilation breaks). The two CRITICALs caught by critique were worth the plan-revision round. The builder self-check for missed field names would prevent Round 2 entirely in a future rename.

**Next:** Merge to main, then begin AK2 (kernel/strategy split) which builds on this vocabulary.
