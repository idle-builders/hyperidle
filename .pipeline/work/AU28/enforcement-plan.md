# AU28 — the enforcement plan

How the 121 decided rules become executable lint, land at warning, and get promoted to error one
work package at a time.

**Frame — Ruling 12.** A rule states the END STATE. Enforcement level is a separate dial. Warn while
a migration is in flight, hard-fail once it lands. Never bend the rule to fit the current mess; never
encode a migration as vocabulary. Everything below follows from that: no rule text changes anywhere
in this plan, only dials move.

**Status of inputs.** `rule-set.json` (121 rules, production world), `founder-rulings.md` (Rulings
1-12), `rulings/development-world-rules.md` (the development column + four amendments) are decided
and not reopened here. This plan is the build order.

---

## 1. Verified baseline

Every number below was recomputed from `.pipeline/work/AU28/rule-set.json` joined to the crossing
census at commit `4af3c0e6`. The join is exact: **121 of 121 rule rows match a census row, 0
unmatched.**

### 1.1 Confirmed

| Claim | Verified |
|---|---|
| 218 production violations | **Yes.** 89 import + 46 manifest + 63 table + 14 di + 3 mcp + 2 event + 1 api = 218 |
| 4,481 development instances on forbidden rules | **Yes**, exact |
| 6 tables with no owner | **Yes** — `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills`, `teamRunConfigDefaults`, `agentRunConfig` |
| 28 devDependency rows attributed to production | **Yes** — 90 `dependencies` + 28 `devDependencies` workspace rows in production-root manifests |
| …of which 25 land on a forbidden rule | **Yes** — forbidden production manifest instances split exactly 21 `dependencies` / 25 `devDependencies` |
| `@hyperidle/eval` in `layers/core-ui` devDeps is the last production→tooling breach | **Yes** — `layer → tooling [manifest]` has exactly 1 production instance and it is a devDependencies row |
| 1,839 development writes have a production-used owner writer, 33 do not | **Yes** (§4.2 of the development-world doc; 1,839 + 33 = 1,872 writes) |
| `taskPlanningSignals` has no production writer at all | **Yes**, self-documented at `layers/core-api/work/src/task-planning-signals.ts:9-11` |

### 1.2 Corrections to the brief — three, and they change the work

**(a) "73 production cross-layer imports" does not reproduce. The real figure is 37.**

`layer → service (other layer) [import]` = 36 production instances and `layer → layer (other)
[import]` = 1, across **25 distinct production files**. All 36 originate in `core-api`: 31 into
`agent-orchestration` (session-requests 14, agent-run-config 8, run-orchestration 6, tool-handlers 2,
filesystems 1) and 5 into `agent-execution` (harness-registry). Counting the manifest rows that
declare them brings `core-api` → orchestration/execution to **45**. Nothing in the census sums to 73.
W7 below is sized on 37 imports + 21 manifest rows, and the first task in it is to re-derive the
number against the live tree.

**(b) "The other five unowned tables are a one-line assignment each" holds for only two of them.**

Owner assignment is free only where a single production package touches the table. Measured:

| Table | Prod instances | Production accessors | Assignment is… |
|---|--:|---|---|
| `agentRunConfig` | 4 | `agent-run-config` | one line |
| `teamRunConfigDefaults` | 3 | `agent-run-config` | one line |
| `userSkills` | 9 | `core-api` (7), `settings` (2) | assignment + move 7 sites |
| `taskDispatchAttempts` | 11 | `work` (8), `policy` (3) | assignment + a door for 3 sites |
| `propagationLog` | 14 | `policy` (9), `core-api` (3), `work` (2) | assignment + a door for 5 sites |
| `sessions` | 49 | `run-orchestration` (30), `agent-orchestration` (17), `tool-handlers` (2) | a service that does not exist |

For the bottom four, naming an owner does not remove a violation — it **converts** a completeness
violation into a foreign-access violation for every non-owner accessor. Only 7 of the 90 instances
are genuinely free. This is the single largest sizing error in the brief.

**(c) After the four decided amendments the rule set returns to 121 rules, not 123-125.**

125 rows in the development-world export, minus the 2 redundant `db:testing` rows (§2.2), minus the
2 unsplit `layer|service → db:table (other) [table]` rows superseded by the split, plus the 4
`table:read`/`table:write` rows = **121**. Verified totals on that set: production 54 forbidden / 67
allowed; development 12 forbidden / 109 allowed; **42 rules differ between the worlds** — matching
the decided figures exactly. The `tooling → db:table (other) [table]` row is *not* split and stays.

