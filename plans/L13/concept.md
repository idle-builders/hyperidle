# L13 — Concept: Product = Team (drill-down hierarchy)

## Verdict

**L13 reshapes a load-bearing noun: it locks `Product = Team` as a 1:1 identity, not two coordinated entities.** This is a vocabulary collapse, not a primitive introduction. There is no new primitive, no new schema column, no new API entity. What changes is the *meaning* of one of the existing primitives (Team) and the *navigation grammar* of the Work view (drill-down, not side-tree).

The 5-level work hierarchy is now canonically:

```
Portfolio → Product → Bet → Task → Session
                 ^
        (= Team — same surface, same noun)
```

A product team is one row in `products`, with exactly one row in `teams` whose `team.product_id` references it. Both rows continue to exist in the database, but at every layer above the schema — UI, URL, copy, mental model — there is one noun: **the product team**, addressed as "Product".

## What "1:1" actually means

Five tightenings against the current process-layer doc (`docs/process-layer/the-five-primitives.md` §3.4 already says "a Team … bound to a product"; L13 makes that a hard rule with teeth).

1. **Cardinality is 1:1, enforced.** Exactly one active `Team` per `Product` at any moment. Not zero, not two. (Today the schema permits zero, since `teams.product_id` is on the team side; L13 contracts the system to never create a product without its team.)

2. **Lifetimes coincide.** A team is formed when its product is created and dissolved when its product is killed. There is no "team-without-a-product" state and no "product-without-a-team" state. `team.formed_at` ≈ `product.created_at`; `team.dissolved_at` ≈ the moment the product is killed.

3. **Identity is the product.** When the user says "open the team", they mean "open the product". The URL the system mints carries the **product id**, not the team id. The team id remains an internal join key — useful for tasks and bets — but it is not a public identifier in the URL grammar, the copy, or the empty states.

