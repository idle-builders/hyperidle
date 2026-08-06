# AU28 — detector architecture: same rules, better sight

**Scope.** Enforcement only. The 125 decided rows × 2 worlds = **250 verdicts are frozen**, the clause
set in `scripts/lib/governance-model.ts` is frozen in meaning, and
`framework/db/src/__tests__/governance-model.test.ts` must keep reproducing all 250 **with the file
unchanged**. Every item below changes what the detectors *see*, never what the model *decides*.

**The bar every item is judged against** (founder, verbatim):

> "You can always circumvent a linter with linter-ignore so even that is a oneliner. Linters are
> guidance and never unbreakable. We are not protecting against malicious behaviour — that's what
> review does. But our linters should be good enough to catch when someone implements in a different
> style. Such stuff should be caught."

So: **catch the same forbidden thing written a different way.** Do not build against hiding.
Anti-malice theatre is rejected explicitly, by name, in §12.

**Engineering tier.** `production` (from `plan.md`). Rigor is warranted; ceremony is not.

---

## 0 · Measurements this plan is built on

Everything below is measured against `pipeline/AU28` @ `1942ec6f` + the uncommitted `review.md`.
All numbers are live, not quoted from a document.

| | live |
|---|---|
| tracked files | **3,296** (789 production · 2,507 development) |
| crossings | **8,054** — `import` 3665 · `table:write` 2285 · `table:read` 1319 · `di` 245 · `event` 240 · `api` 140 · `manifest` 124 · `mcp` 25 · `capability` 11 |
| known violations | 221 production · 69 development · 38 baseline groups · 290 sites |
| tables | 45 (39 owned, 6 unowned) · companion pairs: exactly two (`teams↔teamMembers`, `knowledgeItems↔knowledgeAppProjection`) |
| **aliased table imports** | **5** — all in `__tests__` (development) |
| **`const x = <table>` aliases** | **0** |
| **raw `sql` templates naming a physical table** | **9** — 3 production (own-table), 6 development (`framework/db` migration test) |
| **cross-package `export … from` statements** | **14** of 491 total `export … from` |
| **production files in no workspace package** | **0** — and 0 of the 80 repo-root edges come from a production-classified file |
| full `governance-lint` run | 5.45 s |

**The single most important consequence of these numbers:** C2, C3, C4 and C1 each add *zero* live
violations. They add crossings and close bypasses without moving the baseline, without needing
`--adopt`, and without a founder decision. That is why they are cheap and why they go first.

The 5 aliased imports are `filesystems as filesystemsTable`, `items as itemsTable` ×3,
`threads as threadsTable` — all development, all foreign writes, and **none of those tables is a
companion**, so the development relaxation allows every one of them. The 9 raw-SQL sites are
`knowledge_items` inside `layers/core-api/knowledge/` (its owner), `agent_session_requests` +
`agent_work_intents` inside `layers/agent-orchestration/session-requests/` (its owner), and
`threads`/`items` inside a `framework/db` development migration test (foreign, development,
non-companion → allowed).

---

## 1 · Order of work

Ranked by value ÷ work. **Execution order differs at the top**: item 7 (the adversarial harness) is
built *first* as the red phase, because it is the thing that proves items 1–6 and stops item 8 being
quietly skipped. Everything else follows the ranking.

| # | defect | value | work | 250 verdicts |
|---|---|---|---|---|
| 1 | **C2** — table detection is identifier-name matching | very high | small | unaffected |
| 2 | **C4** — an unclaimed production directory fails OPEN | high | one condition | unaffected |
| 3 | **W-TEST-1** — a test that cannot fail | high | minutes | unaffected |
| 4 | **C3** — raw SQL is invisible | high | medium | unaffected |
| 5 | **exec/execSync spawn gap** (folded in from review §8) | medium | small | unaffected |
| 6 | **C6/C7** — floors that rotted, with no test | high | medium | unaffected |
| 7 | **Break-testing as a standing practice** | very high | large | unaffected |
| 8 | **C1** — re-export laundering | high | medium | unaffected |
| 9 | **W-TEST-2/3** — iteration assertion + 4 untested detectors | medium | medium | unaffected (assertion is *added*, existing loop untouched) |
| 10 | **`validateTableOwners` has no caller but a test** | medium | tiny | unaffected |
| 11 | **`ownerOf` reads through the prototype chain** | low (hygiene) | tiny | unaffected |

Nothing on this list requires a rule change. §11 names the one open item that does.

---

## 2 · C2 — resolve the table through the binding, not the identifier text

### The defect

`crossing-detectors.ts:510` — `if (arg !== undefined && ts.isIdentifier(arg) && input.tables.has(arg.text)) table = arg.text;`
The schema export name must equal the local identifier. Three writes of the same row:

```ts
import { teams } from "@hyperidle/db";                    insert(teams) → ERROR
import { teams as T } from "@hyperidle/db";               insert(T)     → PASS
import { teams } from "@hyperidle/db"; const t = teams;   insert(t)     → PASS
```

Renaming an import is an ordinary style choice, not concealment. This is squarely inside the bar.

Four call sites carry the same one-line pattern, and one of them fails in the *opposite* direction:

| site | effect of the defect |
|---|---|
| `crossing-detectors.ts:510` (`table:read`/`table:write`) | under-detects a violation |
| `crossing-detectors.ts:227` (`buildWriteSets`) | fails to **credit** an aliased companion write → the Ruling-13 companion rule **false-positives** |
| `crossing-detectors.ts:146` (`unconditionalInserts`) | an owner's aliased writer forms no companion group |
| `crossing-detectors.ts:130` (`revised`) | an owner's aliased `update` misses Ruling 13a's revision test |

### Mechanism

One exported resolver, built once per source file, used at all four sites:

```
buildTableRefs(sf, file, input) → (expr: ts.Expression) => string | null
```

It resolves, in this order:

1. **Import binding.** Walk the file's `ImportDeclaration`s exactly as `importOrigins`
   (`crossing-detectors.ts:381`) already does. For each named element whose
   `(propertyName ?? name).text` is in `input.tables` *and* whose specifier resolves (via
   `census.edges`) into the database package, map `element.name.text` (the **local** name) →
   the schema name. Note the census's `ImportEdge.symbols` carries the *original* name only
   (`repo-census.ts:639` uses `propertyName ?? name`), so the local alias must come from the
   re-parse the detector already performs — not from the edge.
