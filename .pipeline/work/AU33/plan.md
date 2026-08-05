# AU33 — Retire the baseline: governance is enforced unconditionally

## Work package

**Work package.** As a maintainer, I want the known-violation baseline and its generator gone once the last entry clears — so that "architectural governance is enforced" needs no reading of a data file to confirm. Note what this work package is *not*: rules do not wait for it to be promoted. The baseline is shrink-only, so clearing a group's last site deletes the entry and that rule is at error from the same commit — promotion already happens continuously, inside AU29 through AU32, as a consequence of fixing the violation. What is left at the end is an empty file, a generator nobody needs, and an `--adopt` escape hatch that should not outlive the migration it was built for.

**Why this matters.** The founder's requirement — *"every time we fix a rule we should directly turn that rule into error, so that drift doesn't happen again as we progress"* — is met by the shrink-only generator, not by this work package. This one closes the residue. An `--adopt` flag that survives the migration is an exemption apparatus with no remaining purpose, and this repo's own history says any exemption apparatus gets re-populated: AU21 shipped an anti-regrowth guard whose allowlist grew to four entries and reported zero findings while half the boundary was open. The maintainer's benefit is small but real: after this, the answer to "is this boundary enforced?" is the same for every rule, with no file to consult and no flag to misuse.

**Type.** infra / tooling.

**What exists today.** `governance/baseline.json` lists known violations keyed by group and by site; `scripts/rules/crossings.ts` reads it so a listed site warns instead of erroring, and `baselineRatchet` fails the build in **both** directions — when a group grows and when it shrinks. `refuseGrowth` (`scripts/lib/crossing-report.ts`) makes the generator shrink-only: it refuses to add a group or raise a count, so a new violation cannot be parked, and the only admitted growth is an explicit `--adopt "<group key>"` for a new rule landing over existing debt. Both halves are proven by test and by a live negative control — an introduced `db:schema-ns` import made the generator refuse and the lint error. `npm run governance:baseline` (`scripts/governance-baseline.ts`) is the only writer; `loadBaseline()` lives in `scripts/governance-context.ts`, the single place that touches the filesystem. `governance/README.md` §"There is no warn/error dial" documents the whole mechanism.

**What's genuinely missing.** Only the removal and the guard that makes it stick. Everything else already exists — which is the point: this work package is the small, deliberate act of taking the scaffolding down, not a mechanism to build.

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
- `--adopt` goes with it. It exists for a migration; when the migration is over it is an exemption apparatus with no purpose.
- Reintroducing the file, the flag, or any equivalent parking list, fails the build with a message that says why.
- No rule's severity is lowered, and no new ignore entry is added, to make this land.
- `governance/README.md` §"There is no warn/error dial" is rewritten to describe the end state, not the migration.

**Out of scope.**
- Clearing any violation — the four predecessors do that; this work package fails loudly if any remain rather than clearing them itself.
- Adding new rules or changing any decided verdict.

**Effort.** S (~30min)

## Acceptance criteria

- Every decided-forbidden rule fails the build on its first violation, with no mechanism anywhere to park one and no way to admit one by flag.
- Reintroducing a known-violation list, under any name, fails the build with a message naming the reason.
- The governance lint reports zero known violations in both worlds and says so explicitly in its summary line.
- The protection against fixing one violation while introducing another still holds, and a test proves it.

## Validation scenarios

**Given** the live tree with all four predecessors shipped, **when** `npm run lint` runs, **then** it passes and reports zero known violations in both production and development.

**Given** a developer introduces any single decided-forbidden crossing, **when** `npm run lint` runs, **then** the build fails as an error — not a warning — naming the file, line and rule.

**Given** a developer recreates `governance/baseline.json` with that violation listed, **when** `npm run lint` runs, **then** the build still fails, naming the file as a retired mechanism.

**Given** the governance test suite runs, **when** it exercises the swap case — one violation fixed, another introduced in the same commit — **then** the build fails.
