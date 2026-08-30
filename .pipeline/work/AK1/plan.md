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

Old names appear only in git history and in retired docs. `harness-vocab-guard`, wired into `verify`,
fails the build on a dangling reference to any of them — that guard is the enforcement, not review.

## Constraints found the hard way

- **`AGENTS.md` and `CLAUDE.md` are dual-written.** Both files carry the same system prompt because
  harness auto-discovery differs by CLI: dropping either one silently stops a harness from finding the
  prompt. Keep them in sync; do not "deduplicate" one away.
- **Column renames are forward-only.** The migrations rename in place with no down path; a rollback is
  a new forward migration, not a revert.

## Dangling reference

The rename's authority was cited as `docs/architecture/kernel-strategy-split.md §4`. That file no
longer exists. The locked nouns are now only enforced by the guard and recorded here.