2. **Local const alias.** A `VariableDeclaration` with an identifier name and an identifier
   initializer already in the map, resolved to a fixed point (`const a = teams; const b = a;`).
3. **Namespace destructure.** `const { bets } = schema` where `schema` is in `dbNamespaces`.
4. **Namespace property access.** `schema.bets` — already handled at `:511-519`, folded into the
   same resolver so all four call sites gain it.
5. **Bare name fallback.** `input.tables.has(text)` — kept, so behaviour for the 99% case is
   byte-identical and counts do not move for unaliased code.

**Boundary, stated deliberately.** One level of *naming* indirection: import alias, `const` alias,
namespace destructure. Value-flow through an object literal (`const T = { bets }; insert(T.bets)`),
through a function return, or through a `Map` is **out of scope** — that is hiding, not a style, and
chasing it buys a partial analysis that reads as complete. Recorded as a `@lore` limit next to the
resolver, in the same register as the existing honesty notes at the top of the file.

### Files touched

- `scripts/lib/crossing-detectors.ts` — add `buildTableRefs`; replace the four inline checks.
- `framework/db/src/__tests__/governance-crossings.test.ts` — new cases.
- `scripts/lib/governance-attacks.ts` (new, §8) — the break cases.

### Tests

- **Break-test (red before, green after):** attack `alias-import` — a production file in
  `layers/core-api/work/src/` doing `import { teams as T } from "@hyperidle/db"; …insert(T)`.
  Expect `service → db:table (other) [table:write] production`. Red at HEAD, green after.
  Attack `alias-const` — same, via `const t = teams`.
- **Unit, positive:** `detectAstCrossings` over a synthetic tree reports `table:write` for all three
  spellings and names the same table for each.
- **Unit, negative control:** `import { teams as T }` where the specifier resolves *outside* the
  database package (a local module that happens to export a symbol named `teams`) produces **no**
  crossing. Without this, the resolver becomes a name-matcher again.
- **Unit, the other direction:** `buildWriteSets` credits `insert(teamMembersAlias)` so a fixture
  that *does* write the companion under an alias is no longer a false positive.

### Risk

Low. The fallback keeps existing detections identical. The one real risk is a **false positive** from
a file that shadows a schema name locally — mitigated by requiring the import to resolve into the
database package, and by the negative control above. Live impact measured: **+5 development crossings,
0 new violations, 0 baseline change.**

**250 verdicts: unaffected.** No model file, no registry, no decided row is read or written.

---

## 3 · C4 — a production file outside every package must fail CLOSED

### The defect

`crossings.ts:75-76` — `actorFor(undefined)` returns `{ sort: "repo-root" }`, and
`architecture.json` declares `repoRootIsCompositionRoot: true`. But `classifyFile` puts anything
under `layers/` in the **production** world. So `layers/rogue/src/backdoor.ts` with no
`package.json` is production code with composition-root powers: proven, both cross-layer imports
adjudicated *allowed*, production count 789 → 790, `governance-lint: PASS`.

`crossing-detectors.ts:453-454` has the mirror-image hole and it is worse: `if (owner === undefined) continue;`
— every AST detector **silently skips** the file entirely, so the same directory can also write any
table it likes and be invisible.

`actorFor` conflates two different things: "outside the package tree" (a build script under
`scripts/` — legitimately the repo root) and "unregistered inside it" (a directory under a production
root with no manifest). This is a **misconfiguration failing open**, which is the worst direction.

### Mechanism

One shared guard, used at both sites:

> A file classified `production` may never resolve to the repo-root actor. If `locate()` returns
> `undefined` for a production file that produces a crossing, **throw**.

Throwing (rather than emitting a `forbidden` crossing) is the right shape here because:

- the failure is a *misconfiguration*, not a code violation — a baseline entry for it would be
  nonsense, and the ratchet would then be asked to forgive a hole in the census;
- every sibling census misconfiguration already hard-throws: unclaimed package
  (`repo-census.ts:496`), dead role rule (`:502`), zero tables (`db-surfaces.ts:87`), zero event
  types (`crossing-detectors.ts:439`), detector below floor (`crossings.ts:247`);
- the message can say exactly what to do: *add a `package.json` and a `workspaces` glob, or move the
  file out of a production root.*

Scoped to files that actually **produce a crossing**, not to every production file — so a future
`layers/README.md` (production by classification, outside every package, harmless) does not fail the
build. Concretely: the check fires inside `detectImports`' edge loop and at the top of
`detectAstCrossings`' per-file loop, replacing the silent `continue`.

### Files touched

- `scripts/lib/crossings.ts` — `actorFor` gains the file kind; new `UnclaimedProductionFileError`.
- `scripts/lib/crossing-detectors.ts:453` — replace the silent `continue`.
- `framework/db/src/__tests__/governance-crossings.test.ts`.

### Tests

- **Break-test (red before, green after):** attack `unclaimed-production-dir` — overlay
  `layers/rogue/src/backdoor.ts` importing two layers, with **no** `layers/rogue/package.json`.
  Expect the run to fail with the named error. Red at HEAD (PASS), green after.
- **Unit, positive:** a synthetic tree with a production file under a production root and no
  manifest throws, and the error names the path.
- **Unit, negative control:** `scripts/verify-attest.ts` (development, outside every package,
  importing a package) still resolves to the repo-root actor and produces its normal crossing. This
  is the regression that would break legitimate repo-root tooling.
- **Unit, negative control:** a production file outside every package that produces **no** crossing
  (a `.md`, an `.icns`) does not throw.

### Risk

Measured to be zero today: **0 production files sit outside every workspace package**, and **0 of the
80 repo-root edges come from a production-classified file**. All repo-root tooling is development by
`outside-production-roots`, so the "legitimate build script" case is structurally unaffected.

**250 verdicts: unaffected.** `Actor` union unchanged; no new actor sort; the model is not called
differently.

---

## 4 · W-TEST-1 — delete the test that cannot fail

`framework/db/src/__tests__/governance-lint.test.ts:431-437`:

