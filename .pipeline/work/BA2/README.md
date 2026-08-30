# BA2 — an agent asks, a human clears

## What is live

- **`interview-2026-08-25.md`** — the founder interview. The most authoritative statement of what this
  work package is.
- **`founder-rulings.md`** — 25 rulings, each with the reasoning and, where a ruling reversed an earlier
  one, why. Rulings 18 → 22 → 22a are worth reading as a set: the same claim was asserted wrongly three
  times because each assertion tested one combination and reasoned about the rest.
- **`harness-research/`** — measured per-harness behaviour: blocking tool calls, session continuation,
  and one file per harness. Measured, not read off documentation.
- **`SPLIT-ANALYSIS.md`** — how the original build was split into seven pieces.
- **The live plan is `.pipeline/work/BA2-gate/plan.md`**, not this folder.

## What shipped

Five pieces were split out, reviewed independently and merged. Four fixed pre-existing production bugs
that no test had caught: codex sessions dying at startup, cursor-agent never reporting token usage, all
nine review canvases showing invented content, an agent being unable to attach anything to a review, and
a human being unable to reach or approve one.

## What was removed from this folder, and why

`architecture.md`, `requirements.md`, `feasibility.md`, `plan.md`, `progress.json` and the five critique
files described the **superseded** build — the one that reached +25,000 lines before it was halted and
split. They are accurate about the tree they were written against and wrong about what is being built.

They are deleted rather than kept, because a folder holding both the live design and a rejected one asks
every future reader to guess which is which. This project has already been bitten by exactly that:
`docs/process-layer/staged-operation.md` is an authoritative-looking document specifying a rejected
mechanism, and it misled work here.

Git history keeps all of them. They are in the parent of commit `81d7e662e`, and the critiques in particular
hold a verified `path:line` fact audit that is still true of the tree it was written against.
