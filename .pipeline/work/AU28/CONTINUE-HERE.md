# AU28 — state and continuation

**Read this first.** Written 2026-08-05 to survive context compaction. Everything below is either
committed on `pipeline/AU28` or names the file that holds it.

---

## 1. Where we are

Branch **`pipeline/AU28`**, based on `origin/main` (`f484b295`, after AU26 + AU27 merged).
Clean, pushed, `npm run verify` green. **No PR opened** — that is deliberate.

| Step | State |
|---|---|
| 1 · production/development split + governance lint | **shipped** |
| 2 · packages into role folders | **shipped** |
| 3 · access rules per world | **decided, not yet enforced** ← you are here |
| 4 · split `shared`, clear violations | not started |
| 5 · rewrite `CLAUDE.md` + `.claude/rules` | not started |
| 6 · purge `strategy` | not started |

### What is actually enforced in CI today

**One rule:** a production file may never import a development file
(`scripts/rules/no-production-imports-development.ts`), live count **0**. Plus
`npm run deps:check` (`scripts/dep-manifest-lint.ts`) keeping manifests and imports in sync —
33 packages agree, 1 justified exception.

**Everything else is decided but unenforced.**

---

## 2. The source of truth — these files, not the census

**The census is derived output. These two files are authoritative:**

- **`.pipeline/work/AU28/rule-set.json`** — 121 rules with **production** verdicts (67 allowed /
  54 forbidden / 0 unsettled), plus provenance per rule.
- **`.pipeline/work/AU28/rulings/development-world-rules.md`** — the derivation principle and the
  **development** verdict per rule (113 allowed / 12 forbidden). Paste-ready JSON at the end.

