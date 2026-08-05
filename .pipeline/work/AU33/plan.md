# AU33 — Retire the baseline: governance is enforced unconditionally

## Work package

**Work package.** As a maintainer, I want the known-violation baseline gone and impossible to reintroduce — so that "architectural governance is enforced" is a property of the build rather than a claim about a file's current contents. While `governance/baseline.json` exists, any future violation can be made to pass by adding an entry, and the difference between "we have no violations" and "we have parked them all" is one commit nobody would notice. When this ships, every decided-forbidden rule fails the build on its first violation, there is no mechanism for parking one, and the ratchet's job is done because there is nothing left to ratchet.

**Why this matters.** The baseline was built as a migration surface with a deliberate expiry: it exists so a rule can land at warn while its violations are cleared, and it is the only remaining way to make the governance lint pass over a violation. Leaving it in place after the last entry clears would preserve the escape hatch permanently, and an escape hatch that nobody needs is the one that gets used at 2am. The maintainer benefits directly: after this, the answer to "is this boundary enforced?" is the same for every rule and needs no reading of a data file. The cost of not doing it is that the four preceding work packages deliver a clean tree with the parking apparatus still bolted on.

**Type.** infra / tooling.

**What exists today.** `governance/baseline.json` lists known violations keyed by group and by site; `scripts/rules/crossings.ts` reads it so a listed site warns instead of erroring, and `baselineRatchet` fails the build in **both** directions — when a group grows and when it shrinks — so the file cannot silently drift and a fix cannot be swapped for a new violation. `npm run governance:baseline` (`scripts/governance-baseline.ts`) is the only writer. `scripts/governance-context.ts` is the single place that touches the filesystem, and `loadBaseline()` lives there. `governance/README.md` documents the three-way split — clauses are principles in code, registries are facts in JSON, decided rules are frozen decisions — and the baseline is none of the three; it is scaffolding.

**What's genuinely missing.** Only the removal itself and the guard that makes it stick. Everything this work package needs already exists.

**Depends on.**
- **AU29** — clears the `framework/db`, `db:util`, `db:unknown` and event-bus entries; the file cannot be deleted while they remain.
- **AU30** — clears the unowned-table and foreign-table production entries.
- **AU31** — clears the composition-root, cross-layer-import, DI, MCP and API entries.
- **AU32** — clears every development-world entry.

**Complexity.** S

**Engineering tier.** production.

**Pre-build gates.**
- **Refinement:** Not required — the goal is clear and introduces no noun; the baseline's purpose and expiry are already written down in `governance/README.md`.
- **Design:** Not required — tooling, no UI surface.

**Human review gates.** Yes — mandatory for every work package. Brief here: the change is small, but it is the one that makes every other rule unconditional, so the founder should see the final state of what is enforced.

**Plan calls.** Standard pass, and a short one. One thing to get right rather than assume: removing the baseline must not remove the ratchet's *other* guarantee. The bidirectional, site-keyed check is what defeats "the swap" — fixing one violation while introducing another — and if that property only ever existed relative to a baseline, the plan must say what replaces it, or state plainly that a zero baseline makes it moot because any new site is now an error on its own. Do not delete the ratchet's tests along with the file.

**Contracts / constraints.**
- The baseline is deleted, not emptied. An empty file is a re-openable door.
- Reintroducing the file, or any equivalent parking list, fails the build with a message that says why.
- No rule's severity is lowered, and no new ignore entry is added, to make this land.
- `governance/README.md` is updated so the three-way split no longer describes scaffolding that is gone.

**Out of scope.**
- Clearing any violation — the four predecessors do that; this work package fails loudly if any remain rather than clearing them itself.
- Adding new rules or changing any decided verdict.

**Effort.** S (~30min)

## Acceptance criteria

- Every decided-forbidden rule fails the build on its first violation, with no mechanism to park one.
- Reintroducing a known-violation list, under any name, fails the build with a message naming the reason.
- The governance lint reports zero known violations in both worlds and says so explicitly in its summary line.
- The protection against fixing one violation while introducing another still holds, and a test proves it.

## Validation scenarios

**Given** the live tree with all four predecessors shipped, **when** `npm run lint` runs, **then** it passes and reports zero known violations in both production and development.

**Given** a developer introduces any single decided-forbidden crossing, **when** `npm run lint` runs, **then** the build fails as an error — not a warning — naming the file, line and rule.

**Given** a developer recreates `governance/baseline.json` with that violation listed, **when** `npm run lint` runs, **then** the build still fails, naming the file as a retired mechanism.

**Given** the governance test suite runs, **when** it exercises the swap case — one violation fixed, another introduced in the same commit — **then** the build fails.