### 1.3 The finding that reorders the whole plan

**90 of the 91 production table violations are the six unowned tables. Exactly one is a genuine
foreign-table access** (`core-api` → `bets`, owned by `work`).

Production table ownership is, in substance, already correct. What is broken is **completeness** —
six tables nobody owns. That is why the table block is a completeness work package, not an access
migration, and why it is worth 42% of all production violations.

### 1.4 The 218, grouped by what actually fixes them

| Group | Instances | Fix |
|---|--:|---|
| Manifest attribution (`devDependencies` rows) | 25 | Census attribution rule — **no code change** |
| The 6 unowned tables | 90 | Ownership assignment + accessor moves |
| Composition roots (cross-layer + application imports/manifests) | 75 | Real refactor |
| Cross-layer DI | 14 | Port dissolution |
| `db:util` / `seed.ts` / observability dispatcher relocation | 9 | `git mv` + re-export |
| MCP router + `agent-execution` api | 4 | `agent-execution` gets its own app |
| Genuine foreign table access | 1 | One call site |
| **Total** | **218** | |

---

## 2. How 121 rules become executable

### 2.1 Decision: hybrid — data rule set, coded detectors, one engine

Three candidate shapes were considered.

**Generated rule modules (one `.ts` per rule) — rejected.** 121 generated files whose content is a
transcription of a JSON row. A founder ruling would become a code regeneration; the diff for a
verdict flip would be indistinguishable from a diff for a logic change; and every generated module
would need a hand-authored `minScope` floor it has no basis to choose.

**One data-driven rule reading the JSON — rejected as stated.** It collapses 121 rules into a single
registered `Rule`, so the framework's per-rule liveness floor guards 121 rules with one number. It
also breaks on the 22 zero-instance rules, which are permissions and regression guards, not dead
rules.

**Adopted: the rule set is DATA, the detectors are CODE, the engine joins them.**

- **The rule set is data.** `governance/rule-set.json` — a decided contract that changes by founder
  ruling. 121 rows, each keyed `(scope, source, target, kind)`, each carrying two verdicts
  (production, development) and two dials.
- **The detectors are code.** Eight detectors, one per crossing kind, each a real AST pass with its
  own liveness floor. This is where the `au6` failure mode actually lives — not in rules, in
  detectors.
- **The engine is one module.** It joins instances × rules and emits findings. It registers with the
  existing runner as **eight logical rules, one per kind**, so each kind keeps an independent floor
  and a dead detector still fails loudly.

**Why this split.** A rule is a *decision*; a detector is a *measurement*. The repo's own history
says measurements rot silently (`au6-agent-boundary-guard` scanning a deleted directory) while
decisions rot loudly (a founder notices a wrong verdict). Put the floors on the measurements.

### 2.2 Liveness has to be re-based, and this is the subtle part

The current framework defines liveness as "a rule's file population is at or above `minScope`;
otherwise `DeadRuleError`." That does not transfer. 22 of the 121 rules have zero instances by
design — `layer → framework/design-system` is a *permission boundary that nothing currently crosses*,
which is the healthy state, not a dead rule.

Liveness splits into two properties, both stronger than the current one:

1. **Per-detector floors.** Each of the eight detectors declares a minimum instance count repo-wide.
   Measured at `4af3c0e6`: import 7,158 · table 3,604 · di 257 · event 240 · api 140 · manifest 124 ·
   mcp 25 · capability 11. A detector below its floor is a build error. This is the direct `au6`
   fix, one level up from where it was applied.
2. **Totality of the join.** Every boundary-crossing instance must match **exactly one** rule row.
   An instance matching no row is a build error; an instance matching two is a build error. The
   census already proves this reconciles today (`matchedNoRow: 0`, `balances: true`,
   11,559 = 7,629 general + 282 named + 3,648 intra-package).

Totality is what makes a zero-instance rule safe: the rule is not proven alive by its own population,
it is proven alive by the guarantee that nothing escapes the set.

**`capability` at 11 instances is the thin one.** Its floor must be low, which means it is the
detector most able to lose half its coverage without tripping. Called out again in §4.

### 2.3 The rule set must leave `.pipeline/`

`rule-set.json` currently lives in `.pipeline/work/AU28/` — pipeline working-artifact space, which
`/pipeline:write-docs` retires. An enforced contract cannot live in a folder whose lifecycle is
"retired when the work package closes."

