# AU19 — Increment 0 checkpoint review (enforcement scaffolding)

**Scope:** Increment 0 only (the minimal-slice enforcement proof, HARD GATE per `architecture.md` §12). NOT a full-WP AC-completeness audit — the remaining ~28 Service packages / ~230 files are future increments. Reviewed commits `7e762383`, `028452c4`, `139f763d` on `framework/AU19-applications-layers-services` (worktree `.worktrees/AU19-build`), against the reviewer-approved plan `plans/AU19/architecture.md` (`5743bdc6`).

**Verdict: SOUND FOUNDATION WITH ONE CRITICAL THAT MUST BE FIXED BEFORE INCREMENT 1.** The scaffolding is real, the mechanisms are genuinely wired and mostly proven, the sanity-breaks reproduce, and there is no behavior change. But Mechanism C (composition boundary) has a load-bearing hole: an *undeclared* cross-Service import evades tsc + the guard + knip simultaneously. Because this pattern is about to be stamped out ~28 more times, that hole must close before the bulk migration begins.

---

## CRITICAL

### C1 — Mechanism C does not catch an UNDECLARED cross-Service import (proven)
The plan (§7.3, AC-6) claims: *"Listing another `@hyperidle/<service>` or a Layer package → `tsc` fails to resolve (the import isn't a declared dep)."* **This is false**, and the guard cannot compensate.

Empirically proven in this worktree — injected `import { list } from "@hyperidle/knowledge"; export const leak = list;` into `packages/agent-orchestration/context-assembly/src/assemble.ts` **without** touching its `package.json`, then:
- `npx tsc --noEmit -p packages/agent-orchestration/context-assembly/tsconfig.json` → **exit 0** (the hoisted `node_modules/@hyperidle/knowledge` symlink resolves any `@hyperidle/*` from anywhere, regardless of declared deps or `references`; packages export raw `./src/index.ts`, so project-reference gating never bites).
- `npx tsx scripts/composition-boundary-guard.ts` → **PASS** (it only reads `package.json` `dependencies`; an import that was never declared is invisible to it).
- `npx knip` → **exit 0, no unlisted-dependency issue** (nested packages are auto-discovered via the widened glob but knip does not flag the workspace import as unlisted).

So all three enforcement layers are green while a Service directly imports another Service. Sanity-break C only proved the *declared* path (dep added to `package.json` **and** import) — which the guard catches. The far more likely accidental/adversarial path during a 28-package rollout — write the import, forget (or never touch) `package.json` — produces **zero signal**. This is exactly the regression the WP exists to prevent, and Increment 0's whole purpose is to prove the scaffolding sound before scaling.

**Fix (before Inc 1):** give `composition-boundary-guard.ts` a **source-import scan** — parse every nested Service's `src/**` and FAIL on any `@hyperidle/<name>` module specifier that is not `@hyperidle/db`/`@hyperidle/shared` (mirroring what `execution-boundary-guard.ts` already does for banned exec modules). The package.json check alone is structurally insufficient. Add a `--fixtures` negative for the undeclared-import case. Correct the §7.3/AC-6 wording that asserts tsc enforces this.

---

## WARNING

### W1 — execution-boundary-guard banned-surface is narrower than §7.2
The guard bans only `@modelcontextprotocol/sdk` + the three exec `@hyperidle/*` packages. §7.2 mandates the full LLM/harness/MCP npm surface incl. *"CLI-spawn of `claude`/`codex`/`opencode`, `llm-client` internals."* Two gaps:
- No raw LLM SDK (openai/anthropic/etc.) is on the banned list. Harmless today (grep confirms none are imported in `packages/server/src`), but the list must grow as harness/mcp/tool packages get real names in Inc 4 — otherwise a non-exec package reaches a model via a raw SDK and evades.
- **CLI-spawn** of a harness binary (`child_process` spawning `claude`/`codex`/`opencode`) is structurally undetectable by an import-scan guard — a gap the plan *named* but the code does not address. Needs an explicit story (or an accepted-limitation note) before Inc 4/5.
Adequate for the 3-package Inc-0 slice; not adequate for the boundary the plan promises at scale.

### W2 — table-ownership-guard barrel discipline (tier 1) misses `export *`
Proven: appending `export * from "@hyperidle/db";` to `packages/core-api/knowledge/src/index.ts` re-exports **every** raw table and is **not** flagged (only the co-injected aliased named export `knowledgeItems as ki` was caught — alias handling is correct). `checkBarrel` handles named/aliased exports and `export const` decls but not `export *` / `export * as ns`. Tier-2's bare-identifier `.from(table)` matcher is a partial backstop, but it too is evadable: `checkAccess` only inspects imports whose specifier is literally `"@hyperidle/db"` and `.from()` args that are bare identifiers — so a namespace import (`import * as db from "@hyperidle/db"; db.select().from(db.knowledgeItems)`) evades both tiers. (Note: the codebase uses zero `db.query.<table>` relational-API calls today, so that adjacent blind spot is latent, not live.) Add `export *`/`export * as` detection to `checkBarrel` and namespace-import handling to `checkAccess` before the map fills out in Inc 1–4.