```ts
const patched = CLASSIFICATION_PATTERNS.map((p) => ({ ...p, minFiles: 0 }));
const census = buildCensus({ files: ["layers/a/src/x.ts"], readFile: () => "" });
const belowNone = patched.every((p) => (census.patternCounts.get(p.id) ?? 0) >= p.minFiles);
expect(belowNone).toBe(true);
```

It maps every floor to 0, then asserts a count is `>= 0`. It never calls `patternLive.evaluate`.
`patternLive` could be deleted and it stays green. A test that cannot fail is worse than no test —
it occupies the slot where the real one would go.

**Mechanism.** Replace with a test that calls the thing: build a census whose `patternCounts` clear
every declared floor (inject a synthetic file list sized to each pattern's `minFiles`), assert
`patternLive.evaluate(census)` returns `[]`; then drop one pattern's population by one file and
assert exactly that pattern is reported. That asserts the comparison **and** the reporting path.

**Files touched.** `framework/db/src/__tests__/governance-lint.test.ts`.

**Risk.** None.

**250 verdicts: unaffected.**

---

## 5 · C3 — raw SQL names the table as a string

### The defect

`READ_OPS`/`WRITE_OPS` (`crossing-detectors.ts:270-271`) only see the Drizzle builder. A table named
inside a `sql` template is a string and is never detected:

```ts
await db.execute(sql`insert into teams (id) values ('x')`);   // PASS, crossing count unchanged
```

This is **already the live style** in three production files and one development test — nine sites.
All nine happen to touch their own tables today, which is luck, not enforcement. A service moving one
query to raw SQL to add a `WITH` clause silently leaves the table ACL.

### Mechanism

1. **Physical-name map.** `db-surfaces.ts:78` already parses every `pgTable(` call and takes
   `declaration.name.text`; it throws away `init.arguments[0]`, which is the physical name.
   Keep it: `DbSurfaceIndex` gains `physicalNames: ReadonlyMap<string, string>` (physical → export
   name). Verified: 45 of 45 tables carry a string-literal first argument, including the 3-argument
   form (`pgTable("bets", {…}, (t) => […])`).
2. **Detect the tagged template, not the `execute` call.** A new branch on
   `ts.isTaggedTemplateExpression(node)` whose tag resolves to `sql` from `drizzle-orm` — resolved
   **through the C2 binding resolver**, so `import { sql as SQL }` is covered by the same mechanism.
   Detecting the template rather than `db.execute(...)` also covers `tx.execute`,
   `exec.execute`, and a `sql` fragment handed anywhere.
3. **Keyword-anchored match.** For each physical name, match
   `/\b(from|into|update|join|table|truncate|on)\s+"?<name>"?\b/i` against the template's source
   text. The anchor is load-bearing: without it, generic names (`items`, `users`, `teams`,
   `sessions`) collide with prose and with interpolated Drizzle column references. Measured against
   the live tree, the anchored form yields exactly the 9 real sites and zero false positives.
4. **Verb decides read vs write.** Statement verb first, so `delete from x` is a write and not also
   a read: `insert into|update|delete from|alter table|truncate|create index … on|drop` → `table:write`;
   `from|join` → `table:read`. One crossing per (statement, table) pair.

### Files touched

- `scripts/lib/db-surfaces.ts` — expose `physicalNames`.
- `scripts/lib/crossing-detectors.ts` — the tagged-template branch; reuse `buildTableRefs` for the
  tag identifier.
- `scripts/lib/crossings.ts` — pass `physicalNames` through `AstDetectorInput`.
- `framework/db/src/__tests__/governance-crossings.test.ts`.

### Tests

- **Break-test (red before, green after):** attack `raw-sql-foreign-write` — a production file in
  `layers/core-api/work/src/` doing ``db.execute(sql`insert into teams (id) values ('x')`)``.
  Expect `service → db:table (other) [table:write] production`. Red at HEAD, green after.
- **Unit, positive:** `insert into`, `update`, `delete from`, `select … from`, `left join`, and a
  quoted `"knowledge_items"` each produce the right kind and name the right export symbol.
- **Unit, negative control:** a `sql` fragment interpolating Drizzle columns
  (``sql`${knowledgeItems.title} ILIKE ${p}` ``) produces **no** crossing — that path is already
  counted by the builder detector, and double-counting would inflate every floor.
- **Unit, negative control:** ``sql`CREATE TABLE items_int_test (…)` `` (a name that is not a table)
  and a comment containing the word `teams` produce nothing.
- **Unit, negative control:** an unanchored occurrence (`-- rebuild the items cache`) produces
  nothing.

### Risk

The false-positive surface is the real risk, and it is what the three negative controls exist for.
Measured live impact: **+9 crossings, 0 new violations** (3 own-table production, 6 development
foreign writes of non-companion tables). `table:read`/`table:write` floors move up — recomputed in
item 6, which is why item 6 runs last.

Second-order: DDL on your own table now counts as `table:write`. In production that is
`store-owner-only` → allowed for the owner, forbidden for anyone else, which is exactly right and
already the rule.

**250 verdicts: unaffected.** New crossings are fed to the existing clauses; no clause, registry or
row changes.

---

## 6 · exec / execSync — the spawn detector cannot see a command string

Folded in from review §8, because it is a sight gap of exactly the covered kind, not slop.

`SPAWN_FUNCTIONS` (`crossing-detectors.ts:278`) contains `exec` and `execSync`, but the detector
reads `arguments[0]` as a *binary name*. `exec`/`execSync` take a whole command string, so
`execSync("claude -p 'do the thing'")` never matches `HARNESS_BINARIES` and is invisible. Same act,
different API — inside the bar.

**Mechanism.** For `exec`/`execSync` only, take the first whitespace-delimited token of the string
literal, strip a leading path, and test that against `HARNESS_BINARIES`. `spawn`/`spawnSync`/
`execFile`/`execFileSync`/`fork` keep the existing whole-argument behaviour, which is correct for
them.

**Files touched.** `scripts/lib/crossing-detectors.ts`.

**Tests.** Break-test attack `exec-string-harness` (`execSync("claude -p x")` in a production file
outside `agent-execution` → `capability → harness` forbidden; red before, green after). Unit negative
control: `execSync("git show HEAD:CLAUDE.md")` — which exists live at
`layers/agent-orchestration/filesystem-mounting/src/__tests__/git-worktree-live-proof.integration.test.ts:216`
— produces nothing.

**Risk.** None measured: zero live `exec`/`execSync` calls name a harness binary, so this adds 0
crossings today.

**Deliberately NOT done:** removing `gh` from `HARNESS_BINARIES`. `.claude/rules/testing.md` says
`gh` is a tool and not an agent harness, and `crossing-detectors.ts:276` labels it an "Agent CLI" —
those disagree. But resolving it *removes* a detection, and this plan only adds sight. It is a
registry-of-fact question for the founder, listed in §11.

**250 verdicts: unaffected.**

---

## 7 · C6 / C7 — make a rotted floor structurally impossible

### The defect

Three separate failures of the same kind:

- `governance-context.ts:52` records measured `di = 257`. Live: **245**. Twelve crossings lost, and
  the floor of 200 was loose enough not to notice — the exact rot the floors exist to catch, in the
  file that declares them.
- `repo-census.ts:172-187` documents 3,256 tracked / 2,467 development. Live: **3,296 / 2,507**.
  `outside-production-roots` is documented at 1,064; live is 1,102.
- **No test asserts `DETECTOR_FLOORS`, `MIN_TRACKED_FILES`, or any `minFiles` magnitude.** A
  "measured" constant with no check is the same artifact as `au6`.

And the slack is wildly uneven: `MIN_TRACKED_FILES = 1000` against 3,296 live is **70% slack**, while
detector floors sit at 10–28%. A floor with 70% slack is not measuring anything.

**On the missing 12 `di` crossings.** Only `di` (−12) and `import` (+3) moved since `a739d94d`, the
commit that recorded the numbers. `1942ec6f` (step 6, strategy sense-1 purge) deleted the
`applyFactoryBootstrap(db, roster?)` parameter, `minimalFactoryRoster`, its barrel export and
`AK6-factory-roster.integration.test.ts` — all injected-port-shaped call sites. This is almost
certainly real code deletion, not a detector regression. **It must still be confirmed, not assumed:**
the file's own lore says "a drop means the detector broke, not that the repo got cleaner." Bounded
task — check out `874a6c27` in a scratch worktree, print `countsByKind`, and record the verdict
(*code deleted* or *detector regressed*) in the recompute commit message. If it is a regression, that
becomes its own defect and this plan is amended.

### Mechanism — the floor becomes a BAND

A floor today has one edge: live below it → throw. Add the other edge.

> A **magnitude** floor `F` for a live count `L` is valid iff
> `L - F <= max(ceil(L × 0.20), 5)` **and** `F <= L`.
>
> Below the floor → the existing hard throw (the detector broke).
> Above the band → a new **error**: the floor has gone slack and no longer measures anything.
> Re-measure and raise it.

Rejected alternatives, and why:

- **Self-recomputing floor** (derive from live at run time) — circular. It can never fail. This is
  the single worst option and it is the tempting one.
- **A pinning test** — a unit test cannot measure the live tree without reading the filesystem, which
  CLAUDE.md correctly forbids in a test; and the live-tree property is static, so it belongs in the
  lint. The *band predicate itself* is runtime logic and does get a unit test.

Two supporting pieces:

1. **`floorKind: "magnitude" | "existence"`** on every declared floor. The enumerated-set patterns
   (`development-root:tools`, `test-runner-config:*`) are existence checks over a closed list, floor
   exactly 1, and are **exempt from the band by declaration**. Making it a declared field rather than
   a heuristic on the number 1 stops anyone dodging the band by writing `minFiles: 1` on a magnitude
   pattern.
2. **`npm run governance:floors`** — prints, for every detector floor, every classification pattern
   and `MIN_TRACKED_FILES`: live count, declared floor, slack, allowed slack, verdict, and the value
   to write. Re-measuring becomes one command instead of archaeology. This is the thing whose absence
   caused the rot.

### The recompute (run **after** items 2–6 land, since C2/C3 grow three counts)

Against today's tree the band requires raising six floors and leaves every classification-pattern
floor valid:

| floor | live | now | slack | allowed | action |
|---|--:|--:|--:|--:|---|
| `import` | 3665 | 3300 | 365 | 733 | ok |
| `manifest` | 124 | 110 | 14 | 25 | ok |
| `di` | 245 | 200 | 45 | 49 | ok (and re-record 257 → live) |
| `api` | 140 | 110 | 30 | 28 | **raise → 112** |
| `mcp` | 25 | 18 | 7 | 5 | **raise → 20** |
| `event` | 240 | 190 | 50 | 48 | **raise → 192** |
| `capability` | 11 | 8 | 3 | 5 | ok |
| `table:read` | 1319 | 1000 | 319 | 264 | **raise → 1055** (re-measure after C3) |
| `table:write` | 2285 | 1800 | 485 | 457 | **raise → 1828** (re-measure after C2+C3) |
| `MIN_TRACKED_FILES` | 3296 | 1000 | 2296 | 660 | **raise → 2636** |
| every magnitude pattern floor | — | — | 12–152 | 18–221 | all ok |

The `max(…, 5)` term is what keeps small-n detectors honest: `capability` at 11 keeps a floor of 8,
because a 20% band would fail the build over three sites of ordinary churn.

### Files touched

- `scripts/governance-context.ts` — `DETECTOR_FLOORS` values + `floorKind`; `MIN_TRACKED_FILES`;
  rewrite the measured-numbers comment.
- `scripts/lib/repo-census.ts` — `floorKind` on `ClassificationPattern`; rewrite the
  measured-numbers lore block at `:172-187`.
- `scripts/rules/floors-tight.ts` (new) — the band rule. Its own population is the set of floors it
  checks (9 detector + 10 pattern + 1 census = 20), `minScope: 20`, so deleting a floor trips
  `DeadRuleError`.
- `scripts/governance-floors.ts` (new) + `package.json` script.
- `scripts/governance-lint.ts` — register the rule.
- `framework/db/src/__tests__/governance-lint.test.ts` — band predicate tests.

### Tests

- **Break-test (red before, green after):** attack `slack-floor` — the rule is run with a synthetic
  floor set where one magnitude floor sits at 50% of live; expect one error naming that floor. Red at
  HEAD (the rule does not exist), green after.
- **Break-test:** attack `existence-floor-exempt` — an existence floor of 1 against a live count of
  94 produces **no** finding. Without this, the band would demand a nonsensical floor of 76 on
  `development-root:tools`.
- **Unit:** the band predicate, table-driven — at the boundary, one over, one under, and the
  `max(…, 5)` term for `L = 11`.
- **Unit:** a magnitude floor declared as `1` is reported, so `floorKind` cannot be used to dodge.

### Risk

Ongoing friction: growth past the band fails the build until someone raises a number. Sized
deliberately — `import` at 3,300 stays valid until live reaches 4,125. That is plenty of room for
churn while still catching a doubling. `npm run governance:floors` makes the fix a copy-paste.

**250 verdicts: unaffected.** Floors are measurement liveness; the model is not consulted.

---

## 8 · Break-testing as a standing practice

> Founder: *"We should always check if the linter works by manually adjusting some things and trying
> to break it."*

Today that happened once, by hand, in a review. `--fixtures` exists but its 40-file synthetic tree
has no database package, no table owners and no service barrels — which is precisely why C2, C3 and
C1 were invisible to it. Its cases cover only `noProductionImportsDevelopment`. The real negative
controls live in vitest and **do not run in `npm run lint`**.

### The mechanism: an attack table, run against the REAL tree by overlay

One shared case table, `scripts/lib/governance-attacks.ts`:

```
interface Attack {
  id: string;
  detail: string;                     // the style someone would plausibly write
  rules: readonly string[];           // rule ids this case exercises
  overlay: Readonly<Record<string, string>>;   // path -> source, ADDED to the tree
  expect:
    | { sort: "violation"; file: string; groupKey: string }
    | { sort: "throws"; messageContains: string }
    | { sort: "clean"; file: string };          // the CONTROL twin
}
```

The runner takes any base tree and applies the overlay through the `readFile` seam:
`files: [...base, ...Object.keys(overlay)]`, `readFile: p => overlay[p] ?? readRepoFile(p)`.
**Nothing is written to disk.** This is the honest realization of "mutate real code": the tree is the
actual repository, the mutation is real code in a real package with real table owners and real
barrels — the census's injected-I/O design is what makes it free.

Two invocations of the same table:

| tier | base tree | where | cost |
|---|---|---|---|
| **live** | the real repo | `npx tsx scripts/governance-lint.ts --attacks`, wired into `npm run lint` | ~5.5 s — one census, one detect, **all** cases overlaid in a single pass |
| **synthetic** | the fixture tree | vitest, `framework/db/src/__tests__/governance-attacks.test.ts` | ~1 s, no filesystem |

Cases that need the real database package declare `tier: "live"`. Everything else runs in both, and
the vitest tier is what gives a red-green loop during development without a 5-second turnaround.

### The four anti-rot properties — the harness must not become `au6` itself

1. **Every attack must produce its expected finding.** That is the assertion.
2. **Every attack has a CONTROL twin** — the same act written the legal way, asserting *no* finding
   at that path. Without twins, a detector that flags everything passes every attack.
3. **The overlay must be additive.** Each overlaid path must not already exist in the base tree; the
   runner fails if it does. This is what keeps the live tier from silently testing nothing after a
   rename.
4. **A registered governance rule with no attack case is a build error.** The runner cross-checks
   the union of `Attack.rules` against the live rule registry and fails on any rule nobody attacks.

Property 4 is the founder's practice turned into a gate: from the commit it lands, **a new rule
cannot ship without a break-test**, and this is the same mechanism that closes W-TEST-3 permanently
rather than one time.

### Starting case set

All six evaded attacks from review §1, each with a control twin, plus one per currently-untested
rule. Every case in this list is **RED at HEAD** except the two marked, which is what makes this the
red phase for items 2–6 and 9:

| id | rule(s) | at HEAD |
|---|---|---|
| `alias-import` / `alias-const` | `crossing-table-write` | RED |
| `raw-sql-foreign-write` | `crossing-table-write` | RED |
| `unclaimed-production-dir` | census | RED |
| `reexport-table` / `reexport-narrow-surface` | `no-laundered-re-exports` | RED |
| `exec-string-harness` | `crossing-capability` | RED |
| `slack-floor` / `existence-floor-exempt` | `floors-tight` | RED |
| `cross-layer-import` / `production-imports-development` / `foreign-table-write` / `missing-companion` / `baseline-growth` | existing | **GREEN** (regression locks on what already works) |
| one case each for `crossing-api`, `crossing-mcp`, `crossing-import`, `crossing-manifest` | those four | new — closes W-TEST-3 |

### Implementation notes the builder will otherwise trip on

- Overlay paths must **not** start a segment with `__`: `hasDunderSegment` (`repo-census.ts:101`)
  splits on `/` and a *filename* is a segment, so `__attack-x.ts` classifies as **development** and
  the production attack silently becomes a development one. Use `attack-<id>.ts`.
- Attacks must not interact: distinct paths, distinct tables, distinct symbols. Each assertion is
  scoped to its own path.
- The attack pass runs `violationsOf(...)` over the overlaid crossings. It must **not** run
  `baselineRatchet` or `refuseGrowth` — the overlay is not debt and must never reach the baseline.
- The synthetic fixture tree needs a small real-shaped database package (a `schema.ts` with two
  `pgTable`s, a barrel, a `zod-schemas.ts`, a two-entry `moduleSurface`, a two-table owner registry)
  before the C2/C3/C1 cases can run in the fast tier. That is the bulk of the work in this item.

### Files touched

`scripts/lib/governance-attacks.ts` (new), `scripts/lib/governance-fixtures.ts` (the synthetic db
shape), `scripts/governance-lint.ts` (`--attacks`), `package.json` (`lint` chain),
`framework/db/src/__tests__/governance-attacks.test.ts` (new).

### Risk

The 5.5 s added to `npm run lint` is the honest cost, against a chain already dominated by biome +
eslint and already running `governance-lint` twice. Alternative considered and rejected: a separate
`npm run governance:break` outside `lint`. Rejected because a check outside the default gate is a
check nobody runs — which is the entire reason this item exists.

**250 verdicts: unaffected.**

---

## 9 · C1 — re-export laundering

### The defect

The model reasons **per edge** with no transitive reach. Both hops are individually legal:

```ts
// hop 1 — layers/core-api/work/src/index.ts   (the service's own barrel)
export { bets as betsTable } from "@hyperidle/db";
//   → import → db:table `bets`, owner `work`, source `work`  → store-owner-only → ALLOWED

// hop 2 — layers/core-api/src/app.ts
import { betsTable } from "@hyperidle/work";
//   → import → service (same layer)                          → reach-your-own-contents → ALLOWED
insert(betsTable)   // and the table detector never saw a table
```

Result: `governance-lint: PASS`. A layer writes a table owned by another service.
`layers/core-api/work/src/index.ts:3-7` already carries a hand-written comment forbidding exactly
this. **The codebase knows. The only enforcement is the comment.** The same hop nullifies audiences
generally: re-export `escapeLikePattern` from a service barrel and `db:util`'s `reach: ["service"]`
is void.

### The two options, and the recommendation

**(a) The model follows re-export edges to the defining module.** Deeper: it fixes both hops, fixes
3-hop chains, and types the *consumer*'s import against the true target. Cost: a transitive
symbol-resolution closure over `export {a} from`, `export *`, `export * as ns`, with aliasing, in
`repo-census.ts`/`crossings.ts`. Risk: it **re-keys existing edges** — the two live cross-package
re-exports in `layers/core-api/src/session.ts` are already baselined as
`layer → service (other layer) [import] production` ×2, and re-typing them churns the baseline. It
also touches the census that every other rule stands on.

**(b) A rule that a package may not re-export a surface it does not own.** Local, one rule, one file,
no census change, and the error message points at the launderer, which is where the fix belongs.

**Recommend (b)**, in a narrowed form, and record (a) as the deeper fix deliberately deferred.
Three refinements make (b) actually close the proven attack:

1. **A `db:table` symbol may never be re-exported across a package boundary — not even by its
   owner.** Owner-ship does not help: `work` re-exporting its own `bets` is exactly the laundering
   vector for `core-api`. This is precisely what the hand-written comment already says.
2. **Otherwise, forbidden only when the surface's audience is narrower than `everyone`.**
   Re-exporting `framework/shared` (reach `everyone`) launders nothing — any consumer could import it
   directly. Eight of the fourteen live cross-package re-exports are exactly this, and they must stay
   clean or the rule dies of noise.
3. **Within-package re-exports are out of scope.** `framework/db/src/index.ts` re-exporting its own
   `./schema.js` **is** the surface's publication; `db-surfaces.ts` already resolves it correctly.

**Implement it as a standalone rule, not a new crossing kind.** A new `Kind` would force an edit to
`governance-model.ts`'s `Kind` union and to the hardcoded 9-kind array in
`governance-model.test.ts:403-414` — and the constraint says that test must stay unchanged. A new
kind would also **double-count** the two `session.ts` statements, which the `import` detector already
reports. So the rule emits findings directly with its own group key and does not call `decide()`.
Trade-off accepted and stated: verdicts for this rule do not come from a clause. Justified because
the question it asks — *does re-exporting widen the audience?* — is one the model does not answer,
and inventing a clause for it would be a rule change.

### Mechanism

For every `ExportDeclaration` with a module specifier that resolves (via `census.edges`) into a
**different** workspace package:

- resolve each exported symbol's surface — the database package via `DbSurfaceIndex.resolve`,
  a framework package via the `frameworkSurfaces` map, anything else → out of scope;
- `db:table` → **error**, whoever the re-exporter is;
- a declared surface whose `reach !== "everyone"` → **error**;
- `export *` / `export * as ns` from another package → treat as taking every surface → **error**
  unless every reachable surface is `everyone`;
- anything else → clean.

Population for the liveness floor: **every `export … from` statement resolving into the census** —
491 live, floor 400. Not the 14 cross-package ones: the rule is *about* re-exports, and keying the
floor to the violation surface would kill the rule the day someone cleans up the eight `shared`
re-exports.

### Files touched

- `scripts/rules/no-laundered-re-exports.ts` (new).
- `scripts/governance-lint.ts` — register it.
- `scripts/lib/crossings.ts` — expose the surface resolution the rule needs (or pass the
  `DbSurfaceIndex` through `governance-context.ts`, as `crossingRules` already receives derived state).
- `framework/db/src/__tests__/governance-crossings.test.ts`.

### Tests

- **Break-test (red before, green after):** attack `reexport-table` — add
  `export { bets as betsTable } from "@hyperidle/db";` to a service barrel. Red at HEAD (PASS), green
  after. Paired **control**: the same barrel exporting a row type (`db:row-type`, reach `everyone`) →
  clean.
- **Break-test:** attack `reexport-narrow-surface` — `export { escapeLikePattern } from "@hyperidle/db";`
  from a service barrel (`db:util`, reach `["service"]`) → error. Control: the same symbol
  **imported** and used, not re-exported → clean.
- **Unit:** `export * from "@hyperidle/db"` errors; `export { X } from "@hyperidle/shared"` (reach
  `everyone`) is clean; a within-package `export { bets } from "./schema.js"` inside the database
  package is clean.

### Risk

**Measured live violations: 0.** All fourteen cross-package re-exports are either
`framework/shared` (reach `everyone`, ×8), a layer publishing its own contained service's symbols
(×4, legitimate — that is the public-face mechanism the model already sanctions), or the two
`session.ts` statements whose target is a *package*, not a surface, and which stay out of this rule's
scope (already counted once as `import` violations). So the rule lands **at error from day one with
no baseline entry and no `--adopt`** — the strongest possible position, and it is only available
because of the narrowing.

The residual hole under (b): a package re-exporting a symbol it legitimately contains, then a foreign
consumer reaching it. That is the designed layer-public-face mechanism, not a hole. The genuine
residual is a 3-hop chain that stays inside `everyone` surfaces — which launders nothing. Recorded as
a `@lore` limit alongside the rule, with a pointer to option (a).

**250 verdicts: unaffected.** `governance-model.ts` and `governance-model.test.ts` are not touched at
all.

---

## 10 · W-TEST-2/3, and the two folded defects

### W-TEST-2 — the 250-verdict loop passes vacuously

`governance-model.test.ts:186-209` filters and asserts `expect(wrong).toEqual([])` twice. An empty
`rows` passes. Add a counter inside each loop and `expect(checked).toBe(125)` per world.

**This is an addition, not a change** — the constraint requires the file to keep reproducing all 250
verdicts, and adding an iteration assertion strengthens exactly that. No decided row, no clause and
no existing assertion is modified. **250 verdicts: unaffected.**

### W-TEST-3 — four of nine detectors have no behavioural test

`api`, `mcp`, `import`, `manifest`. `import` alone is 3,665 of 8,054 crossings and rests on a floor
with 10% headroom and nothing else. `detectImports` and `detectManifests` are module-private in
`crossings.ts`; test them through the exported `detectCrossings` with a synthetic repo and
`floors: []`. Each gets a positive case and a negative control:

- `import` — a db edge splits per symbol (row type + table in one statement = two crossings, two
  different surfaces); control: two files in the same package produce no crossing.
- `manifest` — a `dependencies` row in a shipping package is production and a `devDependencies` row
  is development; control: an external dependency produces nothing.
- `api` — `apiFetch`, a typed port call, a raw `fetch("/api/…")` resolved via `layerServing`;
  control: a same-layer route is not a crossing.
- `mcp` — `createMcpRouter`, `registerTool`; control: `registerTool` on something that is not the
  router… (kept honest: the detector cannot tell, which the file's own lore already admits — the
  control therefore asserts the *documented* behaviour rather than pretending otherwise).

§8 property 4 then keeps this closed forever.

### `validateTableOwners` has exactly one caller: a test

`governance-registry.ts:83`. `governance-lint.ts` calls only `validateArchitecture`, so the README's
promise — *"A new table → give it an owner in `table-owners.json`. The build fails until you do; that
is the point"* — **is not enforced**. Same shape as `au6`: a check that exists and runs nowhere.

**Mechanism.** `registriesHonest(architecture)` gains the table registry and the live table set, and
calls `validateTableOwners` in the same `try/catch` as `validateArchitecture`. **Verified against the
live tree: it passes today**, so wiring it in is free.

**Test.** Break-test attack `unowned-new-table` — overlay a `schema.ts` with one extra `pgTable` the
registry does not claim; expect the `claimed by nobody` error. Red at HEAD, green after.

**250 verdicts: unaffected.**

### `ownerOf` reads through the prototype chain

`governance-registry.ts:120-121` uses `in`, not `Object.hasOwn`; same pattern at `:72`,
`governance-context.ts:110`, `db-surfaces.ts:140` and `:184`. A table named `constructor` /
`valueOf` / `toString` escapes the unknown-table throw.

**Judged against the bar, honestly:** this is **not** "the same forbidden thing written a different
way" — nobody names a table `toString` as a style choice, and even the bug fails *closed*
(`ownerOf("toString")` returns `Object.prototype.toString`, which equals no package name, so the
crossing is forbidden anyway). It is included only because it is a five-line correctness fix in code
that is otherwise disciplined, and ranked last for exactly that reason. It is **not** the reason to
open any of these files.

**Test.** One unit case: `ownerOf(registry, "constructor")` throws `RegistryError`.

**250 verdicts: unaffected.**

---

## 11 · Explicitly NOT in scope

**C5 — the swap within one file.** On a real baselined site, renaming every occurrence of unowned
`taskDispatchAttempts` to unowned `sessions` produces three new violations for three cleared ones,
with no `stale` and no `newDebt`: the key `(group, file, count)` does not name the table, and
`targetLabel` collapses every unowned table to `db:table (unowned)`. Recorded as a **known limit**.
It is closer to gaming than to a style difference, and the fix — narrowing the group key to include
the table — would re-key the baseline's 38 groups wholesale for a case nobody writes by accident.

**This does NOT require a rule change** (a key is not a verdict); it is excluded by scope, not by the
constraint.

**The `@lore` in `crossing-report.ts:147-150` must be corrected in this work package.** It currently
claims the bidirectional ratchet "defeats the swap, where one violation is fixed and another
introduced in the same commit so the total never moves." That is true **across files and across
groups** — and `governance-crossings.test.ts:360` proves that case honestly — but **false within one
`(group, file)` pair**. Rewrite to state both halves. The claim being wrong in the file that makes it
is worse than the gap itself.

**Also out, and correctly so:**

- **Untracked files.** The census is `git ls-files` by design; a file not tracked is not part of the
  repository. Nothing to fix.
- **Template-interpolated specifiers, `require(variable)`, `spawn(variable)`.** Value-flow analysis.
  A linter cannot win these and should not pretend to — a partial implementation reads as complete,
  which is the failure mode this whole design exists to prevent.
- **`eslint-disable` and deleting the rule.** The founder ruled: linters are guidance, never
  unbreakable. Building against this is anti-malice theatre. **Rejected.**
- **A new vendor SDK invisible to `RAW_RUNTIME_SPECIFIERS`.** Importing a different vendor is a
  different act, not a different style. The file's lore already states this honestly. Moving the list
  into `architecture.json` buys no sight and is not worth the churn.
- **Value-flow table aliasing** (`const T = { bets }; insert(T.bets)`) — see §2's stated boundary.
- **`dep-manifest-lint.ts`'s second census** (review §8). Real defect, contradicts "one census, many
  rules" — but it is a consolidation, not a sight gap. Separate work package.

### The one item that DOES need a rule change

**`harness` vs `raw-runtime` in the development world** (review §7). Both are forbidden outside
`agent-execution` in production, justified by the *same* `rawRuntime.why` ("every model **and
harness** call goes through one door"), but `oneDoorSurfaces.rawRuntime` holds only `raw-runtime`:

```
raw-runtime   prod: forbidden | dev: forbidden  (held: one door)
harness       prod: forbidden | dev: allowed
```

A test importing the OpenAI SDK is held; a test spawning `claude` directly is waved through, around
the same door, by the clause's own rationale. `decided-rules.json` has no `service → harness`
capability row, so **the founder was never asked**. `npm run governance:new-cells` already surfaces
it. **This cannot be resolved by a detector and is out of scope for this plan** — it needs a founder
ruling, after which it is a one-field registry edit.

The same applies, at much lower stakes, to **`gh` in `HARNESS_BINARIES`** (§6): a fact question, not
a sight question.

---

## 12 · Acceptance criteria

Each criterion names how it is verified. `{{verify}}` = `npm run verify`; fast loop is
`npm run lint:governance` + `npm run test:full -- governance`.

| # | criterion | verification |
|---|---|---|
| AC-1 | All 250 verdicts still reproduce, and `governance-model.test.ts` is byte-identical except for the two added `expect(checked).toBe(125)` assertions | `git diff --stat` on that file + `npm run test:full -- governance-model` |
| AC-2 | `governance/decided-rules.json`, `governance/architecture.json` surfaces/endpoints/oneDoorSurfaces, and `governance/table-owners.json` verdicts are unchanged | `git diff` — empty for `decided-rules.json`; any registry change is a factual correction, called out in the commit message |
| AC-3 | `scripts/lib/governance-model.ts` is unchanged | `git diff` empty |
| AC-4 | Every one of the six evaded attacks from review §1 that is in scope (C1, C2 ×2, C3, C4, plus `exec-string-harness`) is RED at `1942ec6f` and GREEN at HEAD | `npm run lint` runs `--attacks`; the red state is demonstrated by running `--attacks` against a stash of the pre-fix detector and recorded in the commit message |
| AC-5 | A registered governance rule with no attack case fails the build | attack-runner unit test: register a synthetic rule, assert the runner errors |
| AC-6 | A magnitude floor with more than `max(20%, 5)` slack is an error; an existence floor is exempt | `floors-tight` unit tests + `npm run governance:floors` output |
| AC-7 | Every documented "measured" number in `governance-context.ts` and `repo-census.ts` matches live at the shipping commit | `npm run governance:floors` prints zero drift |
| AC-8 | The `di` 257 → 245 drop is attributed — code deletion or detector regression — in writing | verdict recorded in the recompute commit message, backed by a count at `874a6c27` |
| AC-9 | The live tree stays green: no new violations, no baseline growth, no `--adopt` | `npm run lint` + `npx tsx scripts/governance-baseline.ts` reports delta 0 in both worlds |
| AC-10 | `validateTableOwners` runs in `npm run lint`, and an unclaimed new table fails the build | attack `unowned-new-table` |
| AC-11 | `governance-lint.test.ts` contains no test that passes without calling the thing it names | the rewritten `patternLive` test fails when `patternLive.evaluate` is stubbed to `[]` |
| AC-12 | The `@lore` at `crossing-report.ts:147-150` states both halves of the swap truth | read the diff |
| AC-13 | Nothing else breaks | `npm run verify` |

---

## 13 · Ordered tasks

Red phase first. Each task names the file that proves it.

1. **Attack harness, skeleton + the GREEN regression cases.** `governance-attacks.ts`, the runner,
   `--attacks`, wired into `npm run lint`. Seed with the attacks that already pass (cross-layer
   import, production→development, foreign table write, missing companion, baseline growth) so the
   harness is proven against known-good behaviour before it is trusted for red.
   *Proves:* `governance-attacks.test.ts`.
2. **Add the RED cases** for C2 ×2, C3, C4, C1 ×2, `exec-string-harness`, `unowned-new-table`.
   All fail. This is the red phase and the record that nothing on the list can be skipped.
   *Proves:* `npm run lint` fails with exactly eight named cases.
3. **C2** — `buildTableRefs` + four call sites. → `alias-import`, `alias-const` green.
4. **C4** — production-file-never-repo-root, both sites. → `unclaimed-production-dir` green.
5. **W-TEST-1** — rewrite the vacuous `patternLive` test.
6. **C3** — `physicalNames` + tagged-template branch. → `raw-sql-foreign-write` green.
7. **exec/execSync** first-token. → `exec-string-harness` green.
8. **C1** — `no-laundered-re-exports`. → `reexport-table`, `reexport-narrow-surface` green.
9. **`validateTableOwners`** wired into `registriesHonest`. → `unowned-new-table` green.
10. **Synthetic db shape** in `governance-fixtures.ts`, so the C2/C3/C1 cases also run in the fast
    vitest tier.
11. **W-TEST-3** — behavioural tests for `api`, `mcp`, `import`, `manifest`; **W-TEST-2** — the two
    iteration assertions.
12. **`Object.hasOwn`** at the five sites.
13. **C6/C7 last** — `floorKind`, `floors-tight`, `governance:floors`, the `di` attribution, and the
    full recompute of every documented number. Last because tasks 3, 6 and 7 move three counts.
14. **Correct the `@lore`** at `crossing-report.ts:147-150`; record C5 as a known limit.
15. `npm run verify`.

---

## 14 · Trade-offs and open questions

**Stated trade-offs**

- **C1 as a standalone rule, not a clause.** Its verdict does not come from the model. Accepted
  because the alternative touches a frozen surface, and because the question is genuinely one the
  model does not answer. If the founder later wants it as a clause, that is a rule change with a
  decided row, not a detector change.
- **Option (a) deferred.** Following re-export edges in the census is the deeper fix and would also
  close 3-hop chains through non-`everyone` surfaces. Deferred because it re-keys live baselined
  violations and touches the substrate every rule stands on. The narrowed (b) closes the *proven*
  attack completely; (a) is a future work package with a clear trigger — the first laundering case
  (b) cannot see.
- **The band's 20% / floor-5 shape** is a judgement, not a measurement. It was chosen so that no
  classification-pattern floor moves and exactly six detector floors move — i.e. the tightest band
  that is actionable in one commit. If it proves noisy, the number is one constant.
- **+5.5 s on `npm run lint`** for the live attack tier. Bought deliberately: a break-test outside the
  default gate is a break-test nobody runs.

**Open questions — neither blocks the work**

1. **`harness` in the development world** (§11) — needs a founder ruling. `governance:new-cells`
   already lists it.
2. **`gh` in `HARNESS_BINARIES`** — `.claude/rules/testing.md` says it is not an agent harness; the
   detector says it is. One live detection hangs on it, and it is not a violation either way.
   Resolving it *removes* sight, so this plan leaves it alone.
