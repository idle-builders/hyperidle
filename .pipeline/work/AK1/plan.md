# AK1 — Harness-vocabulary rename rollout

Shipped 2026-06-15 (PR #294). Behaviour-preserving cross-cutting rename to the locked nouns, done
before AK2's kernel/strategy split so that split built on final vocabulary.

## The mapping

| Was | Is |
|---|---|
| soul | system prompt (+ `AGENTS.md`) |
| workspace / unit | sandbox |
| skill-tools | tools |
| materialize / composePrompt | context assembly |

Old names appear only in git history and in retired docs. Nothing enforces the mapping — the
`harness-vocab-guard` that once ran in `verify` was retired with the other consolidated guards, so a
regression to an old noun is caught by review or not at all.

## Constraints found the hard way

- **`AGENTS.md` and `CLAUDE.md` are dual-written.** Both files carry the same system prompt because
  harness auto-discovery differs by CLI: dropping either one silently stops a harness from finding the
  prompt. Keep them in sync; do not "deduplicate" one away.
- **Column renames are forward-only.** The migrations rename in place with no down path; a rollback is
  a new forward migration, not a revert.

## Dangling reference

The rename's authority was cited as `docs/architecture/kernel-strategy-split.md §4`. That file no
longer exists. The locked nouns are recorded here and nowhere else.
