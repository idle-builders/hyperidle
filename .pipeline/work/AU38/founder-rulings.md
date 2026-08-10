# AU38 — Founder rulings

## Concept gate (2026-08-10)

**Approved.** Architecture as critiqued (round 2 PASS): D1 `ids` fixture (deterministic per-test
UUID derivation), D2 ratchet-guarded batch migration (10 increments, truncate removed only after
a green lane run without it), D3 `isolate: false` flip in-scope as capstone. Build proceeds.

## Ruling 1 — AC6 mechanism (2026-08-10)

**Lint ratchet approved.** AC6's "repeatable check" = two ESLint rules (R1 no-literal-entity-ids,
R2 no-unscoped-table-read) with a shrink-only waiver list, enforced by `npm run lint`. Semantic
runtime enforcement rejected as over-engineering.

## Ruling 2 — no dedicated single-worker proof run (2026-08-10)

Founder, on the proposed `maxWorkers:1` deterministic proof run: *"not sure I understand please
check if this is appropriate we don't want overly strict stuff we are trying to optimize our
database setup here once we remove isolate false non isolated stuff will fail anyhow during
testing and [won't] make it into main."*

**Checked and withdrawn.** The proposal closed a nuance (under `isolate: false` the four workers'
lead files boot against an empty PGlite, so ~4 file-runs per run never meet foreign rows). But
once `isolate: false` IS the lane configuration, any test that still assumes an empty world fails
in the ordinary CI lane on every push and cannot merge — the standing configuration is itself the
repeatable enforcement. A one-off single-worker proof run adds ceremony without changing what can
reach main. Increment 10's proof is the standard lane run (count ≥ baseline) + CI green on the PR;
no `maxWorkers:1` run.
