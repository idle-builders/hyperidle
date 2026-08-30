# Track AY: Agent Session Runtime

AU21 closed the boundary: every agent run is a task-optional session request, core bakes everything a run needs at emit, orchestration is a blind, purely request-driven executor, and zero orchestration reads back into core. That closure deliberately left open what a running session can DO. This track builds those capabilities on top of the shipped boundary — session-runtime capability work, not the boundary/simplification work that stays in track AU.

Three things AU21 deliberately left open, each spun out of its architecture or its founder re-derivation:

- **Live mid-run delivery** — new information reaches an ALREADY-RUNNING session, not only the next one.
- **Resumable harness sessions** — the harness keeps a per-thread session and each turn computes the delta, instead of a fresh spawn fed the full transcript every time.
- **Trigger-driven defaults** — behavior that used to be a hardcoded mechanism (bet decomposition) returns as ordinary, editable trigger configuration.

**Provenance.** Registered 2026-08-11 by founder decision: these three were **AU22**, **AU24**, **AU25** in track AU (`.pipeline/AU.md`) and do not fit AU's runtime-simplification charter. Renumbered on move:

| old ID | new ID |
|---|---|
| AU22 | AY1 |
| AU24 | AY2 |
| AU25 | AY3 |

Historical artifacts (`work/AU21/`, `work/AU27/`) keep the old IDs as-is — they are records of the builds that spawned these.

**Registration shape.** AY1 has a seeded spec at `work/AY1/plan.md`. AY2 and AY3 are row-only registrations (full spec in the Status column below) — seed `work/<id>/plan.md` when either enters the pipeline.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AY1 | Deliver a live update into an already-running agent session | backend/infra | L | AU21 (track AU, shipped) | planned (registered 2026-07-27 as a named follow-up discovered during AU21's architecture — see `work/AU21/architecture.md` §16 R9 and `work/AY1/plan.md`) |
| AY2 | Re-provide "auto-decompose on bet creation" as a default trigger in `packages/strategy-minimal` (after AU21/Decision I removes the hardcoded `bet_decomposition` mechanism) | backend/strategy | S–M | AU21 (Decision I, shipped) | **planned — SETTLED by founder 2026-07-31.** Additive strategy config via the generic trigger mechanism; **release-coupled with AU21** (must ship same release or the default "commit auto-decomposes" UX regresses). **Risk to close:** the generic trigger substrate (`settings` `kind:"trigger"`) was flagged in AU21's Increment 9 second pass as "no code path reads it to affect real agent selection" — this WP must confirm/wire that substrate, not assume it. |
| AY3 | Meta-orchestration of harness sessions: resumable per-thread harness sessions + delta computation (what's new since the harness last saw the conversation; resume-vs-new) | backend/infra | L | AU21 (Decision H2, shipped) | **proposed — surfaced by AU21's H2 re-derivation (founder), not yet scoped in detail.** Genuinely new machinery — verified ABSENT today (every assistant turn is a fresh harness spawn fed the full transcript; `sessionRunRegistry` is abort-only; no resume concept). NOT required for AU21's boundary AC (which closes with bake + delete-reads + Decision B‴). This is the founder's "almost the hardest task" and also the efficiency answer (retires re-baking the full transcript every turn). Independent of AY1 (mid-run delivery) and AY2 (strategy config). |

## Dependency graph

- `AY1` → `AU21` (track AU, shipped): extends the request/supersede plumbing AU21's Decision B‴ builds (the not-yet-started-supersede and deliver-on-next-turn cases); cannot be meaningfully designed or verified until that mechanism exists and has shipped — it has (PR #457 merged), so AY1 is unblocked.
- `AY2` → `AU21` (Decision I, shipped): re-provides the auto-decompose default UX via a strategy-minimal trigger once AU21 removes the hardcoded mechanism; **release-coupled** (same release as AU21 to avoid a UX regression window). Depends on the generic trigger substrate being wired (see its row's risk note).
- `AY3` → `AU21` (Decision H2, shipped): builds the resumable-harness-session / delta machinery AU21's H2 boundary close deliberately leaves as fresh-spawn. Independent of `AY1` (mid-run delivery into an already-running session) and `AY2` (strategy config).
- `AY1`, `AY2`, `AY3` are independent of each other — sequence by value, not by number.
- Cross-track: AU27 (track AU, shipped) sequenced itself **before or with AY3** so the resumable-session work applies uniformly to a now-ordinary assistant — AY3 inherits that ordering and must treat the assistant turn as an ordinary agent run.
