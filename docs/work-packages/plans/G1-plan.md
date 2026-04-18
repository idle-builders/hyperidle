# G1 — Facilitator Agent Infrastructure — Plan

Work package: `docs/work-packages/TRACK-G.md` §G1
Worktree: `/workspace/.worktrees/G1`
Depends on: D4 (skill-tool registry), B1 (`knowledge_items` table), B5 (`knowledge_conflicts` table)

## 1. Context

Seed three new facilitator agent archetypes into the database with their own soul prompts, add four facilitator-specific skill tools, and prove that a facilitator can be provisioned for a session via the standard D5 flow. G2 (attention scoring) and G3 (promotion pipeline) will extend `score_attention` and `promote_knowledge` later; G1 provides the plumbing and minimum-viable semantics.

## 2. Constraints (from source)

- `agents.role` is a `text` column; the union lives in `packages/shared/src/types.ts` as `AgentRole`. It already contains `"practice_facilitator"`, `"product_manager"`, and `"chief_of_staff"` — no shared-type change needed.
- `agents.soulPromptPath` is a nullable `text`; we store a repo-relative path (matches what `provisionSession` reads at `agent.soulPromptPath ?? ""` in `session-provisioning.ts`).
- `agents.scopeId` does not exist. The spec calls for a `scope_id` semantic; there is no such column on `agents`. See CONFUSION block below — we will encode scope in `agents.teamId` (for Product Managers) and `agents.skills` JSON (for Practice Facilitators and Chief of Staff). No schema migration is introduced by G1.
- Existing seed inserts one agent with `role='chief_of_staff'` and `id='seed-agent-cos'`. It is referenced only as `updatedBy` on `seed-ki-1`. We REUSE this row (see §6) rather than renaming.
- Seed must remain idempotent (`onConflictDoNothing().run()` pattern already used; the seed test asserts `seed(db)` can run twice without throwing).
- TypeScript strict mode; no `any`; explicit return types on exports; Biome + ESLint clean; all tests via `bun run test`.
- Tools must follow the existing pattern in `packages/server/src/skill-tools/create-item.ts` — Zod input schema, `handler(args, ctx): Promise<ToolResult>`, registered in `tool-registry.ts` and re-exported from `skill-tools/index.ts`.
- Tool return values are JSON-serializable plain objects wrapped in `ok(data)`.
- `status` values stored in `knowledge_items.status` are lowercase strings (`'captured'|'provisional'|'validated'|'active'|'stale'|'archived'`). The acceptance criteria write CAPTURED/PROVISIONAL in uppercase for human readability — we match the existing lowercase storage convention and accept uppercase input by lowercasing before DB write (same as `writeMemoryTool`).

### CONFUSION: where `scope_id` for facilitator agents lives

The task statement says:
> `scope_id` usage: Practice Facilitators have `scope_id = community name`; Product Managers have `scope_id = product id`; Chief of Staff has `scope_id = null`.

But the `agents` table in `packages/db/src/schema.ts` has no `scope_id` / `scopeId` column. The only existing scope-like column is `teamId` (FK to `teams.id`). `knowledge_items.scopeId` is a separate column on a different table.

Options:
A) Add `agents.scopeId TEXT` column via a new migration — consequences: schema change, migration file, updates to `NewAgent` consumers, risk of cascading changes into B1/D4 tests; out of scope for a G1 described as `S (~1d)`.
B) Encode scope in `agents.skills` as a JSON blob with a `scope` key and rely on `agents.teamId` for Product Managers — consequences: zero schema change, but scope lookups for facilitator routines in G2/G3 must parse `skills` JSON.
C) Add a new `agent_scopes` sideband table — consequences: cleanest modeling, but introduces a new table for the single scope field.

**Proceeding with (B).** Rationale: G1 is explicitly a one-day scoped package and TRACK-G.md does not mention a schema change. Persisting scope in the existing nullable `skills` text column (which is already documented as an agent-metadata field in `ARCHITECTURE.md`) avoids a schema cascade. If G2 needs a first-class lookup we promote it to a column then. Flag for review.

The concrete shape stored in `agents.skills` for facilitators is:

```json
{"scope": "<community|product_id|null>", "tools": ["route_item","score_attention","promote_knowledge","create_conflict_review"]}
```

Worker agents continue to use their existing `skills` format; we do not migrate them.

## 3. Design

### 3.1 Soul prompt files

