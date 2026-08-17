# presentation-format — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT then dissolve — package DELETED.**

Three unrelated things live here only because they were homeless:

1. **Time module** (`relativeShort`, `relativeLong`, `clockTime`, `absoluteDate`, `absoluteDateTime`, `TIME_PLACEHOLDER`, `TimestampInput`) → **DISSOLVE → `framework/design-system`**. After killing the one server caller (below) it is 100% display code: 2 design-system components + 14 core-ui files. This joins the display helpers and `segmentMentions` the `domain-model` destroyer is already sending to design-system — design-system becomes the single home for "how the app paints a value". The AI3 one-clock invariant (one shared time formatter, 8 prior impls collapsed) is real product value and survives intact — it just stops being a package.
2. **`deriveTitle`** → **DISSOLVE → the work service (`@hyperidle/work`)**. All four production callers are server routes composing bet views (bets, threads, search, teams-routes). Bet-title derivation is bet domain logic, not "presentation format". The one web caller uses the *deprecated alias* for a live preview — it inlines a 10-line local copy.
3. **`scopeKindToLabel` + `deriveInitials`** → **DISSOLVE → inline**. Details per row; both shared-package justifications are false on measurement.

The package's own claim to exist — "shared between server and web" — is true for exactly one 5-line function (`scopeKindToLabel`), and 5 lines do not buy a framework package. Everything else is either one-sided or a drift bug wearing a "canonical" badge.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/presentation-format" layers framework applications tools` → 3 package worlds, 26 production import sites. Nothing in `applications/` or `tools/`.

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `framework/design-system` (CommentRow, ArtifactTimestamp) | `clockTime`, `TIME_PLACEHOLDER`, `absoluteDate`, `relativeLong` | **Yes — becomes the owner.** Time module moves in; imports become sibling-file imports. |
| `layers/core-ui` (14 prod files) | `relativeShort` ×6, `relativeLong` ×3, `clockTime` ×3, `absoluteDate` ×2, `absoluteDateTime` ×2, `scopeKindToLabel` ×2, `deriveTitleFromPitch` ×1 | Time via design-system (already a dependency). `scopeKindToLabel`: core-ui **already has the file** (`src/utils/scope-labels.ts`, currently a thin re-export — restore the 5 lines). Title preview: inline copy in `WorkBetCreate.tsx`. |
| `layers/core-api` (7 route files) | `deriveTitle` ×4, `deriveInitials` ×2, `scopeKindToLabel` ×1, `relativeLong` ×1 | `deriveTitle` → work service. `deriveInitials` + `relativeLong` callers are DELETE (server presentation fields, below). `scopeKindToLabel` → 5 lines inline in the knowledge service's `resolveScopeName`. |

Note the shape: three consumers importing three *disjoint* symbol sets. Per the brief, that is not a shared package — it is symbols in the wrong place.

## If written today, from scratch

- A time module inside `design-system` — the 5 registers + placeholder, unexported input type. That's the whole survivor.
- `deriveTitle` as a private helper of the work service's bet view composition.
- No server-computed initials, no server-humanized timestamps, no deprecated aliases, no package.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 1 |
| KEEP | 7 |

Surface: 11 exports → 7 survivors, **0 remaining in this package — package deleted** (100% of the boundary cut; 36% of the symbol surface cut).

## Feature-level kills

1. **Server-computed presentation fields — kill the whole pattern.**
   - `agentInitials` in API responses (`routines-routes.ts:264`, `teams-routes.ts:751`, typed in `framework/domain-model/src/routine.ts:57,92`, echoed in the review-artifact payload). The web *already has its own* `deriveInitials` (`layers/core-ui/src/utils/initials.ts`) with **different semantics** — "Ada Lovelace" renders "AL" from the server, "AD" from the client. Two algorithms are live today; the "server-side canonical form" lore is a fiction. The API returns `agentName`; the client derives initials with the one function it already uses in 4 components. Kills the package's `deriveInitials` outright.
   - Humanized `executedAt` (`reviews.ts:126`: `relativeLong(pcView.outcome.executedAt)`). A relative time computed at response time is frozen — stale the moment it lands. Return ISO; ReviewPage (which already imports `relativeShort`) formats it. Kills the only server time-consumer, making the time module purely display code.