Adopted layout, tracked, at repo root:

```
governance/
  rule-set.json      the 121 decided rules, two worlds, two dials
  table-owners.json  table → owning service (the input 6 rules depend on)
  baseline.json      the ratchet (§3.3)
```

The `.pipeline/work/AU28/` copy becomes the historical record of the decision. **One live copy only** —
a second copy drifts, and CLAUDE.md already forbids restating enforced boundaries in prose.

### 2.4 Role assignment stays manifest-derived

Ruling 5: a package's role is never derived from its path. The census already derives role from the
workspace manifest layout. The engine inherits that and must not regress to path matching — worth an
explicit test, because path matching is the tempting shortcut when adding the ninth role.

---

## 3. The three mechanisms

### 3.1 The dial: per rule, per world

```jsonc
{
  "scope": "general", "source": "layer", "target": "db:util", "kind": "import",
  "production":  { "verdict": "forbidden", "enforcement": "error" },
  "development": { "verdict": "forbidden", "enforcement": "error" }
}
```

Two worlds, two independent dials — because 42 rules already differ between them and a rule can be
clean in production while a 1,672-site migration runs in development. `enforcement` is meaningful
only when `verdict` is `forbidden`; an allowed rule is a permission with nothing to enforce. The
loader rejects `enforcement` on an allowed row rather than silently ignoring it.

**Invariant: `enforcement: "error"` with a non-empty baseline is a load-time build error.** A rule
cannot be promoted while known violations exist. Promotion is therefore not a judgement call — it is
mechanically gated on the baseline being empty for that rule and world.

### 3.2 What a warning looks like — and the `--quiet` trap

**The trap, named.** `npm run lint` is:

```
biome check . --reporter=summary && npx eslint . --quiet && npx tsx scripts/governance-lint.ts --fixtures && npx tsx scripts/governance-lint.ts
```

`eslint . --quiet` **discards every ESLint warning**. Any governance finding implemented as an ESLint
warning is invisible by construction. This is not hypothetical — it is the third of the three
disqualifiers `architecture.md` §5.2 already recorded against putting governance in ESLint, and it
remains the reason. **No governance rule may be implemented as an ESLint rule.** The one existing
ESLint entry in the stack — the `scripts/rules/**` filesystem ban — stays, because it is an error and
it is about the guard's own source, not about the repo's architecture.

**The second trap, which the brief did not name: volume.** Printing 4,481 development warnings on
every lint run is worse than printing none. It buries the error-level findings, it makes the output
unreadable, and within a week nobody reads it — "ignorable by habit" achieved by a different route.

**Adopted output shape.** Warnings are aggregated, never enumerated:

```
governance-lint: 121 rules over 8 detectors · 11,559 instances · PASS (30 error-level rules clean)

  WARN  layer → db:table (other) [table:write]   dev  1672  (baseline 1672, Δ0)   → AU29
  WARN  service → db:table (other) [table:write] dev   200  (baseline  200, Δ0)   → AU29
  WARN  layer → service (other layer) [import]   prod    36 (baseline   36, Δ0)   → AU31
  ... 25 more
  28 rules at warn · 4,506 known violations · 0 new · successors: AU29 AU30 AU31 AU32 AU33 AU34 AU35
```

One line per rule at warn, with the count, the delta against the baseline, and **the named successor
work package**. Bounded at ~30 lines. Individual sites are written on demand
(`--report governance-report.md`), never to the console.

Three properties this buys:
- The delta column is the thing a reader's eye lands on. `Δ0` is fine; anything else is a failure.
- A rule at warn without a registered successor is a load-time error — no orphan debt.
- The count is the goal metric. It is on screen every run, so progress is visible without a report.

### 3.3 The ratchet: keyed by site, bidirectional

**The precedent and the failure.** `requirements.md` S13 records the current state as *"0 — convention
only, and it already failed once."* The retired guard set died of the same thing from the other end:
signal 9, *"any exemption apparatus gets re-populated; what held was deleting the mechanism, not
emptying it."* And the AU28 architecture critique already found the proposed count-equality ratchet
**PARTIAL**: *"`live === committed` is a two-sided equality, not a ratchet. Nothing pins the committed
number to a monotonically-decreasing history."*

**The defect a count-only ratchet cannot catch: the swap.** Fix one violation, introduce another in a
different file, count unchanged, build green. With 4,481 known violations this is not a rogue-agent
scenario, it is Tuesday.

**Therefore the baseline is a set of sites, not a number.**

