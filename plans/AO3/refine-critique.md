# AO3 Refine Critique — Round 1

**Verdict: REVISE** (SCOPE-RESIDUAL confirmed correct on evidence — do NOT close as subsumed; the `filesystem_captures` seam is provably orphaned, session-end reviews are proofless).

## Evidence audit — all four planner claims hold
1. `filesystem_captures` genuinely orphaned: only writer (`capture-store.ts:33`) + caller (`mounter-registry.ts:172`); no `db.select().from(filesystemCaptures)` anywhere. `capture-store.ts:5` comment ("AO3 reads this") is promised-but-unbuilt.
2. `commit_file` writes only to sandbox (`commit-file.ts`, `fs.writeFileSync` into `ctx.sandboxPath`, no git).
3. Only production `runner.push` = knowledge-export (`git-export.ts:478`). No review→land bridge.
4. Session-end reviews proofless (`session-review-creator.ts:104-112`, `items` row titled `"Session completed: <outcome>"`, no diff/artifact/capture link); proposed-call reviews real (`reviews.ts:107-195`).

## CRITICAL — AC1 and AC3 target two structurally different review surfaces; the loop does not close
Two distinct surfaces in code:
- **AL7 actionable path:** `messages` table + `proposedCalls.reviewMessageId`; grant composition `threads.ts:1416-1528`; loaded by `reviews.ts:87` (`GET /:reviewMessageId`).
- **session-review-creator path:** writes `items` table (`session-review-creator.ts:104`, `kind:"review"`); NO `reviewMessageId`, NO proposed call, NO payload diff; NOT read by `reviews.ts`.

AC1/AC2 target the `items` path; AC3/AC4 target the `messages`/proposedCalls path. **Approving an `items` review composes no grant** (grant composition keyed on `proposedCalls.reviewMessageId`). So validation scenario 2 ("approve diff review → session 2 → land_change pushes") cannot flow. Bridging `items`→grant = NEW grant-composition machinery = **duplication of AL7** (violates hard "NO duplication of AL7" contract).

**Required resolution (name it explicitly):** `land_change` IS the Proposed Call; its proof pane renders the capture diff (AL7's own model, `staged-operation.md:28` — reviewer sees proof + captured verb). Under this, **AC1 collapses into AC3** (same review, `messages`/proposedCalls path); `session_ended`/`items`/session-review-creator is irrelevant to AO3 (scope it out explicitly, or reconcile). Re-seam AC1/AC2 onto the proposed-call proof path. This must be resolved at refine — it determines whether AO3 duplicates AL7's grant spine.

## WARNING — Missing at-most-once / idempotent-landing AC
Spec (TRACK-AO.md:145) requires inheriting AL7's at-most-once/outcome semantics. `land_change` is the single least-reversible op AO3 adds; a double-push fabricates duplicate commits/PRs on a real remote. AL7 enforces 0..1 via Outcome PK + consume-once CAS (`tool-registry.ts:627-634`), but `land_change` is a NEW handler that must demonstrably respect it. **Add explicit AC:** same capture / consumed grant → no second push (idempotent), proven against the real bare remote (extends AC4's harness).

## WARNING — DESIGN-CLASS "none" assumes a multi-file git-diff canvas exists; unevidenced
AL7's proof vehicle was a single `commit_file` write. Rendering a real git capture = changed-files list + per-file diff (multi-file diff view). Confirm such a canvas exists; if it must be built, DESIGN-none and the M sizing both move. (Architecture must confirm; flag not overturn.)

## WARNING — AC5 lint wording brushes the purged "only-path" paranoia
AC5 correctly a lint rule (not a mislabeled test). But: (1) must carve out legitimate existing pusher `git-export.ts:478` → hardcoded module-allowlist, needs an @lore. (2) Frame strictly as **"HyperIdle's own code never pushes of its own accord"** (AL7 hard-rule 2) — NOT as a cage on the agent (a CLI agent's shell `git push` is trusted + AL7-gated, `staged-operation.md:175`). The trust-first redo purged the "broker is the only path" containment (`staged-operation.md:41-43`); don't re-import it.

## NICE-TO-HAVE — AC3/AC6 largely re-assert AL7's router
AC3/AC6 re-verify the router `commit_file` already proves. Genuinely new = AC4 (real authenticated push to bare remote, zero stubs). Don't let the builder pad with router re-tests and call it proven.

## Non-duplication (Q2): overlap thin but non-fatal
On CLI harnesses `land_change` ~ redundant with shell `git push` (already AL7-gated). Non-duplicative residual is narrow but real: **builtin** (no shell → `land_change` is the only landing path; builtin can hold an AO2 git mount), consuming the orphaned capture seam, and AC1/AC2 diff-rendering (unambiguously new). Value center of gravity = AC1/AC2. Reconciliation of "system lands" → "agent invokes AL7-gated registered tool" via the `commit_file` precedent is sound.

## Bottom line
REVISE. Fix before architecture: (1) name ONE coherent AL7-faithful loop, re-seam AC1 onto `messages`/proposedCalls (diff = `land_change`'s proof pane), scope out/reconcile `items`/session-review-creator; (2) add explicit at-most-once landing AC (idempotent push on real remote); (3) tighten AC5 to "HyperIdle's own code never pushes"; (4) confirm a multi-file git-diff canvas exists or move DESIGN off "none".