**Location.** Create directory `docs/souls/` at the repo root. Rationale:
- Soul prompts are long-lived identity documents meant to be read by both humans (reviewers) and agents (at session start). They belong beside the other architecture prose in `/docs`, not inside a package.
- They are git-tracked static assets, not build artifacts — no package needs to compile them.
- `provisionSession` receives a path and hands it to the harness; any readable path works. Using `docs/souls/` is consistent with other doc-path fields (e.g. `products.briefPath`).
- Existing docs structure has no `docs/souls/` or `docs/agents/`; adding `docs/souls/` introduces one obviously-named folder.

**Path stored in `agents.soulPromptPath`.** Repo-relative, forward slashes, e.g. `docs/souls/chief-of-staff.md`. Consumers that need an absolute path resolve via `path.resolve(process.cwd(), soulPromptPath)` — this is how D5 consumers already handle it (the adapter reads the file lazily).

**Files to create.** Three files, minimal prose, identical structure (Title, Role, Mission, Scope, Boundaries, Tools, Escalation):

1. `/workspace/docs/souls/chief-of-staff.md`
2. `/workspace/docs/souls/practice-facilitator.md`
3. `/workspace/docs/souls/product-manager.md`

Each file begins with a YAML front-matter block declaring stable metadata:

```yaml
---
role: chief_of_staff                # or practice_facilitator / product_manager
version: 1
---
```

followed by markdown sections. Minimal content for each (verbatim — to be committed as-is):

**`docs/souls/chief-of-staff.md`** — ~40 lines. Sections: *You are the Chief of Staff of the HyperIdle factory*, *Your mission* (organize L4 knowledge, coach Product Managers, prepare the monthly portfolio conversation, surface cross-product patterns), *Scope* (factory-wide; `scope_id = null`), *You do NOT* (write code, ship features, talk to customers, make product decisions — those are Product Managers and workers), *Tools you rely on* (`route_item`, `score_attention`, `promote_knowledge`, `create_conflict_review`, plus standard D4 tools), *Escalation* (escalate to humans only when attention score crosses threshold; never block the factory without a human conversation). Prose only. No code.