```jsonc
{
  "census": "<commit>",
  "rules": {
    "layer|db:table (other)|table:write|development": {
      "successor": "AU29",
      "sites": { "layers/core-api/src/__tests__/bets.integration.test.ts": 11, "...": 4 }
    }
  }
}
```

Keyed by **file**, not by line. Line-keying thrashes on every edit and trains people to regenerate
the baseline reflexively — which is how a ratchet becomes a rubber stamp. File-keying is stable under
ordinary editing and still catches a new file starting to violate.

Comparison rules, all three enforced:

| Condition | Verdict |
|---|---|
| A site not in the baseline violates | **error** — new debt |
| A baseline site's count rises | **error** — new debt |
| A baseline site no longer violates, or its count falls | **error** — stale baseline; run `--update` and commit the shrink |
| Exact match | pass |

Failing on *improvement* is deliberate and is the "both directions" requirement: it forces the shrink
to be committed, which is what makes the number monotonic in git history rather than merely equal to
itself. It also defeats the swap — the fixed site trips the stale branch and the new site trips the
new-debt branch, independently.

`--update` regenerates the baseline; it is never run by `npm run lint` and never in CI.

**Honest limit.** The ratchet does not prevent someone editing `baseline.json` and the code in one
commit. Nothing mechanical can, and building against that is designing for a rogue agent, which
`ETHOS.md` forbids. What it does guarantee is that the change is *visible as a baseline edit in the
diff* — which is exactly the property convention alone failed to provide.

---

## 4. Coverage honesty — what cannot be mechanically enforced

Stated plainly, because a rule presented as enforced when it is not is worse than no rule.

**Not in the rule set at all, and must not be claimed as covered:**

1. **Harness honesty** — "a harness-facing test drives the real installed binary, never a stub."
   §6.2: no census row covers *which adapter a test used*. It is enforced today by different
   machinery (`require-harness.ts`, `scripts/lib/honest-harness-predicate.ts`, the attestation
   agentic floor), which stays as-is. It is a development-only rule with no production counterpart
   and Ruling 10 stripped its inherited authority; it needs its own decision, not a column.
2. **Workspace handoff** — files written into a harness working directory (`.mcp.json`, `AGENTS.md`,
   injected credentials). The census marks it **UNMEASURED, not zero**, in its own notes. It leaves
   no module-graph instance and it is the channel behind every `→ harness` row. Never report a
   `→ harness` row as clean; report it as unmeasured.

**In the set but structurally partial — enforce, and state the limit:**

3. **`→ MCP router` (3 production instances).** The detector cannot distinguish a dial from a URL
   built and handed to another process. `run-orchestration/src/provisioner.ts:1349` builds the MCP
   URL to bake into a sandbox's `.mcp.json` — that is workspace handoff, scored as a dial. The rule
   is enforceable against regression, not as a true measure.
4. **Events.** `EventBus` is anonymous pub/sub, so the census can only see *who touches the bus*,
   never producer → consumer. The five event rules are honest about this — they are all `→ EventBus`.
   "Which service may send which event to which service" is **not expressible** and no future rule
   should pretend otherwise without a named-channel bus.
5. **`capability` / raw runtime.** Detection is a fixed regex list of LLM/MCP SDKs and a fixed set of
   harness binary names. A new SDK is invisible until the list is updated. 11 instances repo-wide
   means the floor cannot protect much. Treat as a tripwire, not a boundary.
6. **DI.** Heuristic. The census already had to remove 26 false positives (frozen arrays passed to
   `z.enum` scored as injected ports). Improved, still heuristic — a wired-in factory it does not
   recognise is a silent miss.

**Enforceable with high confidence:** `import` (TypeScript AST, resolved into the tracked file set),
`manifest` (JSON parse of declared blocks), `table` (AST over Drizzle query builders + the ownership
registry). These three carry 214 of the 218 production violations, which is why the plan is worth
building.

---

## 5. Increments

Each increment is independently verifiable and ends green. Tier: **production** — this is a gate
everything else rides on, but it is repo tooling, not shipped product.

**Validation convention, per CLAUDE.md.** The governance lint *is* the enforcement mechanism for
static properties of the repo. The governance lint's **own logic** is application logic and gets real
unit tests that import the modules and assert on behaviour over injected synthetic input — never
`readFileSync` over the live tree. Precedent exists:
`framework/db/src/__tests__/ar1-attestation-floor.test.ts` already imports `scripts/lib/*`. The
`--fixtures` synthetic-tree self-test is extended per detector alongside.