4. **Vocabulary front-stage is "Product"; "Team" survives only as a roster word.** Page title, breadcrumb, navigation label all say "Product" (or the product's name). The word "team" survives in *one* place: the heading "Roster" or "Team roster" describing the agent group on the Product page — because that's the one place the Team facet (members, lead, capacity) is the relevant lens.

5. **Acts at the team level address the product.** "Form a team", "dissolve a team", "rename the team" — none of these are user-facing acts in v1. Forming and dissolving happen as side-effects of product create/kill. Renaming the product renames "the team". There is no separate team-rename verb.

## Probes settled

### Probe 1 — Why aren't they merged into one table?

**Settled: they stay separate at the schema layer; they are unified at every layer above it.**

Reasons:

1. The two rows carry disjoint columns. `products` carries `phase`, `briefPath`, `architecturePath`, `principlesPath`, etc. — *what the product is*. `teams` carries `members`, `leadAgentId`, `capacity`, `costCap`, `formedAt`, `dissolvedAt` — *who the team is*. Merging would force one wide table with a `kind`-discriminated null pattern, which gains nothing.
2. Foreign keys downstream are stable. `bets.team_id`, `tasks.team_id`, `agents.team_id` already point at `teams.id`. Re-pointing them at `products.id` would be a destructive migration with no payoff — the team id is a perfectly fine join key.
3. The 1:1 invariant is enforceable at the application layer (every product-create call in the same transaction creates the team). A future migration that adds a `UNIQUE` index on `teams.product_id` would lift the invariant into the DB; L13 does not block on that, but the architecture flags it as a follow-up.

**What it is NOT:** a schema redesign. The bytes on disk do not move. What moves is the *contract* the application code holds about them and the *vocabulary* the UI uses to describe them.

### Probe 2 — Same vs different: when is a "Product" not the same as a "Team"?

**Settled: never. There is no observable system state in which the answer to "what's the product?" differs from "what's the team?".**

The list of "what counts as the same":
- Same id namespace at the user-facing level (URL = product id).
- Same lifecycle (formed together, dissolved together).
- Same name (the team name *is* the product name; there is no second display string).
- Same authority surface (the human acts on "the product" — the team facet is the roster lens, not a separate authority).

The list of "what counts as different" — i.e. *facets* of the same noun, addressable at separate sub-views of the Product page:
- The **product facet**: brief, architecture path, brand, principles, phase, factory db path. These are the *what is being built* fields. Today they live on `products`.
- The **team facet**: roster (members), lead agent, capacity, cost cap. These are the *who is building it* fields. Today they live on `teams`.
- The **portfolio aggregate** (active bets count, ship rate, progress) is derived from the bets/tasks attached to the product+team pair.

Both facets are on **one Product page**. The page does not have a "Team" tab vs a "Product" tab — they are two regions of one page, like "About" and "Roster" sections in a single document.

### Probe 3 — What about the existing `WorkTeam` page (the "Team Board")?

**Settled: the legacy `/work/team` route is removed. It was the wrong shape — a singleton page that pretended one team existed in the world.**

The current `/work/team` route (in `packages/web/src/pages/WorkTeam.tsx`) does not take a product id. It mounts a Canvas + Kanban with hardcoded `CANVAS_BETS` and `INITIAL_TASKS`. It is "the Team Board" in the singular — a relic of a one-product-per-instance assumption that v3 explicitly rejected (the Portfolio is the entry point because there are *multiple* products).

L13 removes this route. Its successor is **the Product page itself**, addressed by product id. That page subsumes everything `WorkTeam` did:
- Canvas (committed bets) → "Active bets" region of the Product page, scoped to that product.
- Kanban (tasks across current bets) → out of L13 scope; tasks remain accessible via Bet detail. Task-level browsing is the property of the Bet, not the Product (per the v3 ownership rule that humans act at the bet level).
- PitchSelector overlay → out of L13 scope; the Add Bet flow is owned by L12 and L17.
- Roster (the team facet) → present on the Product page as a labeled region.

The legacy route redirects to `/work/portfolio` — the natural fallback, since "Team Board (singular)" no longer maps to any single product. Choosing the *first* product would be arbitrary; sending the user back to Portfolio makes them re-pick. That's the right tradeoff for a vestigial URL.

### Probe 4 — What changes when Product = Team?

**Settled: three things change.**

1. **Navigation grammar.** From "two top-level Work pages" (Portfolio + Team Board, parallel siblings in the submenu) to "one entry, one drill-down" (Portfolio → Product). The `Work` submenu loses its "Team Board" entry. The submenu now lists product names — the Portfolio is one of those entries' parent (or stays as the root "All products" landing).

2. **URL grammar.** From `/work/team` (singular, productId-less) to `/work/product/:productId`. The product id, not a team id, is the public handle. The `WorkBet` route at `/work/bet/:betId` is unaffected; it remains a peer in the `/work/*` namespace.

3. **Vocabulary.** "Team Board" → "Product" (or product name) on the page. The word "team" survives in copy at the roster region only, and in code as `teams` table + `team_id` join keys. Nothing else.

What does **not** change:
- The agent-team relationship. `agents.team_id` still works.
- The bet-team relationship. `bets.team_id` still works.
- The task-team relationship. `tasks.team_id` still works.
- The five-primitive process model. Bets, Tasks, Sessions, Routines unchanged.
- The Bet detail page (`/work/bet/:betId`), the way Tasks attach, the way Sessions roll up.

### Probe 5 — Drill-down vs side navigation

**Settled: drill-down only. There is no side-navigation tree exposing all products in parallel.**

The founder direction is explicit: "It should be a drill-down not a side navigation." The existing IconRail + Submenu remains for cross-view navigation (Conversations / Work / Knowledge), but inside the Work view, the path is Portfolio (level 1) → Product (level 2) → Bet (level 3) → Task (level 4 surface, opened via TaskSheet). Sessions are level 5 (jump-out per the spec; a Session is opened from a Task, in a child surface, not as a branch in the tree).

A side navigation tree would imply the user picks a product from a fixed list before entering Work. That violates the v3 mental model — the Portfolio canvas IS the picker, with status, ship rate, and progress carried on each card. Re-rendering the same picker as a tree would duplicate the canvas. Drill-down preserves one entry point.

The Submenu's role in the Work view: under L13, the submenu items reduce to a single "Portfolio" entry (the landing) plus, when the user is on a Product page, a breadcrumb-style indication that they have drilled down. The submenu remains a navigation surface for *cross-area* moves (in case the user lands on a deep `/work/product/:id` URL via search or share), but it does **not** present the products as a parallel tree.

(Architecture decides whether the Submenu surfaces a "Back to Portfolio" link or whether the breadcrumb-on-page is sufficient. The rule from the concept layer is just: no parallel tree.)

### Probe 6 — Lifecycle: what happens when a product is killed?

**Settled: killing the product implies dissolving its team, in the same act.**

Today the schema permits a team to outlive its product (no `ON DELETE CASCADE`; both `teams.product_id` and `bets.product_id` are `ON DELETE RESTRICT`). The application contract added by L13 is: when a product is killed, its team is dissolved in the same transaction, and any open bets attached to it are killed (or the kill is refused if they are still in flight — that policy is L14's call, not L13's).

The user does not see a separate "kill team" act. The roster region on the Product page does not have a "dissolve team" button. The team's lifecycle is a side-effect of the product's lifecycle, period.

### Probe 7 — Vocabulary collisions

The existing codebase uses "team" in many places that do not collide:

- `team_id` columns and joins → keep as join keys; they are below the line.
- Story copy like "the team's bets" → re-cast as "the product's bets" or "the product team's bets", as the design copy chooses.
- The agent-runtime concept "team" (an agent group bound to a product) → already 1:1 with product per the schema. No change.

The collision that matters: the **page title and breadcrumb**. Today `WorkTeam` says "Team Board". On the Product page that succeeds it, the heading is the product name (not "Team Board" or "Team"). When the page needs a noun in copy, it says "product" or "product team". Designer settles the exact phrasing.

There is also a subtle collision with the **agent-roster word "team"**. We accept this: the agent roster section is labeled "Roster" (or "Team roster" if disambiguation is needed), and the heading of the page is the product. So "team" reads as "the agents on this product team", which is exactly what the v3 model wants.

## What the concept commits us to

1. **Every product has exactly one team. Every team has exactly one product. Always. No exceptions.**
2. **The user-facing identifier of a product team is the product id.** URLs, breadcrumbs, page titles, and copy reference the product. The team id is internal.
3. **The Product page is the one surface that shows the unified product+team noun.** It carries the product facet (brief, phase, principles), the team facet (roster, lead, capacity), and the runtime aggregate (active bets, team burn vs cap). The exact layout is a designer call (variants explored in `design/`).
4. **The 5-level hierarchy is `Portfolio → Product → Bet → Task → Session`.** "Team" is not a level — it's the same level as Product, addressed by the product id.
5. **Navigation is a drill-down from Portfolio.** The Submenu does not list products as a parallel tree.
6. **The legacy `/work/team` route is removed.** Architecture decides the redirect target (`/work/portfolio` is the recommended fallback because picking a product to redirect to would be arbitrary).
7. **`bets.product_id` is the natural query key for the Product page's "active bets" region.** The team_id is also there as a fallback; either works because they are 1:1.
8. **Roster comes from `agents` filtered by `team_id`.** The page renders agent name, role, lead-vs-member; the lead is `teams.lead_agent_id`.
9. **Team burn vs cap comes from `teams.cost_actual` and `teams.cost_cap`.** Both already exist on the row. No new column.
10. **Empty-state for zero active bets is concrete and non-fake.** When `bets WHERE product_id = ? AND status IN ('committed', 'in_progress')` returns zero rows, the page shows a real empty state ("No active bets"), not a placeholder bet card.

## What L13 is NOT

- NOT a new primitive. The five primitives stand.
- NOT a schema migration. No new columns, no renames, no `ON DELETE CASCADE` flips.
- NOT a `/api/teams` resource. There is no public Team endpoint; the team is reached through the product or through the roster sub-shape of the product detail.
- NOT a Team-rename or Team-CRUD surface. Lifecycle is tied to product lifecycle.
- NOT the artifact-aggregation slot. L12 owns artifacts on the Product page; L13 leaves a clearly named region for L12 to fill (or omits it; designer picks).
- NOT a Bet detail or Task detail change. Drill-down to Bet (`/work/bet/:betId`) and Task (TaskSheet) stays as it is.
- NOT a side-navigation tree.
- NOT a settings change. The Settings panel's "Products" tab continues to manage the product list; that surface is out of scope.
- NOT a removal of the `teams` table. The table stays. The agent runtime, bet runtime, and task runtime all reference it.

## Vocabulary

| Term | Means |
|------|-------|
| Product team | The unified noun. One product, one team, addressed by product id. |
| Product page | The page at `/work/product/:productId`. Shows product facet + team facet + bets aggregate. |
| Roster | The agent group attached to the product team. Rendered as a region of the Product page; sourced from `agents WHERE team_id = ?`. |
| Active bets | Bets attached to the product team in `committed` or `in_progress` status. Rendered as a region of the Product page; sourced from `bets WHERE product_id = ? AND status IN (...)`. |
| Team burn vs cap | The runtime cost gauge: `teams.cost_actual` against `teams.cost_cap`. |
| Drill-down | The level-by-level navigation: Portfolio → Product → Bet → Task → Session. The single navigation grammar inside Work. |
| Side-navigation tree | The thing we do NOT build — a parallel list of all products as branches in the Submenu. |
| Legacy team route | The current `/work/team` route, which is removed and redirected to `/work/portfolio`. |
| Team facet | The team-shaped sub-shape of the product team: roster, lead, capacity, cost cap. Rendered on the Product page. Not a separate page. |
| Product facet | The product-shaped sub-shape: brief, phase, brand path, principles path. Rendered on the Product page. |

## Open questions for design

None block the architecture phase. Two designer-call items are flagged in the variant exploration in `design/`:

1. The breadcrumb shape for drill-down level 2 (variant A: explicit breadcrumb chip; variant B: a single "← Portfolio" affordance; variant C: implicit, via IconRail re-click).
2. Whether the Submenu shows "Portfolio" as the only Work entry, or also surfaces "← Back to Portfolio" while on a Product page. This is purely visual — the routing is unchanged either way.

## Conclusion

The concept is settled. The work is a vocabulary collapse plus a navigation tightening. There is no new primitive, no new column, no new endpoint family. Product = Team is now a hard 1:1 invariant, addressed everywhere by the product id. The Product page is the one surface that renders the unified product team, with three regions: product facet, team facet (roster + lead + capacity), and active bets. The legacy `/work/team` route is gone. Navigation is drill-down only. Proceed to design.
