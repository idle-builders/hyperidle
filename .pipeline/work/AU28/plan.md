# AU28 — Define and hard-lint one canonical interface architecture between every Layer and Service boundary

**Status: shipped 2026-08-07.**

## What we need

One canonical, strictly defined interface architecture governing how every Layer and Service may talk
to every other one — written down as a specification, not scattered convention, and mechanically
enforced — so the layering rules stop being re-derived ad hoc from whichever complaint surfaced a gap.

The evidence is the previous attempt. AU21's merge-gating guard was built with real rigor and
checked exactly one of two directions; the reverse — core-api reaching into agent-orchestration and
agent-execution through 38 raw imports across 19 files — sat unguarded the whole time, and the
detector feeding that confidence had three bugs of its own. Nobody was careless; there was simply
never one definition of what makes a crossing legal. The founder, verbatim: *"DI imports across
layers are absolutely forbidden. zero exceptions and should be linter forbidden … interfaces between
layers must be very strictly defined and no other mechanism should work. hard linted."*

The rule as stated: **DI is legal only within one Layer** — an injected port crossing a Layer boundary
is forbidden, and it is the crossing import-based checks cannot see by construction. **A Layer may
import only from `shared` or from within itself.** **Cross-Layer conversation goes through API, MCP or
events**, nothing else. **Every table has exactly one owning service, and only that service may read or
write it** — a table with no owner violates a completeness rule rather than forming a third kind of
cell. **A production file may never import a test or tooling file**, one direction, no exceptions.

Two constraints shaped the design most. **Role is never derived from a directory path** — it comes from
the manifest or an explicit registry, so a later restructure changes no verdict — and **production and
test/tooling are two worlds with two rule tables**, not one table with carve-outs, which is what rots.

**AU28 ships the rules, the linting and the ratchet; it performs no cleanup.** Relocation, the
`shared` split, the `api-contract` re-cut, assigning `sessions` an owner and dissolving cross-Layer
DI are named successors, as are AU26's question of *where* domains live and the composition-root split.

## How it works

**Clauses are principles in code, registries are facts in JSON, decided rules are frozen decisions.**
A clause holds no package name, table name or path. Fifteen clauses are checked in order, first match
wins, default forbidden, total over every crossing. The 124 founder-decided rows are the engine's
acceptance test: the model is correct only if it reproduces all 248 verdicts (124 rows × two worlds)
exactly, asserted with an iteration counter so an empty row set cannot pass vacuously; a mutation test
killed 12 of 12 single-clause mutants. **Nine crossing kinds** are detected by AST over a single census
sourced from git: import, manifest, DI, API, MCP, event, table read, table write, capability.

**There is no warn/error dial.** Every rule is an error; a baseline file lists the violations that
existed when its rule landed, and only those warn. It may only ever shrink — the generator refuses to
add a group or raise a count — so clearing a group's last site deletes the entry and that rule is at
error from the same commit. Promotion is what fixing a violation does, not a later step.

**Break-testing is itself a gate.** The lint run replays 47 attacks overlaid onto the live census
through an injected file-read seam — the real repository, nothing written to disk — and the
load-bearing anti-rot property is that a registered rule with no positive attack case fails the build.
Every rule declares its scope and a minimum size, and the runner throws when a scope falls below it,
because a guard silently passing on a directory that no longer exists is the exact defect this
replaces. Rules are pure predicates over the census, banned from their own file discovery.

**Twenty inherited guards were deleted** against fifteen rules added — net −2,007 lines — under the
clean-slate ruling that every past rule is assumed wrong, having been made inside the frame this work
replaces. Nothing was inherited on authority, not table ownership, not the execution boundary, not
AU21's own zero-edge end state. The old guards were mined for signal instead: what went wrong, whether
it can still happen, and the technique (manifest and import checks are both needed, because hoisting
resolves undeclared imports; AST parsing beats name-voting).

**One door, one name.** "Raw runtime" (importing a model vendor SDK) and "harness" (spawning an
agent CLI) were two detector details leaked into the vocabulary as two nouns for one act; they had
already produced a live contradiction where a test importing an SDK was blocked while a test spawning
`claude` was waved through. They collapse into one rule — *every model and agent call goes through one
door, so it can be recorded, priced and replayed* — in both worlds, no development relaxation. And **a
harness is only ever an LLM harness**: `builtin`, `claude`, `codex`, `opencode`, `cursor-agent`; `gh`
is the GitHub CLI and left that vocabulary. What an agent can reach is permissions and filesystem, not
a harness property, so relocating `inheritedTools` off the harness descriptor is its own work package.

## How we work on this

**290 baselined violations remain** — 221 production, 67 development — none silent, each registered to
a successor: AU29 (framework stops acting), AU30 (every table owned), AU31 (composition roots only),
AU32 (fixtures build producible states), AU34 (split `shared`), AU35 (delete the `strategy` category),
AU36 (reach is permissions, not a harness property). Whichever clearing package empties the baseline
last deletes the file and the `--adopt` escape hatch. Every migration the rules expose is a work
package, never an exemption in the rule set.

**Known limits, accepted deliberately.** Substituting one unowned table for another inside a single
already-baselined file moves nothing, because baseline keys are coarse — defeated across file pairs,
not within one. Value-flow aliasing, template-interpolated specifiers, `require(variable)`,
untracked-file evasion and `eslint-disable` are out of scope by the same bar: they are hiding, not a
different implementation style. A narrow non-table surface re-exported by value still passes, since the
resolver handles tables only, and a read-only SQL template mentioning a write verb in a comment keys as
a write — a deliberate asymmetry, since the reverse would lose the rule in development.

**Loose ends worth knowing.** The dependency-manifest lint ships a second census with its own
discovery, contradicting "one census, many rules". `mcpRouterHost` is threaded through five sites and
read by nothing. Four database symbols fall to an unknown surface on every run as a note rather than an
error, so a module missing from the surface registry stays invisible to the surface rules. And the
harness predicate is near-blind: its test-directory rule matches zero files, so the attestation floor
sees 1 of 12 harness tests.

**Two defects in this work's own machinery.** A red tree was committed while the local gate reported green, because the census read `git ls-files`,
which cannot see unstaged files, so a floor was recomputed against a census missing the very files
being committed; fixed at the source. And CI was broken while every local gate was green, because a
ruling deleted a guard and left a workflow invoking it — the local suite cannot see a workflow file.
Local green is a prediction; *"green is when CI reports green."*
