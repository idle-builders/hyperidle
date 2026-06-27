# Pipeline tweak: refine + human-concept-review + post-ship summary

## Context

Pre-build "concept" isn't sharp. Surgical tweaks only (≈95% stays).

- **A WP's concept = refine + design + architecture** (the three pre-build acts).
- **Strategic frame** = the strategic framing of a *worktrack* — owned by `/work-planning`.
- `/concept` → **`/refine`** (per-WP). Adds a **questionnaire** — cheapest place to
  ask the user for clarification: *what value are we generating?* Also drafts the
  user/dev guide as the requirement story (plan backwards).
- `/human-design-review` → **`/human-concept-review`**: reviews the user/dev-guide
  draft **and** the design. Fires on significant guide rewrite **or** redesign.
- **Per run:** refine (if needed) → design & architecture + critiques →
  human-concept-review (if needed) → development → ship → **always-on post-ship
  summary** (goal vs built · works vs architecture · user value · gaps).

## Scope

Surgical edits only. Do NOT bulk-rewrite skills/agents. Leave all worktracks
(`.pipeline/work-packages/*`, `progress/*`) as-is. Only tokens
`/concept`→`/refine`, `concept.md`→`requirements.md`,
`human-design-review`→`human-concept-review`, `designReviewDecision`→
`conceptReviewDecision`. Never touch the word "concept" elsewhere
("track concept", `blocked: concept-missing`).

## Changes

1. **`git mv concept → refine`** (frontmatter `name: refine`). Per-WP only — drop
   track-level framing (→ work-planning). Add: questionnaire ("what value?"),
   backwards-planned user/dev-guide draft, greppable `DOC-CLASS: significant|minor|none`.
   Output `requirements.md`. Keep probing + recap gate.
2. **`/work-planning`**: add the worktrack strategic-framing questionnaire (the
   track half from concept). Spec template: rename field "Human design review."→
   "Human concept review."; add "Refinement." (Yes/No).
3. **`git mv human-design-review → human-concept-review`** (frontmatter rename).
   Reviews guide draft + design. Gate = `DESIGN-CLASS=novel` OR `DOC-CLASS=significant`.
   Park status `awaiting-human-design-review` → `awaiting-human-concept-review`.
4. **Helper** `packages/shared/src/design-review-decision.ts` → `concept-review-decision.ts`:
   `conceptReviewDecision(designClass, docClass)` returns `run` if `novel || significant`.
   Add `DocClass` type. Update `index.ts` + rename test (cover OR matrix).
5. **`/pipeline`**: Phase 1 `/refine` (run only if needed); Phase 2.5
   `/human-concept-review` w/ OR-gate + renamed park status; expand the existing
   "Final summary to human" into the 4 beats (always-on, chat-only); update
   pre-condition/run-mode wording.
6. **Cross-ref sweep** (tokens only): `design`, `design-critique`, `architecture`,
   `architecture-critique`, `review`, `write-docs`, `skill-discovery.md`,
   `designer/AGENT.md`, `docs/guides/developer/{work-packages,design-system}.md`.
   `/write-docs` reads `requirements.md` and finalizes the guide draft into `docs/`.

## Verify

`npm run -w @hyperidle/shared test` (OR matrix) · `npm run check` · `npm run lint` ·
grep guards return nothing for old tokens in `.claude` + `packages/shared` ·
`npm run verify` → ship PR on `chore/pipeline-concept-review` → `main`.
