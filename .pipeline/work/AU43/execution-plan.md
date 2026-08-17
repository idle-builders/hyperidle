# Delete pass — how it runs

Founder-directed execution model. The rule it exists to prevent: deleting 423 things and running the
checks once at the end.

## Shape

One agent per batch, each in **its own worktree branched from the core branch**. It deletes its
assigned rows, proves its own work cheaply, and commits. Batches then merge back into the core branch
**one at a time**, and the consolidated tree is made green there before the next merge lands. Every
merge is a checkpoint where everything was green.

38 batches → 38 checkpoints. `batches/INDEX.md` lists them; `batches/<name>.md` is one agent's
assignment, one row per convicted symbol with the evidence behind it.

Merging serially is deliberate. Agents working in parallel will both touch shared files —
composition roots, route registration, the schema barrel — and resolving those conflicts one at a
time against a known-green base is cheap. Resolving them all at once is not.

## Order

**Stage 1 — doors (41 rows).** Routes, timers and worker messages first, because a dead door's
handler is usually the only caller of the symbols convicted inside a package. Removing entry points
first means later batches delete code that is already unreferenced.

**Stage 2 — packages (329 rows, 36 batches).** Run in parallel groups of four to six. Each agent stays
inside its own package except where a shared file must lose a line.

**Stage 3 — database (53 rows).** Tables, columns and migrations last, once every reader and writer
convicted above is gone. Dropping a column while something still selects it is a broken tree; dropping
it after is a no-op.

## What each agent proves before it hands work back

Cheap, local, and scoped to what it touched:

- Typecheck the packages it changed.
- Format and lint the files it changed.
- Run the unit and component tests of the packages it changed.
- **If it touched a UI surface**: start the dev server and look at the affected pages. A route that
  renders and a control that still works — not a screenshot of the code.

It does **not** run the full suite, the integration lanes, the harness lane or e2e. That is the
checkpoint's job, and running them 38 times is the waste this model exists to avoid.

## What the checkpoint proves, after each merge

- `npm run check` and `npm run lint` — the whole tree, every time.
- `npm run test` — the affected slice.
- The deletion guard: `npx tsx .pipeline/work/AU20/destroy/tools/check-deletions.ts`, which reports how
  many convicted symbols remain and fails while any are unaccounted for.

## The expensive lanes, and when they earn their cost

| Lane | When |
|---|---|
| Service integration (`npm run test:integration:service`) | After every group of merges, and after any batch that touched a table, a route or a service boundary |
| Harness (`npm run test:integration:harness`) | Only when a batch touched harness execution. Local-only by design; it needs four real CLI binaries and live credentials |
| End-to-end (`npm run test:e2e`) | Once, at the end of the pass |
| Full suite (`npm run test:all`) | Once, at the end of the pass |

## Rules that bind every batch

- **Never touch a row marked `FINISH` or `PLUGIN`.** That code belongs to the feature track, which
  removes its own rubble as it finishes each feature. Deleting it here loses a capability.
- Make every edit in the batch, **then** typecheck once. Re-running checks after each micro-edit is
  what stalled the previous attempt at this work for three hours.
- End committed or reverted. Never hand a dirty tree to the next batch.
- A row may survive only by being written into `accepted-survivors.md` with a reason. The guard reads
  that file, so an unexplained survivor keeps the pass red.
- Behaviour does not change. Everything here is unreachable; if removing something changes what a
  person sees, it was not dead and the row is wrong.
