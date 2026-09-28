# Track AP: Overengineering Audit Cleanup

Source: the overengineering audit of 2026-06-24/25 — 15 subsystem auditors over all production code and architecture docs, then per-finding adversarial verification where an independent agent tried to find the justification for each flagged item. 68 raw findings → **19 adversarially-confirmed**, 47 judged justified. The 19 are the rows below; the 47 rejections were not carried forward.

**Key narrative.** The dominant theme was infrastructure shipped without consumers — well-built, fully-tested modules wired into nothing, stranded when a scaffold phase landed the machinery but the integration step never happened. Secondary themes: single-implementation abstractions, dead computation in a live scoring path, and docs that outran the code they describe.

**Constraint.** Every package here is verifiable cleanup. `npm run knip` and `npm run lint` are the primary nets for dead-code removal; a static codebase property is enforced by knip/lint, not by a runtime test. AP2 is retired (see its row) — no package in this track changes behaviour any more.

**Constraint — the findings predate the package fold.** The audit named paths under `packages/*`, which AU19 and AU44 dissolved into `layers/`, `framework/`, `applications/` and `tools/`. Some findings have already been consumed by that restructure. **Re-confirm each finding against current `main` before removing anything** — do not delete from the audit list alone.

**Out of this track.** The audit's Part-4 "bonus" items are not overengineering and are deliberately excluded: the reviews-route regression (a real DB-backed route silently reduced to a fixture in a cleanup commit), a stale propagation-log lore comment, three built-but-unwired design lint rules, and a `riskTier` column duplication. Those are correctness/bugfix work, not audit cleanup.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AP1 | Remove dead infrastructure that has no consumers | backend/tooling | M | — | unbuilt — carried from the legacy track file, **partially consumed**. Of the five confirmed-dead items, three are already gone on `main`: the response-validator middleware, the typed Hono RPC client (`web/src/api/client.ts`), and the `brief.ts` prefetch write path. Two remain: the `drizzle-sqlite-archive/` directory (29 files, ~13.6k LOC, left from the SQLite→PGLite migration, referenced only in one guard-script ignore list) and the uncalled judge factory functions in `tools/eval/src/judges.ts`. Re-scope to those two before building. |
| AP2 | Repair dead-weight in relevance scoring | backend | M | — | **retired** — superseded by T-d6w9sj. `layers/core-api/knowledge/` (where `computeRoleMatch` lived) no longer exists; `computeRoleMatch` is already gone. The other half of this finding, `computeTagMatch`'s dead `taskTags` input (relocated to `layers/core-api/document/src/session-documents.ts`, weight since drifted to 0.55), was ruled **deleted, not repaired** — `tagMatch` is removed outright rather than re-weighted, so there is no re-weighting left for a founder to review. |
| AP3 | Collapse single-implementation abstractions | backend | M | — | unbuilt — carried from the legacy track file. Three interfaces/unions model a runtime choice that is never made: the DB driver is fixed per profile at startup, and two desktop interfaces each wrap a single object literal. Phantom flexibility that every reader pays to disprove. |
| AP4 | Drop unused parameters and config slots | backend/tooling | S | — | unbuilt — carried from the legacy track file. Route factories accept dependencies they never use, a DB profile type carries deployment fields read only by tests, and an OTEL span declares six attributes that are never set — with an explaining comment citing a plan file that has never existed in git history. |
| AP5 | Web cleanup: duplication and an over-built hook | frontend | S | — | unbuilt — carried from the legacy track file. `initialsOf` is still copy-pasted across three components in `layers/core-ui/src/components/` and will drift into subtly different avatars; one hook carries a session-lifetime cache, retry/degraded states, six host kinds with two implemented, and a known field-name bug, for a single out-of-scope caller. |
| AP6 | Reconcile architecture docs with shipped code | docs | M | — | unbuilt — carried from the legacy track file. Three doc areas contradict the code: the two `docs/ui-design/` files disagree on whether a component-count ceiling exists; `docs/knowledge-architecture/the-five-layers.md` (~50KB) documents L0–L2 layers the code simplified past; and `docs/process-layer/artifact-primitive.md` still presents a closed five-shape enum after AE6 moved the API to a six-kind open vocabulary. |
| AP7 | Challenge tradeoffs the ethos no longer justifies | backend/tooling | M | — | unbuilt — carried from the legacy track file. A pass over every decision-with-a-cost `@lore`, judged against ETHOS §1/§2/§3, surfaced seven items: a runtime access-boundary layer whose own comment calls the lint rule "the real gate" and whose host scope "returns true for any authenticated principal"; a `@mention` cap (`MAX_MENTIONS_PER_MESSAGE`, still live, truncates at 20) contradicting its own concept's "0..N, no upper bound"; three web guards/props defending hypothetical futures; and two lint/script guards that may duplicate existing tooling. Removing each leaves the actual gate intact. |

## Dependency graph

- All seven packages are independent — no inter-dependencies. Build them in any order or in parallel.
- Nothing in this track depends on another track. The former ordering note against AK9 (fabric Kernel-infra extraction) is void: AK9 is retired and `packages/fabric` no longer exists.
- `AP2` is retired; no package in this track needs founder review for a behaviour change.