---

### Increment 1 — Relocate and complete the rule set

Move the decided rules into enforced space and apply the four decided amendments.

- Create `governance/rule-set.json`; `.pipeline/work/AU28/rule-set.json` becomes the historical record.
- Merge the development verdicts from `rulings/development-world-rules.md` §8 into a two-world schema.
- Apply the amendments: split `layer|service → db:table (other)` into `table:read` / `table:write`;
  delete the 2 `db:testing` rows (§2.2); keep `tooling → db:table (other)` unsplit.
- Add `governance/table-owners.json` — 45 tables → owning service at **current** paths. The recovered
  registry has pre-AU26 `packages/…` paths and lives only in scratch; Ruling 12.1 resolves all five
  relocated owners. The 6 unowned tables are recorded as unowned with a named successor.
- Write `scripts/lib/governance-rule-set.ts` — loader + schema validation.

**DoD.** Unit test importing the loader asserts: exactly 121 rules; every row has both worlds; every
`(scope, source, target, kind)` key unique; totals are production 54 forbidden / 67 allowed,
development 12 forbidden / 109 allowed, 42 differing. The loader throws on a duplicate key, a missing
verdict, an `enforcement` field on an allowed row, and a table-owner entry naming a package that does
not exist. `npm run test`.

---

### Increment 2 — Move the 8-kind census into the repo

**Prerequisite for everything after it.** Today the committed census resolves **imports only**; the
other seven kinds are detected by a 2,677-line scratchpad one-shot with hardcoded absolute paths,
direct `fs` reads, and a scratchpad JSON dependency. It has never been fixture-tested.

Refactored to the established shape: no I/O in the library, file list and `readFile` injected,
package roles from the workspace manifest layout, no absolute paths, ownership registry injected from
Increment 1.

Split by detector weight, each sub-step green on its own:

- **2a — instance model + `manifest`.** The `Instance` type; the manifest detector reading
  `dependencies` / `devDependencies` / `peerDependencies` separately. **Lands the attribution fix**
  (§2.1: a `dependencies` row is a production crossing, a `devDependencies` row is a development
  crossing). This is a census-correctness property, not a code migration, so it belongs here rather
  than in a follow-up — and it removes the last production→tooling breach.
- **2b — `table`.** AST over Drizzle query builders; read/insert/update/delete distinguished so
  `table:read` / `table:write` are expressible; joins across owned tables decomposed. Highest-value
  detector: 3,604 instances, 91 of the 218.
- **2c — `di`.** Wired-in factory detection, carrying the 26 false-positive exclusions already found.
- **2d — `api`, `mcp`, `event`, `capability`.** Route registrations parsed per layer, dialled paths
  matched longest-prefix-first; bus endpoints; SDK and harness-binary tripwires.

**DoD per detector.** Positive fixtures (a synthetic crossing is detected) **and negative controls**
(a near-miss that must *not* be detected, and a known real crossing shape the detector must catch).
Per-detector liveness floor asserted. **Whole-increment DoD:** live counts reconcile to the recorded
census within tolerance — 11,559 raw = 7,629 general + 282 named + 3,648 intra-package + 0 unmatched
— and per-kind totals match §2.2. A reconciliation mismatch is a build error, not a warning.

---

### Increment 3 — The engine

Join instances × rules; emit findings.

- Register as eight logical rules, one per kind, each with its detector floor.
- **Totality:** every boundary-crossing instance matches exactly one rule row. Zero matches or two
  matches is a build error.
- Role assignment stays manifest-derived (Ruling 5) — asserted by test.

**DoD.** Unit tests over a synthetic census: an instance matching no row fails; an instance matching
two rows fails; a detector below floor throws; a correct census produces the expected finding set.

---

### Increment 4 — The dial

Per rule, per world `enforcement`.

**DoD.** Unit tests: a forbidden rule at `error` with violations exits non-zero; the same rule at
`warn` exits zero and is counted; `enforcement: "error"` with a non-empty baseline is a load-time
error; an allowed rule carrying `enforcement` is a load-time error.

---

### Increment 5 — The ratchet

`governance/baseline.json`, site-keyed, plus a pure `compareBaseline(committed, live)`.

**DoD.** Unit tests on the pure function covering all four cases in §3.3, **including the swap** —
one site fixed and one new site added, total count unchanged, must fail on both branches
independently. A count-only implementation passes the first three and fails this one; that is the
test that proves the design.

---