2. **`deriveTitleFromPitch`** — deprecated alias, one caller, U1 said "will be removed in a subsequent workpackage". This is that workpackage.
3. **The package itself** — after 1 and 2 no symbol has consumers on both sides of the server/web line except one 5-line mapping.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `deriveTitle` | fn | UI: bets/threads/search/teams routes (server view composition) | KEEP → move to `@hyperidle/work` | Bet domain logic with 4 server callers; web preview inlines its own copy. |
| 2 | `deriveTitleFromPitch` | fn | UI: WorkBetCreate preview only | DELETE | Deprecated alias of #1; migrate the one caller, honor the U1 removal promise. |
| 3 | `relativeShort` | fn | UI: 6 core-ui files (rows/chips) | KEEP → move to `design-system` | The default relative register; deleting it recreates the 8-impl drift AI3 killed. |
| 4 | `relativeLong` | fn | UI: 3 core-ui + ArtifactTimestamp; server caller (reviews.ts) DIES | KEEP → move to `design-system` | Prose register, 4 real display callers after the server one is killed. |
| 5 | `clockTime` | fn | UI: CommentRow + SessionView/PartList/SessionActivityPanel | KEEP → move to `design-system` | Wall-clock register for the activity log; 4 callers. |
| 6 | `absoluteDate` | fn | UI: ArtifactTimestamp, AgentProfile, RoutineDetailPane | KEEP → move to `design-system` | Calendar register, 3 callers. |
| 7 | `absoluteDateTime` | fn | UI: KnowledgeDetail, RoutineDetailPane | KEEP → move to `design-system` | Date+clock register, 2 callers. |
| 8 | `deriveInitials` | fn | UI: 2 server routes shipping `agentInitials` fields | DELETE | Server presentation field; web already owns a *different* `deriveInitials` and all 4 web components use it — the split-brain dies with this export. |
| 9 | `scopeKindToLabel` | fn | UI: knowledge.ts `resolveScopeName` fallbacks + KnowledgeDetail/ScopeChangeDialog | MERGE → inline into knowledge service AND `core-ui/src/utils/scope-labels.ts` | 5 pure lines; the web file already exists as a re-export — put the lines back. Two copies of a 3-branch mapping is cheaper than a package. |
| 10 | `TimestampInput` | type | none — zero external references (rg-confirmed) | SIMPLIFY | Unexport; internal parameter type of the time module, travels with it. |
| 11 | `TIME_PLACEHOLDER` | const | UI: CommentRow (design-system) + internal | KEEP → move to `design-system` | The invalid-timestamp sentinel CommentRow compares against; becomes a sibling import. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `TimestampInput` | SIMPLIFY (unexport) | No external importer anywhere; exists only for the time functions' signatures. |

## Holes this leaves

- **`agentInitials` removal is a contract change.** `WorkTeam.tsx:485` and `ReviewOutcomeSummary.tsx` render the API-provided field; both must derive from `agentName` via the existing `core-ui/utils/initials.ts`. `ReviewOutcomeSummary`'s payload type-guard (`isString(payload.agentInitials)`, line 346) must relax — old stored review-artifact payloads keep the field, new ones drop it. Visible side effect: initials switch to the web algorithm everywhere ("AL" → "AD" style) — a *consistency fix*, but a visible one.
- **`executedAt` becomes ISO** in the proposed-call review response — ReviewPage formats it client-side. The AL7 lore "never raw ISO in the response" is repealed for this field; the raw value is a timestamp, not user prose, so nothing injects.
- **`scopeKindToLabel` exists twice** (knowledge service + core-ui). Drift risk priced at 5 lines and 3 branches; the AE1/AD6 web tests pin the web copy.
- **`WorkBetCreate` preview duplicates `deriveTitle`** (~10 lines). Preview drift is cosmetic — the server value is the one persisted.
- **Test relocation:** package `__tests__` move with the time module to design-system; `time-vocabulary.spec.ts` (e2e) and the KnowledgeDetail/AE1/AD6 web tests keep passing untouched paths only if imports are re-pointed — mechanical.
