## 3. What a Block is NOT

The rejection list is load-bearing. Get any of these wrong and the primitive collapses.

1. **A Block is NOT a new on-disk markdown dialect.** This is the founder's hard rule, quoted twice in the L2 story:

   > these blocks need to work without agents having to follow formatting or us introducing a new markdown dialect, that will fail. this block element needs to be something that we translate in when ingesting the markdown from the files watched back to the application.

   > we do not introduce a new markdown dialect. the markdown dialect stay github dialect compatible

   Agents continue writing GitHub-flavoured markdown to the workspace. The Knowledge Fabric continues watching plain markdown files. Blocks emerge during *ingestion* — the moment the markdown body becomes a thing the UI renders. There is no `<block id="...">` syntax, no fenced JSON, no front-matter contract beyond the project's existing one, no MDX, no agent-side awareness of blocks at all.

2. **A Block is NOT a chat message.** Conversations does not use Blocks. Threads carry messages (per L1); messages are independent shapes (plain, review, questionnaire). Folding "block" and "message" together because both are "things in a list" would create one shape with two sets of contracts and break both. The L2 story explicitly states "blocks are shared between Work and Knowledge; Conversations does not use them."

3. **A Block has NO per-block primary key in any table.** Operationally: there is no `blocks` table, no `block_id` column on any other table, no per-block row anywhere — and none must be introduced by L2, L16, L23, L26, or any consumer. The canonical `knowledge_items` table stores `body TEXT` (markdown); that body is the only stored form. This rejection is *operational* (a database constraint) and stands distinct from #1 (which is *agent-facing*: no on-disk dialect that would let agents write blocks). A *derivation cache* keyed by `(body_sha, parser_version)` MAY exist as an optimisation, but it is not a source of truth, it can be rebuilt at any time, and cache invalidation is by `body_sha` mismatch only — never by id reconciliation. The cache may key its rows by `blockId` for lookup, but that is an opaque value computed from §8.4, never an authority.

4. **A Block is NOT a UI component.** This rejection prevents collision with `UI_DESIGN.md`'s "Tier 2 — Blocks" tier (ThreadRow, BetCard, etc.). UI tier-2 components are React building blocks — coarse-grained reusable widgets in the design system. The L2 Block primitive is a *content* primitive — a derived region of a markdown body. They share the English word "block" and nothing else. The renderer that materialises a Block on screen *is* a UI component (a `BlockView` of some shape), but the Block itself is data, not a component. The vocabulary table (§7) names the disambiguation.

5. **A Block is NOT the verb "block" or the state "blocked".** HyperIdle uses both heavily — blocking review threads, blocked tasks, blocked agents. Those are runtime workflow states (per `PROCESS_LAYER.md` §6 and the 8-state task lifecycle). The noun "Block" introduced here is a content primitive. The vocabulary table marks both senses; in code and docs, "Block" with a capital B always refers to the content primitive, lower-case "blocked" / "blocking" always refers to the workflow state. No code symbol mixes them.

6. **A Block is NOT a transclusion target (yet).** HyperIdle does not currently support including one body inside another body (no `{{transclude blockId}}`, no `![[…]]` inclusion). The composition is one body → N blocks, full stop. If transclusion is added later, the BlockId outline path needs to compose under the *including* body (a transcluded block's identity must depend on which document includes it, not on its source), and that is a future concept-doc update bumping `blk:v1` → `blk:v2`. Until then, a block belongs to exactly one body and only one body. Cross-body references happen through threads anchored on `blockId`, not through inclusion.

---