### W3 — knowledge's real migration is unscheduled; Inc-0 built a stand-in, not the "full Service"
Step 3 says *"`packages/core-api/knowledge/` — full Service."* What was built is a fresh 33-line single-`list()`-function package reading the real `knowledgeItems` table — a proof stand-in, not the 15-file knowledge Service (`architecture.md` §4). This is the correct and coherent reading of "minimal single-edge slice" (and matches the explicitly-sanctioned "don't swap into the live app" for context-assembly, §12 steps 4/7 — no behavior change confirmed: the diff touches **zero** `packages/server/src` files), so it is **not** an Inc-0 scope-narrowing defect. But it exposes a real downstream planning gap: **§12 Inc 1 does not list `knowledge`** (only work/conversation/users/settings/notifications/routine/connections/org/review), and no later increment lists it either — so the real 15-file knowledge migration + its outbound edges (`knowledge → review`, `knowledge → work`, §10.2) currently fall through the increment schedule, leaving the Inc-0 `list()` as a duplicate of read logic still living un-migrated in `packages/server`. Reconcile before Inc 1: fold real knowledge into Inc 1 explicitly (or document the stand-in → full-migration path) so the duplicate is not orphaned. Same question applies to `harness-registry` (Inc-0 built a 5-descriptor read-model; the real 21-file harness migration is scheduled for Inc 4, which §12 does state — so harness-registry is fine).

---

## Positives (verified, not asserted)
- **typecheck-gate recursion is correct.** One-level recursion finds `packages/<layer>/<service>/tsconfig.json`; `ownerOf` longest-prefix attribution correctly assigns a Service's error to the Service, not its Layer (the `core-api/knowledge` vs `core-api` case). Individually confirmed `context-assembly` typechecks clean.
- **Sanity-breaks are real.** Reproduced break A (barrel re-export of `knowledgeItems`) → guard RED with the exact message, reverted clean. All three guards' `--fixtures` self-tests PASS and all three run clean on the real tree.
- **Honest test coverage for the slice.** `knowledge-reader.integration.test.ts` asserts real scope filtering against real PGlite (team/t1 → `[ki-1]`; team-kind → `[ki-1,ki-2]`) — not `toBeDefined`. `wired-assemble.integration.test.ts` proves the one real edge end-to-end: orchestration Layer → `assemble` → injected `KnowledgeReader` → `knowledge.list` → real DB, with the four transitional stubs asserted empty.
- **No SQL-injection surface.** `list()` uses Drizzle `eq()`/`and()` — parameterized, no string interpolation. (Minor footgun, low: `scopeId`-optional means a caller omitting it reads across all scopes of a `scopeKind`; matches the structural-port design and is not on a production path in Inc 0.)
- **Scaffold generator** is execution-layer-aware (drops `@hyperidle/db` + its tsconfig ref for `agent-execution`), idempotent (`writeIfAbsent`), and uses the correct three-level relative `extends`. Will scale mechanically.
- **Downward wiring is architecturally consistent** with §3: the `agent-orchestration` Layer referencing `../core-api/knowledge` is the sanctioned "orchestration Service reaching down to a core-api Service is legal DI."
- **Lint chain** wires the 3 new guards (`--fixtures` + real) alongside the `au10…au18` guards without retiring them — correct per plan (retirement is Inc 5).

## Nits (non-blocking)
- `execution-boundary-guard.ts` `inspect()` has a dead `if (abs.endsWith("package.json")) continue;` — `collectSourceFiles` only returns `.ts/.tsx`, so it never fires.
- `knowledge/package.json` was knip-trimmed to `{ @hyperidle/db, drizzle-orm }` (dropped `@hyperidle/shared` from the scaffold template because it isn't imported) — correct and knip-clean, but a deviation from the generated skeleton worth noting for consistency expectations at scale.
- Nested `tsconfig.tsbuildinfo` files are gitignored + untracked (good hygiene). Root `tsconfig.tsbuildinfo` is tracked but pre-existing (not introduced here).
- The new nested packages are not explicitly registered in `knip.json` `workspaces` (auto-discovered via the `packages/*/*` glob). Works today; consider explicit per-package entries as the roster grows.

## Bottom line
Increment 0 is a genuine, honest enforcement proof — the tooling, guards, sanity-breaks, and single real edge all hold up under direct testing, and "no behavior change" is verified by an empty `packages/server/src` diff. It is a solid base to scale from **once C1 is closed**. Fix C1 (composition guard must source-scan for undeclared cross-Service imports) before Increment 1 stamps the pattern out ~28 more times; address W1/W2 as the guard maps fill in Inc 1–4; reconcile W3's knowledge scheduling gap in the Inc 1 plan.