### Increment 6 — Wire in, land at warn, promote what is already clean

- Register the engine in `scripts/governance-lint.ts` alongside the three existing rule modules.
- Generate and commit the initial baseline.
- Set every forbidden rule with zero violations in a world to `error` in that world; the rest to
  `warn` with a named successor.
- Add the aggregated output format (§3.2) and `--report`.
- Fold `scripts/dep-manifest-lint.ts` onto the shared census in a follow-up, not here — it currently
  runs its own filesystem walk and carries a `JUSTIFIED_UNUSED` allowlist, both of which contradict
  "one census, many rules" and the no-exemption-apparatus lore. Noted, deliberately deferred.

**DoD.** `npm run lint` green. **30 of 54** production-forbidden rules at error, 24 at warn; **6 of
12** development-forbidden rules at error, 6 at warn. Every warn rule names a registered successor.
Introducing a fresh violation in a scratch commit fails the build — demonstrated, not assumed.

**Repo hygiene, unrelated but blocking a clean commit:** `scripts/rules/` and `scripts/lib/` currently
contain committed `.js` / `.d.ts` / `.js.map` build artifacts beside their `.ts` sources. CLAUDE.md's
worktree hygiene rule rejects these. Remove before shipping.

---

## 6. The follow-up work packages

Ordered by enforcement unlocked per unit of work. Each ends with named rules promoted from warn to
error and its baseline entries deleted.

| WP | Work | Prod instances | Promotes | Depends on |
|---|---|--:|--:|---|
| **W1** | Relocate `db:util`, `seed.ts`, observability dispatcher out of `db` / `framework/shared` | 9 | **4 rules** | AU28 |
| **W2** | Dissolve cross-layer DI | 14 | **4 rules** | AU28 |
| **W3** | `agent-execution` gets its own app, hosting the MCP router | 4 | **3 rules** | AU28 |
| **W4** | Assign owners: `agentRunConfig`, `teamRunConfigDefaults` | 7 | 0 alone | AU28 |
| **W5** | Assign owners + move accessors: `userSkills`, `taskDispatchAttempts`, `propagationLog`; the one real foreign access (`core-api` → `bets`) | 35 | 0 alone | W4 |
| **W6** | A `sessions` service that does not exist yet | 49 | **6 rules** (completes the table block) | W5 |
| **W7** | Composition roots: `core-api` → orchestration/execution, application → service/application, and their manifest rows | 75 | **7 rules** | AU28 |
| **W8** | Development-world foreign-table writes — 1,839 sites through the owner's existing writer | 0 prod / 1,872 dev | **2 dev rules** | W6 |

30 at error after AU28 + 24 promoted across W1-W7 = **all 54 production-forbidden rules at error.**

### Sequencing rationale

**W1, W2, W3 first — highest enforcement per unit of work.** 27 production instances between them
promote 11 rules. W1 is nine instances and four rules: `db:util` is not database code, `seed.ts` is
already slated for deletion, and the observability dispatcher is a bus endpoint sitting in
`framework/shared` — which is what makes `framework → EventBus` unenforceable until it moves. All
three are relocations Ruling 12.3 already named.

**W4 → W5 → W6 is a strict chain and promotes nothing until the end.** The four table rules and the
two table-symbol import rows all aggregate across all six tables, so the block is **all-or-nothing**:
91 instances of work before a single rule promotes. This is a real and unavoidable cost — Ruling 11.1
keeps rules at the general package level and Ruling 12 forbids inventing per-table rows to
manufacture partial credit. **The ratchet is what carries the intermediate progress**, which is the
strongest argument for building it properly rather than as a count. Order within the chain is by
difficulty: the two free assignments, then the three that need accessor moves, then the missing
service.

**W7 is the largest and least dependent** — it can run in parallel with the table chain. It is also
the one whose scope is least certain (correction (a)), so it starts by re-deriving its own number.

**W8 is the 1,839-site development migration.** Gated behind W6 because "through the owner's writer"
has no referent for `sessions` (57 dev writes) or `agentRunConfig` (35) until those tables have
owners. §4.3 recommends sequencing by value — `teams`/`teamMembers` (518 sites, a real 1:1 invariant
that 159 test files currently violate) and `users` (436 sites, transaction shape) first; the thin
typed-alias wrappers last **or never**. Leaving the tail at warn indefinitely is a legitimate outcome
and the plan says so rather than pretending otherwise. The 33 Group-2 sites are compliant by
construction — the rule reads "through the owner's writer *where one exists*."