**`docs/souls/practice-facilitator.md`** — ~40 lines. Sections: *You are a Practice Facilitator for the `{{community}}` community* (template placeholder; not substituted at seed time — the soul prompt is the archetype, the seeded agent's `name` carries the community), *Your mission* (organize L3 practice knowledge for your community, merge duplicates across products, resolve conflicts, score for human attention, curate the weekly queue), *Scope* (single community of practice: build / product / growth / ops / facilitation), *You do NOT* (own any single product, write the code, escalate without context), *Tools*, *Escalation*.

**`docs/souls/product-manager.md`** — ~40 lines. Sections: *You are the Product Manager of the `{{product}}`*, *Your two jobs* (Job 1 Coordinator — runs cycles, shapes pitches, resolves handoffs; Job 2 Self-improver — watches its own facilitation quality, captures L2 facilitation-level learnings, learns from Chief of Staff coaching), *Scope* (one product), *You do NOT* (write code, ship features directly — delegate to workers in your team), *Tools*, *Escalation* (escalate to Chief of Staff when something is beyond product scope).

Wording should be concrete and imperative. No placeholders beyond the single `{{community}}` / `{{product}}` token which the harness does not interpret — these stand as authorial hints and G2/G3 will template-substitute when routines construct session prompts. For G1 the raw file is sufficient; the acceptance criterion is only that the path exists and resolves.

### 3.2 Seed updates (`packages/db/src/seed.ts`)

Add the following inserts to `seed()`, all using `.onConflictDoNothing().run()` for idempotency. Order: products/teams exist → insert Product Manager (needs team) → insert Practice Facilitators (no team; scope in skills JSON) → patch Chief of Staff with `soulPromptPath` and `skills` JSON.

**Patch existing `seed-agent-cos` (Chief of Staff).** Issue a follow-up `UPDATE` (not another INSERT) to populate fields the existing row lacks:

```
UPDATE agents
  SET soul_prompt_path = 'docs/souls/chief-of-staff.md',
      skills = '{"scope":null,"tools":["route_item","score_attention","promote_knowledge","create_conflict_review"]}'
  WHERE id = 'seed-agent-cos';
```

This keeps `id='seed-agent-cos'` stable (already referenced as `updatedBy` on `seed-ki-1`) and avoids a destructive rename.

**Insert one Product Manager (scoped to `seed-product-1`).**

```
id:                 'seed-agent-pm-nimmly'
name:               'Nimmly Product Manager'
role:               'product_manager'
teamId:             'seed-team-1'
status:             'active'
maxConcurrentSessions: 1
soulPromptPath:     'docs/souls/product-manager.md'
skills:             '{"scope":"seed-product-1","tools":["route_item","score_attention","promote_knowledge","create_conflict_review"]}'
createdAt:          now
```

**Insert five Practice Facilitators (one per community — the spec says "≥1"; we seed the full set of five named in KNOWLEDGE_ARCHITECTURE §9 so downstream work has a complete row set).**

Community scopes: `'build'`, `'product'`, `'growth'`, `'ops'`, `'facilitation'`. For each community `C`:

```
id:                 'seed-agent-pf-' + C
name:               C + ' Practice Facilitator'          // capitalised
role:               'practice_facilitator'
teamId:             null                                    // practice community, not a product team
status:             'active'
maxConcurrentSessions: 1
soulPromptPath:     'docs/souls/practice-facilitator.md'
skills:             '{"scope":"' + C + '","tools":["route_item","score_attention","promote_knowledge","create_conflict_review"]}'
createdAt:          now
```

All inserts use `.onConflictDoNothing()`. Ids are deterministic strings (no `crypto.randomUUID()`) so repeated seed runs stay idempotent.

**No changes to existing rows besides the one `UPDATE` on `seed-agent-cos`.** The `UPDATE` is safe on a second seed run because it writes idempotent values.

### 3.3 Four new tool files

Created under `packages/server/src/skill-tools/`. Each follows the `create-item.ts` pattern exactly: Zod input schema → typed `handler(args, ctx) → Promise<ToolResult>` → exported `ToolDefinition<Input>` with `name`, `description`, `inputSchema`, `handler`.

All four register in `packages/server/src/skill-tools/tool-registry.ts` (appended to the `definitions` tuple inside `buildToolRegistry`) and re-export from `packages/server/src/skill-tools/index.ts`.

Caller identification: the `ctx.agentId` in `ToolContext` is the calling agent; tools do not themselves verify that caller is a facilitator (authorization is a Policy Engine concern — E7 — not a tool concern). Tools validate inputs and perform the state transition.

---

#### 3.3.1 `route_item.ts`

**Purpose.** Route an EXISTING `items` row to a view by computing the view via `routeItem(...)` and persisting a routing record. The pure-function `routeItem` in `services/item-router.ts` returns `"conversations"|"rail"|"work"|"knowledge"`. The current `create-item.ts` already uses it implicitly. This tool exists so a facilitator can explicitly re-route an item it picked up (e.g. after merging duplicates or after promoting a knowledge item).

**Input schema.**

```
routeItemInputSchema = z.object({
  itemId:    z.string().min(1),
  riskTier:  z.enum(['low','medium','high']).optional(),  // override if the facilitator adjusts risk
  kind:      z.string().optional(),                        // override; default = item.kind
  verb:      z.string().optional(),                        // override; default = item.verb
});
```

**Handler side effects.**
1. `safeParse` input — on failure `err('INVALID_INPUT', ...)`.
2. `db.select().from(items).where(eq(items.id, input.itemId)).get()` — if missing, `err('NOT_FOUND', 'Item not found: ' + itemId)`.
3. Compute `view = routeItem({ riskTier: input.riskTier ?? item.riskTier, kind: input.kind ?? item.kind, verb: input.verb ?? item.verb })`.
4. `db.update(items).set({ riskTier, kind, verb })` ONLY for fields the caller explicitly overrode (others stay as-is). No other columns change.
5. Return `ok({ itemId, view, riskTier, kind, verb })` where the last three are the effective (post-override) values used for routing.

**No new database columns.** The view is a computed projection — it is not persisted on `items`. Downstream readers (Conversations, Rail, Work, Knowledge) already call `routeItem` when listing; if G2 needs a stored `view` column it can add one.

**No event emission.** Unlike `create_item`, this tool does not emit `item_created`; the item already exists. If G3 wants an `item_routed` event, it can add one later.

**Name / description.**
- `name: 'route_item'`
- `description: "Route an existing item to its correct view (conversations | rail | work | knowledge) based on risk tier and kind. Accepts optional overrides for riskTier, kind, or verb; returns the resolved view."`

**Return shape.** `{ itemId: string; view: 'conversations'|'rail'|'work'|'knowledge'; riskTier: string|null; kind: string|null; verb: string|null }`.

---

#### 3.3.2 `score_attention.ts`

**Purpose.** Update an item's attention score. G2 will wire the real scoring engine; G1 accepts a pre-computed score and persists it. The spec explicitly calls this "stub accepting a score value for now, to be wired in G2". Works on BOTH `items.attentionScore` and `knowledge_items.attentionScore` — callers specify which table via `target`.

**Input schema.**

```
scoreAttentionInputSchema = z.object({
  target:   z.enum(['item','knowledge_item']),
  id:       z.string().min(1),
  score:    z.number().min(0).max(1),   // G2 threshold is 0.7; valid range [0,1]
  reason:   z.string().optional(),       // free-form note captured in audit trail (future use)
});
```

Note the G1/G2 shim: G1 persists a `real` (`knowledge_items.attentionScore` is `real`) or `integer` (`items.attentionScore` is `integer`). To keep a consistent public contract, we accept `number` in `[0,1]`; when writing to `items.attentionScore` we store `Math.round(score * 100)` (0–100). G2 may change this once its storage decision lands; the tool boundary stays stable.

**Handler side effects.**
1. Validate input.
2. If `target === 'knowledge_item'`, load from `knowledge_items`; on missing → `err('NOT_FOUND', ...)`. Update `attentionScore = score`, `updatedAt = now`. Do NOT bump `version` (attention score is metadata, not a content edit — this matches the existing no-event path on score updates in `knowledge-repository.ts`).
3. If `target === 'item'`, load from `items`; on missing → `err('NOT_FOUND', ...)`. Update `attentionScore = Math.round(score * 100)`.
4. Return `ok({ target, id, score })` — return the raw 0–1 score so callers don't reason about the items-table encoding.

**Name / description.**
- `name: 'score_attention'`
- `description: "Set an attention score in [0,1] on an item or knowledge_item. G1 stub: callers supply the score; G2 will replace this with a computed score from the attention engine."`

**Return shape.** `{ target: 'item'|'knowledge_item'; id: string; score: number }`.

---

#### 3.3.3 `promote_knowledge.ts`

**Purpose.** Transition a `knowledge_items.status` forward along the promotion chain. G1 proves CAPTURED → PROVISIONAL. G3 will add the rest of the automation and the conflict-blocking rule.

**Input schema.**

```
KNOWLEDGE_STATUSES = ['captured','provisional','validated','active','stale','archived'] as const;

promoteKnowledgeInputSchema = z.object({
  knowledgeItemId: z.string().min(1),
  toStatus:        z.enum(KNOWLEDGE_STATUSES),
  reason:          z.string().optional(),
});
```

**Handler side effects.**
1. Validate input.
2. Load the row; if missing → `err('NOT_FOUND', ...)`.
3. Validate the transition using a hard-coded `allowedTransitions` map defined at module scope:

   ```
   captured    → provisional
   provisional → validated, archived
   validated   → active, archived
   active      → stale, archived
   stale       → active, archived
   archived    → (terminal)
   ```

   If the requested transition is not allowed → `err('INVALID_TRANSITION', 'cannot transition ' + from + ' → ' + to)`. G3 may widen this.

4. Conflict gate: if `toStatus === 'validated'`, check `knowledgeConflicts` for any row with `itemId = id AND status = 'open'`. If any exists → `err('CONFLICT_OPEN', 'open conflict blocks promotion to validated')`. This is the rule called out in KNOWLEDGE_ARCHITECTURE §6.2. CAPTURED → PROVISIONAL is not gated.

5. `db.update(knowledgeItems).set({ status: toStatus, updatedAt: now, updatedBy: 'agent:' + ctx.agentId })`. Do NOT bump `version` (status is metadata, not a content edit; matches existing convention).

6. Append to `knowledge_edit_log` with `editor='agent:' + ctx.agentId`, `field='status'`, `oldValue=from`, `newValue=to`, `editType='refinement'` (closest existing value). This gives G3 an audit trail to reason over.

7. Return `ok({ knowledgeItemId, fromStatus, toStatus })`.

**Name / description.**
- `name: 'promote_knowledge'`
- `description: "Transition a knowledge item's lifecycle status (captured → provisional → validated → active → stale → archived). Blocks promotion to 'validated' if any open conflict exists on the item."`

**Return shape.** `{ knowledgeItemId: string; fromStatus: string; toStatus: string }`.

---

#### 3.3.4 `create_conflict_review.ts`

**Purpose.** Create a new row in the existing `knowledge_conflicts` table (B5). This is the tool a facilitator calls when it detects a writeback that collides with a human edit or with another agent's proposal.

**Input schema.**

```
createConflictReviewInputSchema = z.object({
  knowledgeItemId: z.string().min(1),
  proposedBody:    z.string().min(1),
  proposedMeta:    z.string().optional(),        // JSON-encoded field-delta blob, same convention as existing table column
  versionBase:     z.number().int().nonnegative(),
  proposedBy:      z.string().optional(),        // defaults to 'agent:' + ctx.agentId
});
```

**Handler side effects.**
1. Validate input.
2. Load the knowledge item; if missing → `err('NOT_FOUND', ...)`.
3. Read `item.version` and store as `versionCurrent`. If `versionBase > item.version` → `err('INVALID_INPUT', 'versionBase ahead of current')`.
4. Insert row into `knowledge_conflicts` with:

   ```
   id:             crypto.randomUUID(),
   itemId:         input.knowledgeItemId,
   versionBase:    input.versionBase,
   versionCurrent: item.version,
   proposedBody:   input.proposedBody,
   proposedMeta:   input.proposedMeta ?? null,
   proposedBy:     input.proposedBy ?? ('agent:' + ctx.agentId),
   status:         'open',     // schema default, written explicitly for clarity
   createdAt:      now,
   ```

5. Return `ok({ conflictId, itemId, status: 'open' })`.

**Name / description.**
- `name: 'create_conflict_review'`
- `description: "Record a conflict between a proposed knowledge edit and the current stored version. Creates an open knowledge_conflicts row routed to the relevant facilitator's queue."`

**Return shape.** `{ conflictId: string; itemId: string; status: 'open' }`.

---

### 3.4 Registry + barrel updates

**`packages/server/src/skill-tools/tool-registry.ts`** — add the four imports and append them to the `definitions` tuple inside `buildToolRegistry`:

```
import { routeItemTool } from './route-item.js';
import { scoreAttentionTool } from './score-attention.js';
import { promoteKnowledgeTool } from './promote-knowledge.js';
import { createConflictReviewTool } from './create-conflict-review.js';

// inside buildToolRegistry
const definitions: readonly ToolDefinition[] = [
  readInboxTool,
  sendMessageTool,
  logTaskTool,
  queryPracticeTool,
  writeMemoryTool,
  handoffToTool,
  createItemTool,
  writeSessionNotesTool,
  // G1 additions
  routeItemTool,
  scoreAttentionTool,
  promoteKnowledgeTool,
  createConflictReviewTool,
];
```

No change to the `ToolContext` shape — the four new tools use only `db`, `agentId`, and (transitively) `eventBus`-like fields that already exist.

**`packages/server/src/skill-tools/index.ts`** — append four re-exports:

```
export { routeItemTool } from './route-item.js';
export { scoreAttentionTool } from './score-attention.js';
export { promoteKnowledgeTool } from './promote-knowledge.js';
export { createConflictReviewTool } from './create-conflict-review.js';
```

### 3.5 Data flow (AC6 — session provisioning for a facilitator)

The existing `provisionSession` in `packages/server/src/services/session-provisioning.ts` is already agent-role-agnostic. It reads `agent.role`, `agent.soulPromptPath`, and `agent.teamId` and passes them through. For G1's AC6 we need only prove that:

1. An agent row with `role='practice_facilitator'` (or `'product_manager'`, or `'chief_of_staff'`) and a non-empty `soulPromptPath` can be loaded by Phase 1.
2. The tool registry built in Phase 8 contains the four new tool names.
3. `materialize` (Phase 6) does not crash for `agentRole='practice_facilitator'` — it already has a `chief_of_staff` mapping in `relevance-scoring.ts` and `materialization.ts`; we must confirm the other two roles do not throw. If they currently map only certain roles, we add the minimal mapping (see Risks §7).

No session-provisioning source change is needed as long as the role maps exist. The integration test (§4) will exercise this end-to-end with the `MockHarnessAdapter`.

## 4. Tests to write (red phase — commit failing first)

All tests in `packages/*/src/__tests__/` using `createTestDb()` per the testing rules. Vitest via `bun run test`.

### 4.1 `packages/db/src/__tests__/seed.test.ts` — EXTEND the existing file

Add three new `it(...)` cases in the existing `describe('A2: Seed script', ...)`:

1. `'seeds one Chief of Staff, ≥1 Practice Facilitator, ≥1 Product Manager (AC1)'` — after `seed(db)`, count rows by role:
   - `role='chief_of_staff'` → exactly 1
   - `role='practice_facilitator'` → `>= 1` (we will seed 5)
   - `role='product_manager'` → `>= 1`
2. `'every seeded facilitator has a non-empty soul_prompt_path (AC2)'` — for each agent whose role is in the facilitator set, assert `soulPromptPath` is a non-empty string that ends in `.md`.
3. `'soul_prompt_path files exist on disk'` — resolve each path relative to `process.cwd()` (tests run from repo root) and assert `fs.existsSync(resolved)`. This binds AC2 to a file, not just a string. If the test runner CWD is the package, use `path.resolve(__dirname, '../../../../../', row.soulPromptPath)` — confirm which by running the existing seed test; adjust to match (test environment existing convention is repo root).

### 4.2 `packages/server/src/skill-tools/__tests__/route-item.test.ts` — NEW

Mirror `create-item.test.ts`. Cases:
1. `'returns NOT_FOUND for unknown itemId'`.
2. `'returns INVALID_INPUT for missing itemId'`.
3. `'routes a low-risk knowledge item to the knowledge view'` — seed an item, invoke with `kind='knowledge', riskTier='low'`; assert `view='knowledge'`.
4. `'high-risk item routes to conversations'` — seed item, override `riskTier='high'`; assert `view='conversations'`.
5. `'overrides persist on the items row'` — pass `riskTier='high'`, assert `items.riskTier` now `'high'` after the call.
6. `'non-overridden fields remain unchanged'` — pass no `kind`; assert `items.kind` still equal to seeded value.

### 4.3 `packages/server/src/skill-tools/__tests__/score-attention.test.ts` — NEW

1. `'sets attention_score on a knowledge_item (target=knowledge_item)'` — seed item with `attentionScore=null`; call with `score=0.42`; reread row; expect `attentionScore === 0.42`.
2. `'sets scaled attention_score on an items row (target=item)'` — seed item; call with `score=0.5`; reread; expect `attentionScore === 50`.
3. `'does NOT bump knowledge_items.version'` — capture `version` before, call, expect `version` after equal.
4. `'returns NOT_FOUND for unknown id (both targets)'`.
5. `'returns INVALID_INPUT for score < 0 or > 1'`.

### 4.4 `packages/server/src/skill-tools/__tests__/promote-knowledge.test.ts` — NEW (AC5 binding)

1. `'AC5: transitions captured → provisional and persists'` — seed item with `status='captured'`; call with `toStatus='provisional'`; reread; assert `status === 'provisional'` and a `knowledge_edit_log` row exists with `field='status'`, `oldValue='captured'`, `newValue='provisional'`.
2. `'returns INVALID_TRANSITION for captured → validated'`.
3. `'returns INVALID_TRANSITION for archived → anything'`.
4. `'blocks promotion to validated when an open conflict exists (CONFLICT_OPEN)'` — seed provisional item; insert open `knowledge_conflicts` row referencing it; call with `toStatus='validated'`; expect `err.code === 'CONFLICT_OPEN'`.
5. `'allows promotion to validated when the only conflicts are resolved/discarded'`.
6. `'returns NOT_FOUND for unknown id'`.
7. `'does NOT bump version on status change'`.

### 4.5 `packages/server/src/skill-tools/__tests__/create-conflict-review.test.ts` — NEW

1. `'inserts an open knowledge_conflicts row referencing the item'` — seed item at version 3; call with `versionBase=2, proposedBody='...'`; assert one row inserted with `status='open'`, `versionCurrent=3`, `versionBase=2`, `proposedBy='agent:' + ctx.agentId`.
2. `'NOT_FOUND for unknown knowledgeItemId'`.
3. `'INVALID_INPUT when versionBase > item.version'`.
4. `'honors explicit proposedBy override'`.

### 4.6 `packages/server/src/skill-tools/__tests__/tool-schemas.test.ts` — EXTEND

The existing suite validates that each registered tool's Zod schema converts to a Claude tool spec. Extend its fixture list to include the four new tool names so the registry contract is exercised: `['route_item','score_attention','promote_knowledge','create_conflict_review']` each must be present in `toClaudeToolSpecs()` output.

### 4.7 `packages/server/src/__tests__/session-provisioning.test.ts` — EXTEND (AC3 + AC6 binding)

(It uses the `MockHarnessAdapter`, not the real SDK — runs in CI unconditionally.) Add one test:

1. `'AC6: provisions a session for a practice_facilitator agent; registry exposes facilitator tools'` — seed a practice facilitator agent + a task assigned to it + a workspace adapter; run `provisionSession`; after completion, inspect the `HarnessAdapter` spy to assert `tools` passed to `startSession` contains `'route_item'`, `'score_attention'`, `'promote_knowledge'`, `'create_conflict_review'`. This proves AC3 (tools compile and are wired) and AC6 (facilitator provisions) in one test.

Confirm AC4 is covered by `create-item.test.ts` (already green) — `create_item` internally calls `routeItem`. Confirm AC5 is covered by `promote-knowledge.test.ts` §4.4.1.

### 4.8 Mapping tests → acceptance criteria (evidence table)

| AC | Test file | Test name |
|----|-----------|-----------|
| 1  | `seed.test.ts` | `seeds one Chief of Staff, ≥1 Practice Facilitator, ≥1 Product Manager` |
| 2  | `seed.test.ts` | `every seeded facilitator has a non-empty soul_prompt_path` + `soul_prompt_path files exist on disk` |
| 3  | `tool-schemas.test.ts` + each tool's `.test.ts` | all four tools compile, schema-convert, and return ToolResult |
| 4  | `route-item.test.ts` | `routes a low-risk knowledge item to the knowledge view` + `high-risk item routes to conversations` |
| 5  | `promote-knowledge.test.ts` | `AC5: transitions captured → provisional and persists` |
| 6  | `session-provisioning.test.ts` | `AC6: provisions a session for a practice_facilitator agent` |

Every acceptance criterion has at least one test; follows the First Principle (Validation Before Implementation).

## 5. Implementation order (TDD)

1. Write all tests in §4.1–4.7 (they will fail — red phase).
2. Create the three soul-prompt markdown files (§3.1). Now §4.1 test #3 can pass.
3. Update `packages/db/src/seed.ts` (§3.2). §4.1 all green.
4. Implement `packages/server/src/skill-tools/route-item.ts` → §4.2 green.
5. Implement `score-attention.ts` → §4.3 green.
6. Implement `promote-knowledge.ts` → §4.4 green.
7. Implement `create-conflict-review.ts` → §4.5 green.
8. Update `tool-registry.ts` and `index.ts` → §4.6 green.
9. Verify (or add) role mappings in `packages/fabric/src/relevance-scoring.ts` and `packages/fabric/src/materialization.ts` for `practice_facilitator` and `product_manager` (the existing file already maps `chief_of_staff → 'ops'`; see Risks §7). Map `practice_facilitator → 'ops'` and `product_manager → 'ops'` as temporary defaults — G2 will refine per community. Minimal one-line additions; document with a `// @lore: facilitators default to ops materialization until G2 specializes` comment per CLAUDE.md "Capture Lore" rule.
10. Run `bun run check && bun run lint && bun run test` → everything green.
11. §4.7 session-provisioning test green; AC6 validated.

## 6. How existing tests avoid breakage

- `packages/db/src/__tests__/seed.test.ts` already tolerates additional rows (asserts `>= 1`, queries `LIMIT 1`). Adding rows does not break it.
- `packages/server/src/__tests__/founder-router.test.ts` pattern-matches on `role`, not on id. Adding `product_manager`/`practice_facilitator` rows does not affect its existing `chief_of_staff` → `'both'` assertion.
- `seed-agent-cos` row is preserved (same id, same role, same name). Only `soulPromptPath` and `skills` are written by the new UPDATE — both were `null` before, so behavior is strictly additive.
- `knowledgeItems.updatedBy='seed-agent-cos'` FK-less reference continues to work.
- `packages/server/src/skill-tools/__tests__/tool-registry.test.ts` (already exists) asserts shape, not a specific tool count — adding four tools lengthens the tuple but does not break the assertion. Extending `tool-schemas.test.ts` in §4.6 formalizes that each new tool is present.

**Decision on the Chief of Staff collision:** REUSE the existing row. Neither RENAME nor REPLACE. Justification: the id is already referenced as `updatedBy` on a seeded knowledge item, and the existing seed test pattern (`INSERT ... ON CONFLICT DO NOTHING`) makes a rename destructive on re-run against a pre-existing DB.

## 7. Risks

### 7.1 Circular / cascading dependencies with G2 and G3

- `score_attention` is intentionally a thin setter. G2 owns the computation. The tool's signature (take a `number`, set the column) is stable; G2 adds a new module `packages/server/src/services/attention-scoring.ts` that computes a score and calls this tool's handler — or writes the column directly. Either way the tool contract doesn't change.
- `promote_knowledge` validates transitions today via a hard-coded map. G3 adds auto-promotion routines and the "5+ repetitions → VALIDATED" logic; those will call this tool rather than duplicate the transition guard. The CONFLICT_OPEN gate is installed now (G1) rather than later — it is cheap to add and matches KNOWLEDGE_ARCHITECTURE §6.2 unambiguously.
- **Mitigation.** Keep G1 tools pure state transitioners. Keep scoring and auto-promotion as separate services in G2/G3. Document this explicitly in each tool's JSDoc.

### 7.2 Concurrency on repeated seed runs

The added `UPDATE agents SET soul_prompt_path=..., skills=... WHERE id='seed-agent-cos'` is idempotent — re-running writes the same value. All INSERTs are `.onConflictDoNothing()`. `seed.test.ts` "is idempotent (running twice does not error)" continues to pass.

### 7.3 `agentRole` → workspace-dir mapping gaps

`packages/fabric/src/materialization.ts` and `relevance-scoring.ts` hard-code a role → materialization-profile map that today mentions `chief_of_staff`, `builder`, `growth`, etc. If `product_manager` / `practice_facilitator` are absent and the map is looked up with a strict `role[...]` accessor, materialization for a seeded facilitator agent could throw.

**Mitigation.** Step 9 of §5 adds the two missing keys (default to the `'ops'` profile to match `chief_of_staff`). This is a one-line change in each file with a `@lore` comment. The AC6 integration test (§4.7) fails loudly if this is missed, catching it before merge.

### 7.4 Soul prompt path resolution at runtime

`provisionSession` passes `soulPromptPath` verbatim to the harness. If the harness/adapter resolves paths against its own working directory rather than the repo root, the seeded relative paths will be invalid at spawn time.

**Mitigation.** The value stored is repo-relative; the harness adapter (`packages/server/src/harness/claude-agent-sdk-adapter.ts`) is responsible for resolving it. If inspection shows the adapter does NOT prepend the repo root, file a follow-up story — do NOT patch the seed to absolute paths, since absolute paths are hostile to git and docker. For G1 the test in §4.1 only asserts the file exists at the repo-relative location; that is sufficient for AC2.

### 7.5 Scope encoding in `agents.skills` (see CONFUSION in §2)

If G2 decides scope needs a first-class column, G1's `skills` JSON blob becomes dead metadata. The cost of later migrating is one `ALTER TABLE` + a one-line backfill — acceptable.

## 8. Trade-offs

- **Seeding 5 Practice Facilitators vs. 1.** Acceptance asks for ≥1; we seed the full set so downstream work doesn't need its own seed migration. Cost: 4 extra rows. Benefit: G2/G3 tests can assume community coverage.
- **`agents.skills` JSON vs. new column for scope.** See CONFUSION. We accept a looser contract to stay within the 1-day scope.
- **Status stored lowercase vs. uppercase.** Spec writes `CAPTURED → PROVISIONAL`; storage is lowercase per existing `writeMemoryTool`. We accept and return lowercase; callers who ask for uppercase can format client-side.
- **`promote_knowledge` does not bump `version`.** Matches existing conventions (attention/status are metadata, not body edits) and preserves optimistic-concurrency semantics for real body edits. Cost: facilitator audit goes through `knowledge_edit_log` only.
- **`score_attention` stores `Math.round(score*100)` for `items` but raw 0–1 for `knowledge_items`.** Each column's type dictates this (integer vs. real). The tool's input contract stays stable.

## 9. Open questions (non-blocking — default behavior chosen)

1. Should `promote_knowledge` also emit a `knowledge_item_updated` event? **Default: yes, reusing `knowledgeEvents.emit` from `packages/fabric/src/events.ts` if it is already emitted by the repository on status change; otherwise skip for G1 and add in G3.** Investigate during step 6 of §5; flag in PR if changed.
2. Should `score_attention` and `promote_knowledge` be locked to `role in {chief_of_staff, practice_facilitator, product_manager}`? **Default: no.** Authorization is E7's job; tools stay capability-neutral.
3. Should Practice Facilitators be members of a distinct "practice community" team row? **Default: no.** Teams are product-scoped per schema (`teams.productId` is not null). Practice communities are a separate concept; using `teamId=null` keeps the schema honest. If a "community" primitive is introduced later it lives in its own table.

## 10. Files touched

Created:
- `/workspace/docs/souls/chief-of-staff.md`
- `/workspace/docs/souls/practice-facilitator.md`
- `/workspace/docs/souls/product-manager.md`
- `/workspace/packages/server/src/skill-tools/route-item.ts`
- `/workspace/packages/server/src/skill-tools/score-attention.ts`
- `/workspace/packages/server/src/skill-tools/promote-knowledge.ts`
- `/workspace/packages/server/src/skill-tools/create-conflict-review.ts`
- `/workspace/packages/server/src/skill-tools/__tests__/route-item.test.ts`
- `/workspace/packages/server/src/skill-tools/__tests__/score-attention.test.ts`
- `/workspace/packages/server/src/skill-tools/__tests__/promote-knowledge.test.ts`
- `/workspace/packages/server/src/skill-tools/__tests__/create-conflict-review.test.ts`

Modified:
- `/workspace/packages/db/src/seed.ts` (new inserts + one update)
- `/workspace/packages/db/src/__tests__/seed.test.ts` (three new cases)
- `/workspace/packages/server/src/skill-tools/tool-registry.ts` (4 imports + tuple)
- `/workspace/packages/server/src/skill-tools/index.ts` (4 re-exports)
- `/workspace/packages/server/src/skill-tools/__tests__/tool-schemas.test.ts` (fixture list)
- `/workspace/packages/server/src/__tests__/session-provisioning.test.ts` (one case)
- `/workspace/packages/fabric/src/materialization.ts` (two-key map addition, with `@lore`)
- `/workspace/packages/fabric/src/relevance-scoring.ts` (two-key map addition, with `@lore`)

No schema changes. No migration. No shared-type changes (role union already complete).