Supporting: `founder-rulings.md` (Rulings 1-12, **binding**), `rulings/round-1-production.json`
(the founder's own 25 verdicts), `rulings/round-1-answers.md` and `round-2-recommendations.md`
(the code investigations), `enforcement-plan.md`, `retired-guards.md`.

**After the table read/write split the live set is 125 rows** — the four `[table]` rows became
eight. Verified: all 125 match their committed decision, zero mismatches, and the arithmetic closes
(67+2 allowed, 54+2 forbidden).

> ⚠️ **Hard-won process rule.** A census regeneration MUST reapply verdicts from those two committed
> files as its final step, and the **total** verdict counts must be checked before publishing — not
> just the rows that changed. This was violated once: a regeneration re-derived production verdicts
> and silently reset 27 rules to unsettled. Nothing was lost only because the decisions live in git.

---

## 3. The rule vocabulary — closed, do not extend casually

**Roles (6):** `layer` · `service` · `framework` · `application` · `tooling` · `deployment`
Plus `harness` (a non-package actor) and a **named package** where one genuinely needs its own rule.

**Kinds (9):** `import` · `manifest` · `di` · `api` · `mcp` · `event` · `table:read` ·
`table:write` · `capability`

**Every rule names exactly one role as source and one as target.** No unions, no `any`, no `except`,
no `/` between roles. Target qualifiers are limited to `own` / `other` / `same layer` /
`other layer`, plus concrete surfaces (`db:client`, `db:row-type`, `db:schema-ns`, `db:util`,
`db:bootstrap`, `db:testing`, `db:unknown`, `framework/shared`, `framework/db`,
`framework/api-contract`, `framework/design-system`, `EventBus`, `MCP router`, `raw runtime`,
`repo root`).

**Plain language only.** No invented jargon — `hosts router`, `server-side`, `sibling`, `rank 1`,
`Layer root` were all rejected.

---

## 4. NEXT TASK — architect the compact rule engine

**Founder's instruction, verbatim:**

> "please make sure that we focus on building on simple rule sets and not hundreds of hand written
> individual rules that will fail easy. the list was for decision making but the true rule set maybe
> is something that has the combinations in there. so we need to have a deep session with the
> planner to architect the real rules."

**The 125 rows are the DECISION artifact, not the implementation.** They are the expansion of a much
smaller set of principles across roles × targets × kinds. Implementing them as 125 hand-written
rules would be brittle.

**The design target:** a small rule language plus a derivation, where **the 125 decided verdicts
become the acceptance test** — the compact set is correct if and only if it reproduces every one of
them exactly. That test is also the regression net for the engine itself.

Likely shape (to be designed, not assumed): a default of *forbidden*, a small set of allow
predicates over `(sourceRole, target, kind, world)`, and a short list of named exceptions. The
named-exception count is currently ~18-20 and each carries a one-sentence justification for why its
role peers do not share the rule.

### Build increments after the design lands

1. **Move the census into the repo.** Today `scripts/lib/repo-census.ts` resolves **imports only**.
   The other 8 kinds live in `scratchpad/census2.ts` (~2,700 lines, never fixture-tested).
   **Prerequisite for everything.**
2. The rule engine + totality assertion.
3. Per-rule, per-world warn/error dial.
4. The ratchet — site-keyed, fails in **both** directions.
5. Wire in, land at warn, promote the clean rules.

---

## 5. Traps and findings that cost real time — do not rediscover

- **`eslint . --quiet` suppresses warnings.** This is exactly how `eslint-plugin-design` ended up
  enforcing **zero** rules on the product UI while appearing to be a net. Any warn-level design must
  survive this.
- **Founder decision on warn output:** individual warnings are fine — *"the next step is anyhow a
  work package to solve those, nothing else happens in the meantime. also you can just ask the
  linter to only output the errors."* `enforcement-plan.md` §3.2 currently specifies aggregation
  and **needs amending to match this.**
- **The biggest risk in the whole plan:** the detector reconciles perfectly with itself while
  possibly under-detecting. A crossing never emitted never enters `rawInstances`, so **false
  negatives are invisible to the only self-check the census has.** Mitigation: negative controls in
  the fixtures (a *known real* crossing shape, not just a synthetic one), per-detector floors, and a
  differential check before any promotion.
- **A rule matching zero files must throw.** `au6` and `au9` printed PASS over zero files for months.
- **Production ownership is substantively correct.** 90 of 91 production table violations are the
  **6 unowned tables**; exactly **1** is a genuine foreign access. The defect is completeness.
- **1,839 of 1,872 development table writes already have a production-used owner writer.** Only 33
  do not (`taskPlanningSignals` — which has no production writer at all — `userSkills`,
  `propagationLog`, `taskDispatchAttempts`, `agentLifecycleInbox`). **Constraint: never add a
  production export that only tests use — `knip:production` deletes it as dead code.**
- **`team-lookup.ts:225-230` documents that callers must use `createTeam`; 159 test files still
  insert `teams` + `teamMembers` separately**, including the shared `_helpers.ts`.
- **`_helpers.ts:58-83` already has `seedBase` and nobody uses it** — 135 of 249 files hand-roll the
  same base world.
- **28 devDependency rows are attributed to the production world.** Fixing the attribution removes
  the last production→tooling breach (`@hyperidle/eval` at `layers/core-ui/package.json:30`).
- **Numbers I asserted that did not reproduce** — check before reusing: "73 production cross-layer
  imports" is really **37**; "the five unowned tables are one-line assignments" holds for **two**.
- **`.pipeline/work/AU28/` is working-artifact space** that `/pipeline:write-docs` retires. An
  enforced contract cannot live there — the rule set moves to `governance/`.

### Cannot be mechanically enforced — do not present as enforced

- **Harness honesty** (real binary, never a stub) — no census row; lives with `requireHarness` + the
  attestation floor.
- **Workspace handoff** (files written into a harness working directory) — never implemented;
  the census marks it UNMEASURED, not zero. It is the channel behind every `→ harness` row.
- **Partial only:** `→ MCP router` (cannot distinguish a dial from a URL handed to a subprocess),
  `capability` (fixed SDK regex list), `di` (heuristic — already needed 26 false-positive removals).
- **Events are structurally limited** — `EventBus` is anonymous pub/sub, so producer→consumer rules
  are *inexpressible*, not merely undetected.

---

## 6. Follow-up work packages (from `enforcement-plan.md`)

| WP | Work | Prod violations | Rules promoted |
|---|---|--:|--:|
| W1 | Relocate `db:util`, `seed.ts`, the observability dispatcher out of `shared` | 9 | 4 |
| W2 | Dissolve cross-layer DI | 14 | 4 |
| W3 | `agent-execution` gets its own app so it hosts the MCP router | 4 | 3 |
| W4→W5→W6 | Table owners: 2 trivial → 3 multi-accessor → a `sessions` service | 91 | 6 (only at W6) |
| W7 | Composition roots (parallel with the table chain) | 75 | 7 |
| W8 | Development foreign-table writes, 1,839 sites | — | 2 dev |

Plus, already identified and unscheduled: split `shared` (568 exports, 229 runtime values, ships a
markdown toolchain into every layer's closure); purge `strategy` (dead concept, still an
`agent_category` enum value + column + 4 roles, 119 code / 37 doc files); delete the dead Hono RPC
client; the `web ↔ core-api` typed contract (every response shape is an unchecked cast).

---

## 7. The artifact

`https://claude.ai/code/artifact/6122c104-af70-45fa-ae4f-c0ada88d99d8` — the worksheet. Built from
`scratchpad/census2-compact.json`; page source assembled from `p-head/p-mid/p-tail/p-script.html` in
the same scratchpad. Rulings persist in browser `localStorage` under `au28-rulings-r2`; **Copy JSON**
exports them. Republishing the same file path keeps the URL.

**If the scratchpad is lost:** the artifact can be rebuilt from `rule-set.json` +
`development-world-rules.md` + a fresh census run. The decisions are safe; only the presentation
would need redoing.
