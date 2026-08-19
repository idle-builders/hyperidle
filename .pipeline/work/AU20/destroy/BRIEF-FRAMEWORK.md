# AU20 (reopened) — Destroyer brief: FRAMEWORK packages

Read `.pipeline/work/AU20/destroy/BRIEF.md` first. Everything in it applies — the mindset, the
verdict priority, the evidence rules, the no-sampling rule. This file replaces only the **lead
question**.

## The lead question for a framework package is not "should it exist"

It is: **which service or which consumer should absorb this?**

A framework package earns its separate existence only by being genuinely shared — used by two or
more consumers that could not sanely reach for each other's code. Everything else is a package
boundary invented for tidiness, and tidiness is not core value. The founder's instruction is
explicit: for framework packages the question is *move into service, or move into consumer*.

So your top-line verdict for the package as a whole is one of:

- **DISSOLVE → `<service>`** — one service actually owns this concept. Move the code there and
  delete the package. This is the default and you should be looking for it first.
- **DISSOLVE → `<consumer>`** — one application/layer is the only real user (`core-ui`,
  `remote-worker`, `desktop`, `core-api`…). Move it there and delete the package.
- **DISSOLVE → inline** — it is small enough that each of its handful of users should just own its
  own copy, or it collapses into a language builtin / a few lines. Delete the package outright.
- **SPLIT then dissolve** — different parts belong to different owners. Name the split.
- **STAYS SHARED** — last resort. You must name **every** consumer, show with the graph that there
  are genuinely two or more independent ones, and say what breaks if each owned its own copy.

Count consumers with evidence, not assumption:

```bash
rg -a -l "@hyperidle/<package-name>" layers framework applications tools
```

Then read what each consumer actually imports. Three consumers that each import one different
symbol is not a shared package — it is three symbols in the wrong place.

## Framework packages carry a specific kind of garbage

Look hard for these, they are all DELETE:

- **Type-only packages.** A package that exports mostly `interface`/`type` and almost no behavior is
  a contract nobody needed to centralize. Types belong next to the code that produces them.
- **Re-export packages.** A barrel whose job is to forward another package's symbols.
- **Wrapper packages.** A thin shell over a library the consumers could import directly.
- **Anticipatory abstraction.** A "protocol", "contract" or "port" package with one implementation.
  One implementation means it is not an abstraction, it is indirection.
- **Constants and enums** exported for uniformity that only one place reads.
- **Utility grab-bags** — functions that live together only because they were homeless.

Note that a previous work package already split a single `shared` package into many audience-scoped
framework packages. That split multiplied package count on purpose. You are now allowed — expected —
to ask whether the pieces should have stayed code inside their consumer instead of becoming packages
at all. Do not treat the existing package boundary as evidence that the boundary is right.

## Output

Write exactly one file: `.pipeline/work/AU20/destroy/verdicts/fw-<package>.md`. Do NOT edit source.

Same structure as the base brief, with the first section replaced:

```markdown
# <package> — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → <target> | SPLIT | STAYS SHARED**
<the argument, with the real consumer list and what each one actually imports>

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|

## If written today, from scratch
<what survives, and where it lives>

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | n |
| MERGE | n |
| SIMPLIFY | n |
| KEEP | n |
Surface: <before> exports → <after> exports (<x>% cut)

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|

## Holes this leaves
```

Every export in your input file gets a row — functions, classes, interfaces, types, consts, enums.
The founder reads every line. For packages with large type surfaces you may group a run of
same-verdict type rows into one row **only** when they are members of one declaration family; never
group to save effort, and never write "…and N more".

Your input file is `.pipeline/work/AU20/destroy/input-framework/<package>.md`.