**Not a work package: fixture-module consolidation.** §4.4 recommends extending `seedBase` and having
135 duplicated call sites use it. Real duplication win, but it is a developer-guide convention, not
an access rule — it is not mechanically checkable without inventing a "fixture module" file class,
and it does not fix the invariant hazard. Keep it out of the rule set.

---

## 7. Per-rule enforcement status

67 production-allowed and 109 development-allowed rules are **permissions** — nothing to enforce.
The 66 forbidden dials below are the enforceable surface. `prod dial` / `dev dial` are the states
when AU28 lands.

Table rows are shown pre-split; after Increment 1 each `layer|service → db:table (other) [table]` row
becomes `table:read` + `table:write` (production violations split: layer 16 read / 4 write, service
18 read / 25 write — all four stay at warn; development `table:read` becomes **allowed**, and only
`table:write` carries the 1,872-site migration).

| rule | kind | prod viol | prod dial | clears via | dev verdict | dev viol | dev dial |
|---|---|--:|---|---|---|--:|---|
| service → db:table (other) | table | 43 | warn | W4+W5+W6 | forbidden | 234 | warn |
| layer → service (other layer) | import | 36 | warn | W7 | allowed | 147 | — |
| layer → db:table (other) | table | 20 | warn | W5+W6 | forbidden | 2380 | warn |
| service → db:table (other) | import | 20 | warn | W4+W5+W6 | allowed | 148 | — |
| application → service | import | 15 | warn | W7 | allowed | 0 | — |
| service → service (same layer) | manifest | 14 | **error** (attribution) | AU28 Inc 2a | allowed | 0 | — |
| application → service | manifest | 13 | warn | W7 (12 after attribution) | allowed | 0 | — |
| layer → service (other layer) | manifest | 9 | warn | W7 (7 after attribution) | allowed | 0 | — |
| service → service (other layer) | di | 9 | warn | W2 | allowed | 1 | — |
| layer → db:table (other) | import | 8 | warn | W5+W6 | allowed | 1269 | — |
| layer → db:util | import | 5 | warn | W1 | forbidden | 0 | **error** |
| service → service (other layer) | manifest | 3 | **error** (attribution) | AU28 Inc 2a | allowed | 0 | — |
| application → application | import | 2 | warn | W7 | allowed | 1 | — |
| application → application | manifest | 2 | **error** (attribution) | AU28 Inc 2a | allowed | 0 | — |
| application → MCP router | mcp | 2 | warn | W3 | allowed | 0 | — |
| application → service | di | 2 | warn | W2 | allowed | 12 | — |
| framework → EventBus | event | 2 | warn | W1 | allowed | 31 | — |
| layer → application | manifest | 2 | **error** (attribution) | AU28 Inc 2a | allowed | 0 | — |
| layer → layer (other) | manifest | 2 | warn | W7 | allowed | 0 | — |
| service → layer (other) | di | 2 | warn | W2 | allowed | 49 | — |
| application → db:util | import | 1 | warn | W1 | forbidden | 0 | **error** |
| framework → layer | di | 1 | warn | W2 | allowed | 0 | — |
| layer → db:unknown | import | 1 | warn | W1 | forbidden | 0 | **error** |
| layer → layer (other) | import | 1 | warn | W7 | allowed | 2 | — |
| layer → tooling | manifest | 1 | **error** (attribution) | AU28 Inc 2a | allowed | 0 | — |
| service → agent-execution | api | 1 | warn | W3 | allowed | 0 | — |
| service → MCP router | mcp | 1 | warn | W3 | allowed | 0 | — |
| application → db:unknown | import | 0 | **error** | — | forbidden | 6 | warn |
| application → development file | import | 0 | **error** | — | allowed | 0 | — |
| framework → development file | import | 0 | **error** | — | allowed | 0 | — |
| framework → framework | di | 0 | **error** | — | allowed | 12 | — |
| framework → repo root | import | 0 | **error** | — | allowed | 13 | — |
| framework → service | di | 0 | **error** | — | allowed | 29 | — |
| layer → agent-execution | api | 0 | **error** | — | allowed | 14 | — |
| layer → application | import | 0 | **error** | — | allowed | 10 | — |
| layer → db:bootstrap | import | 0 | **error** | — | allowed | 1 | — |
| layer → db:schema-ns | import | 0 | **error** | — | forbidden | 6 | warn |
| layer → development file | import | 0 | **error** (live today) | — | allowed | 0 | — |
| layer → framework/design-system | import | 0 | **error** | — | forbidden | 0 | **error** |
| layer → framework/design-system | manifest | 0 | **error** | — | forbidden | 0 | **error** |
| layer → MCP router | mcp | 0 | **error** | — | allowed | 11 | — |
| layer → repo root | import | 0 | **error** | — | allowed | 1 | — |
| layer → service (other layer) | di | 0 | **error** | — | allowed | 2 | — |
| layer → tooling | import | 0 | **error** (live today) | — | allowed | 1 | — |
| service → development file | import | 0 | **error** (live today) | — | allowed | 0 | — |
| service → raw runtime | capability | 0 | **error** | — | forbidden | 0 | **error** |
| service → service (other layer) | import | 0 | **error** | — | allowed | 3 | — |
| service → service (same layer) | import | 0 | **error** | — | allowed | 24 | — |
| tooling → db:schema-ns | import | 0 | **error** | — | forbidden | 2 | warn |
| tooling → raw runtime | capability | 0 | **error** | — | forbidden | 1 | warn |
| tooling → service | import | 0 | **error** | — | allowed | 4 | — |
| tooling → service | manifest | 0 | **error** | — | allowed | 3 | — |

Deleted by Increment 1: `layer → db:testing [import]`, `service → db:testing [import]` — both already
covered by the enforced production→development rule (§2.2).

**Cannot be checked, not in the table, not enforced:** harness honesty (no census row); workspace
handoff (unmeasured by construction). **Partial, enforced as regression guards only:** `→ MCP router`,
`capability`, `di`. See §4.

---

## 8. Risks

**The biggest risk: the detector reconciles perfectly with itself while under-detecting.**

The entire rule set, every violation count, and every promotion decision rest on a 2,677-line
scratchpad script that is not in the repo, has never been fixture-tested, and was written in one
pass. Its strongest evidence of correctness is the reconciliation invariant — 11,559 raw = 7,629
general + 282 named + 3,648 intra-package + 0 unmatched, `balances: true`.

**That invariant proves accounting consistency, not detection correctness.** It proves every instance
the detector *found* is claimed by exactly one rule. A crossing the detector never emits does not
enter `rawInstances` and therefore cannot unbalance anything. **False negatives are invisible to the
only self-check the census has.**

This is the `au6` failure mode one level up. `au6` scanned a deleted directory and printed PASS over
zero files; the framework's answer was per-rule population floors. A detector that finds 80% of
`table` crossings passes every floor, reconciles perfectly, and produces a rule set that is
confidently wrong — and then 121 rules get promoted to error against it.

Concrete exposure: `capability` (11 instances, fixed regex list), `di` (heuristic, already needed 26
false-positive removals — a detector that mis-scores in one direction usually mis-scores in the
other), and `table` (91 production violations and the entire 1,872-site W8 migration depend on
correctly finding every Drizzle query-builder shape, including joins and aliased executors).

**Mitigations, all in Increment 2:**
- Negative controls in the fixtures — not just "a synthetic crossing is detected" but "this known
  real crossing shape is detected." A detector that only has positive fixtures is tested against its
  own assumptions.
- Per-detector floors set from measured counts, recomputed at merge, never carried across a rebase.
- Differential check: live counts must reconcile to the recorded per-kind totals before any rule is
  promoted. A drift is investigated, not absorbed.
- **Promotion is the forcing function, and it is sequenced late on purpose.** A rule only goes to
  error when its count is zero, and a zero produced by blindness is exactly what a negative control
  catches. Anywhere the plan promotes a rule for a kind whose detector is listed partial in §4, the
  promotion is a regression guard only, and §4 says so.

**Second risk: the table block promotes nothing for three work packages.** 91 instances of work
across W4-W6 before a single rule moves off warn. Accepted deliberately — Ruling 11.1 and Ruling 12
between them forbid the per-table rows that would manufacture partial credit. The ratchet is the
mitigation, and it is the reason §3.3 is built as a site set rather than a count.

**Third risk: the ownership registry is the weakest input to the strongest rules.** Four rules
carrying 91 production and 4,031 development instances depend on `table-owners.json`, which today
exists only as a scratchpad file with pre-AU26 paths, recovered from a deleted guard. Nothing in the
repo declares table ownership any more — only stale comments referencing the deleted guard's
`TABLE_OWNER` map. Increment 1 rebuilds it, and Increment 3's totality check is what keeps it honest:
a table absent from the registry must be a build error, never a silently-skipped row.
