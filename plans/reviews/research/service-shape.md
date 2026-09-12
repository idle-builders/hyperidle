# Service layer under a 4-object / 17-action / 9-event contract — research findings

Date of research: 2026-09-11. Tiers: **T1** = primary docs/talks/measurements by the people who built it; **T2** = reputable engineering blog or hands-on report with specifics; **T3** = opinion / tutorial / vendor marketing. Where a fetch failed and only a search snippet was read, this is flagged as "(snippet only)".

Method note: WebSearch + WebFetch of primary docs where possible. Several hexdocs and vendor pages redirected; the redirected page was fetched. Two pages (Khorikov's Medium "Always-Valid Domain Model", Debezium audit-log post) returned 403 and are cited from search snippets only.

---

## Q1. Backend shaped around named actions instead of CRUD-per-table

### What practitioners with shipped systems say about the unit of organization

**Vertical Slice Architecture (Bogard, 2018) — T1.** The unit is the *request*: "my architecture is built around distinct requests, encapsulating and grouping all concerns from front-end to back." Rule: "Minimize coupling between slices, and maximize coupling in a slice." Each slice picks its own pattern (transaction script or richer model) and refactors toward richer patterns only when a slice's complexity demands it. Stated prerequisite/failure mode: "assumes that your team understands code smells and refactoring."
https://www.jimmybogard.com/vertical-slice-architecture/ (2018-04-19)

**Dudycz on slices' semantic diffusion (2025-08-25) — T2.** The original idea diffused into rules Bogard never stated ("you can't share any code between slices", "every slice must have its own table", specific folder structures). Two workable shapes: pure self-contained slices, or a "thin coordination layer" facade over slices. Failure modes: pure slices → "feature factory" where domain concepts scatter; facade → "bloated orchestration service". "Vertical Slices Architecture is essentially CQRS with more prescriptive guidance on how to cut your architecture." For small teams: "The initial structure matters less than your ability to evolve it"; use business-focused naming even for CRUD.
https://www.architecture-weekly.com/p/my-thoughts-on-vertical-slices-cqrs

**Rico Fritzsche (2025-05-15) — T2/T3.** Slices "sometimes intentionally tolerate duplication in order to maintain slice independence"; "extract genuinely shared logic, but never force abstractions prematurely." Named failure mode: flattening a layered project into feature folders while keeping shared repositories/service layers — "neither truly vertical nor properly layered."
https://ricofritzsche.me/why-vertical-slices-wont-evolve-from-clean-architecture/

**Phoenix contexts (hexdocs, v1.7.x) — T1.** The unit is a *context module* that "encapsulate[s] data access and data validation" and exposes verb functions (`create_user`, `list_products`, `change_product/2`). Boundary guidance: "prefer distinct contexts per resource and refactor later if necessary", explicitly to avoid "large contexts of loosely related entities"; relatedness alone is not a reason to merge ("most application resources connect to others"). Internal structure is left free: "The major focus should be on how the contexts are defined and how they interact with each other." Changesets are returned across the context boundary because they are "a useful data structure for modeling changes between contexts and the web layer."
https://phoenix.hexdocs.pm/1.7.14/contexts.html

**37signals / Basecamp (Manrubia, 2022) — T1 (shipped system: Basecamp 3 codebase ~9 years, "400 controllers and 500 models").** No application-service layer: "We don't separate application-level and domain-level artifacts. Instead, we have a set of domain models exposing public interfaces to be invoked from the system boundaries" (controllers, jobs). Argument against services: quoting Evans, "The more common mistake is to give up too easily on fitting behavior into an appropriate object, gradually slipping towards procedural programming"; two named failure modes — boilerplate delegation objects, or anemic entities. Complex operations are organized with concerns + POROs (`recording.incinerate`, `account.terminate` delegating to `Account::Closing::Purging`). Good concern = "a cohesive unit that captures a trait of the host model"; bad concern = "arbitrary containers of behavior".
https://dev.37signals.com/vanilla-rails-is-plenty/ (2022-11-08), https://dev.37signals.com/good-concerns/ (2022-10-10)

**Rails service-object debate — T3 opinion.** Swett (2019): service objects "throw out the fundamental advantages of object-oriented programming"; prefer noun domain objects (`Tweet.new(...).deliver`). Counter-position exists (Dutro, "The Case for Service Objects", 2021). This is opinion; the shipped-system evidence is 37signals above.
https://www.codewithjason.com/rails-service-objects/ ; https://camerondutro.com/2021/05/21/the-case-for-service-objects/

**Convex (docs, current) — T1.** Public surface = `query`/`mutation`/`action` functions; "Most of your code should live in a directory like `convex/model`, and your public API ... should have very short functions that mostly just call into `convex/model`." Every public function has an argument validator. Notable for this question: **"Favoring more granular functions like `setTeamOwner` over `updateTeam` allows more granular checks for which users can do what."** Queries and mutations are transactions; splitting logic into multiple calls "introduces the risk of race conditions."
https://docs.convex.dev/understanding/best-practices/

**Remix route actions (v2 docs) — T1.** One `action` per route handles all non-GET requests; multiple forms in a route are disambiguated by a submit-button name/value; after an action, loaders revalidate. The unit is "the route" (data, mutation and rendering colocated).
https://v2.remix.run/docs/route/action/

**Ash Framework (docs v3.33.3) — T1.** Unit = *resource* with *actions*. "The best designed Ash applications will have numerous actions, named after the intent behind how they are used." Explicitly against "all reads going through a single read action, and the same goes for the other action types." "The intent is that as much behavior as possible is put into the action." APIs derived: "Database schemas, API endpoints, authorization rules, state machines, background jobs, and more all stem directly from your resource definitions."
https://ash.hexdocs.pm/actions.html ; https://ash.hexdocs.pm/what-is-ash.html

**DDD aggregate vs application service — T1 foundational.** Fowler (2003): "the more behavior you find in the services, the more likely you are to be robbing yourself of the benefits of a domain model"; Evans: the application layer "does not contain business rules or knowledge, but only coordinates tasks and delegates work to collaborations of domain objects." Vernon (2011): "Protect true invariants in consistency boundaries", "Design small aggregates", reference other aggregates by identity, "Use eventual consistency outside the boundary of an aggregate"; modify one aggregate per transaction; large cluster aggregates produce concurrency conflicts and transaction failures.
https://martinfowler.com/bliki/AnemicDomainModel.html ; https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf

**Transaction script — when it is fine (Anhaia, 2024) — T3, but cites Fowler.** Transaction script is legitimate while: "Fewer than three invariants on entity state", linear validate→compute→write→publish, rules not duplicated across use cases. Breaks "when invariants compound and interact." Promotion threshold: "The same rule appears in three or more use cases and you have already copy-pasted it once."
https://dev.to/gabrielanhaia/your-go-service-layer-is-just-a-transaction-script-thats-not-a-bug-457b

### Failure modes reported (summary)
- Anemic services / boilerplate delegation (37signals T1; Fowler T1).
- God/orchestration service when a facade grows (Dudycz T2).
- Transaction-script sprawl once invariants compound and get copy-pasted across scripts (Anhaia T3; Fowler's framing).
- Large contexts of loosely related entities when resources are merged because they "relate" (Phoenix T1).
- Slices done as flattened layers, or slices with no shared domain concept at all (Fritzsche T2, Dudycz T2).
- Single generic update action that "ignores domain rules" / can't carry per-action permissions (Ash T1, Convex T1).

---

## Q2. Whole-object upsert + invariants as the write model

### Evidence for "validate the resulting state" as a known pattern

**Always-valid domain model / invariants (Khorikov, 2022) — T2.** "People often view input validation and invariants as different concepts. In fact, they are exactly the same." From the domain model's view they are invariants ("a condition that must be held true at all times"); from the application service's view they are validation rules on external input. An app-specific rule ("all triangles need > 10 cm edges") is as much an invariant as "3 edges". Invariant violations inside the model → fail fast; validation failures at the boundary → expected, return a Result.
https://khorikov.org/posts/2022-06-06-validation-vs-invariants/ (Medium "Always-Valid Domain Model" post: 403, snippet only)

**Jovanovic (2026-05-02) — T3.** Invariant = "a rule about an object that must hold true for as long as the object exists"; enforce at construction (factory) and in methods; against procedural checking where "every rule lives in a place that just happens to be on the path the request took." Shift: "the model never accepts an invalid state."
https://milanjovanovic.tech/blog/what-invariants-are-and-why-a-domain-model-is-the-best-place-to-enforce-them

**Ecto changesets (docs v3.14) — T1.** Two classes: *validations* ("most validations can be executed without a need to interact with the database and, therefore, are always executed before attempting to insert or update") and *constraints* ("rely on the database and are always safe. As a consequence, validations are always checked before constraints"). A changeset carries an `action` field set by `Repo.insert/update`; validation is a function of the change, not a method per transition.
https://ecto.hexdocs.pm/Ecto.Changeset.html

**Public APIs that do state transitions as field edits — T1.**
- Linear GraphQL: a single `issueUpdate(id, input: { title, stateId, ... })` mutation; workflow state is just `stateId` in the input. No per-transition mutation in the getting-started docs. https://linear.app/developers/graphql
- Notion: `PATCH /v1/pages/{id}` takes `properties`, `archived`, `icon`, `cover`; archive/restore is `archived: true|false`. https://developers.notion.com/reference/patch-page
- JSON:API: one resource endpoint for create/update/delete; relationship updates are declared-state ("a request is successful if the server's state matches the requested state" — snippet only). https://jsonapi.org/faq/

Note: both Linear and Notion accept a *partial* input (PATCH semantics), not a literal full-object replace. No shipped system found that exposes a literal whole-object-replace as its only write. Whole-replace raises the lost-update problem; the standard mitigation is a version/ETag + `If-Match` → `412` (T3 general guidance, e.g. https://www.mscharhag.com/api-design/rest-concurrent-updates).

### Evidence for "one method per transition"

**Stripe Invoices (docs, current) — T1.** Status lifecycle is exposed as separate endpoints: `POST /v1/invoices/:id/finalize` (→ `open`, emits `invoice.finalized`), `/pay` (→ `paid`, emits `invoice.paid` or `invoice.payment_failed`), `/send`, `/void`, `/mark_uncollectible`. Invoices "can only be edited in [draft] status"; after finalization most fields are immutable. Each transition emits a *named* webhook, not a generic "changed".
https://docs.stripe.com/invoicing/integration/workflow-transitions

**Ash + AshStateMachine (docs) — T1.** "In Ash, all modifications go through actions." AshStateMachine declares `transition <action>, from: [...], to: [...]`; it "does not itself perform those transitions" — an action uses the `transition_state/1` change. Helpers return "all possible next states for a record". So the framework's idiom is: named action per intent, transition legality declared on top.
https://hexdocs.pm/ash_state_machine/what-is-ash-state-machine.html ; https://ash.hexdocs.pm/actions.html

**Fsmx / Ecto state machines (AppSignal, 2020-07-14) — T2.** Transitions declared as a map; per-transition validation via an optional `transition_changeset/4` pattern-matching `from`/`to`; side effects run inside the DB transaction so "if the changeset is invalidated ... the email ends up never being sent."
https://blog.appsignal.com/2020/07/14/building-state-machines-in-elixir-with-ecto.html

**Convex — T1.** "Favoring more granular functions like `setTeamOwner` over `updateTeam` allows more granular checks for which users can do what." (permission granularity is the stated reason, not invariants).
https://docs.convex.dev/understanding/best-practices/

**XState (Stately docs) — T1 for its own model.** Guards are boolean predicates evaluated per candidate transition; "every guard condition is explicit." The model is transition-centric; state validity is implied by the machine, not by a post-hoc predicate on the state.
https://stately.ai/docs/actors ; https://kyleshevlin.com/guidelines-for-state-machines-and-xstate/ (T3)

### What is lost with a single edit + invariant check, and how teams recover it

- **Intent.** CDC / diff-style events carry `before`/`after` but not *why*. Search-level evidence: "If intent matters → Event Sourcing is preferred; if data changes are sufficient → CDC is appropriate" (T3, javacodegeeks 2026-06, snippet only). Stripe recovers intent by having per-transition endpoints emit named events (T1 above).
- **Audit metadata.** Debezium's audit-log recipe writes a *transaction metadata* record (who/why/use case) in the same transaction and joins it to the row-level change events downstream (T1, snippet only — page returned 403). https://debezium.io/blog/2019/10/01/audit-logs-with-change-data-capture-and-stream-processing/
- **Per-action permissions.** Convex and Ash both argue named actions exist partly so authorization can be per intent (T1). Zero's server mutator "can add extra checks to enforce permissions" and "write to audit logs" (T1, https://zero.rocicorp.dev/docs/mutators).
- **Reported Ash user experience with the resource+actions model:** Alembic (consultancy selling Ash) reports velocity and lower onboarding barrier — T3 vendor. Launch Scout spike (2023-02-22, T2): good compile-time relationship errors, CRUD boilerplate removed, but testing guide "pretty bare bones" and some relationship types unsupported at that time. Elixir Forum "My thoughts on Ash" (2026-08-20, T3 user with production attempt): "all your web application needs solved in one place" and a "beautiful API", but "I spent too much time in the documentation or reading source code", unclear testing story for generated code, and lock-in fear; Ash's author replied "Ash isn't a fit for every person or every project". Search snippets from the same thread family: "It should not be the default choice for any team, especially those just starting out" (T3). https://elixirforum.com/t/my-thoughts-on-ash/69829 ; https://launchscout.com/blog/digging-into-the-ash-framework ; https://alembic.com.au/ash-framework

---

## Q3. Same validation for UI affordance and server

**Phoenix contexts + LiveView — T1.** Contexts expose `change_<thing>/2` returning a changeset "for form rendering without persisting data"; LiveView `phx-change="validate"` runs the same changeset function on every input change and `phx-submit` runs it again and persists. Validation "remains in one place and works consistently across all clients" — but it runs on the server (LiveView), so DB-dependent checks are available to the form path. Validations (in-memory) vs constraints (DB) split (Ecto, T1) is the line between what can run pre-flight and what cannot.
https://hexdocs.pm/phoenix_live_view/form-bindings.html ; https://phoenix.hexdocs.pm/1.7.14/contexts.html ; https://ecto.hexdocs.pm/Ecto.Changeset.html

**Ash — T1.** `AshPhoenix.Form.validate/2` validates params against the action; `Ash.can?/3` is a pre-flight authorization check (docs describe it as "primarily meant for use in `where`" clauses — i.e. it is not primarily marketed as a UI-affordance API). Snippet-level only. https://hexdocs.pm/ash_phoenix/AshPhoenix.Form.html ; https://hexdocs.pm/ash/policies.html

**Zero (Rocicorp) mutators — T1.** "A copy of each mutator exists on both the client and on your server." Same code can be shared, but "the implementations don't have to be the same, or even compute the same result." Client-side: "Reading in mutators is always local"; client mutators cannot await the network; reads see only cached data. Server-side: full DB access, "can add extra checks to enforce permissions", async work, raw SQL via `dbTransaction`; server mutator "always takes precedence"; if the server mutator throws, the optimistic change is reverted and a structured error returned. Mutators are transactional on both sides. Optional Zod validator on args.
https://zero.rocicorp.dev/docs/mutators ; https://zero.rocicorp.dev/docs/when-to-use

**Replicache — T1.** Mutators "run once on the client immediately ('optimistically'), and then run again later on the server ('authoritatively')"; sharing code is possible only with a JS backend over a key/value-shaped store: "If you want to use Replicache with some non-key/value backend datastore, such as a normalized SQL database, it typically makes more sense to implement the mutators twice."
https://doc.replicache.dev/howto/share-mutators ; https://doc.replicache.dev/concepts/how-it-works

**Electric — T1.** Four write patterns "in order of simplicity": online writes, optimistic state, shared persistent optimistic state, through-the-DB. Pattern 1 is recommended "if users are always connected and a brief delay after mutations is acceptable ... admin panels, internal tools" (snippet). Pattern 4 is "quite a heavy dependency", makes rollback handling harder to reconstruct. Electric's 2024 rewrite rationale: previous stack's "complexity ... has provided a wide surface for bugs"; new design syncs reads and leaves writes to "your existing API" ("Worse is Better", Gall's Law).
https://electric.ax/docs/guides/writes ; https://electric.ax/blog/2024/07/17/electric-next

**Figma LiveGraph engineer (Joy Gao, 2025-04-01) — T1 (built one).** Permissions in a sync engine are "a filter to determine whether a change event should be propagated to a client"; business logic "requires maintaining dual implementations across systems, risking inconsistencies." Schema compatibility with long-open tabs, conflict resolution, and scaling are named hard parts. Question to ask first: "Does syncing data improve my application's user experience, or is it overkill?"
https://expertofobsolescence.substack.com/p/the-hard-things-about-sync

**Convex on object sync engines — T2 (vendor blog with specifics).** "Developers implement each logical mutation ... twice: once for the authoritative server change and once for an optimistic update to the local store." Linear "uses a separate sync server that tails the Postgres replication log."
https://stack.convex.dev/object-sync-engine

**Marmelab hands-on with Zero (2025-02-28) — T2.** Good DX and end-to-end types; but "Only Postgres is supported", some column types unsupported, at that time "the Zero client provides no way of knowing that a mutation was rejected" (superseded by 0.18 custom mutators per Zero docs above), three services to run (DB, zero-cache, UI), alpha maturity; verdict: questionable for standard web apps vs. existing tooling.
https://marmelab.com/blog/2025/02/28/zero-sync-engine.html

**Zero "when to use" — T1.** Not local-first, no offline writes, TypeScript-only clients, best under ~100 GB datasets, server-authoritative, requires running zero-cache.
https://zero.rocicorp.dev/docs/when-to-use

**Sharing zod schemas in a monorepo — T3 (tutorial-grade).** Consensus pattern: schema in a shared workspace package imported by both sides; pitfall named is only version drift when the schema is published outside the repo. None of these posts address DB-dependent invariants or permission-dependent affordances.
https://leapcell.io/blog/sharing-types-and-validations-with-zod-across-a-monorepo ; https://catalins.tech/share-zod-validation-schema-between-server-and-client/

**Affordances from the server (HATEOAS/Siren/Hydra) — T3 general.** The alternative to shipping the invariant function to the client is having the server return the currently-valid actions with the object (Siren "actions", Hydra "advertise valid state transitions"). Widely described, thinly adopted in mainstream SaaS APIs; Stripe/Linear/Notion do not do it.
https://htmx.org/essays/hateoas/ ; https://sookocheff.com/post/api/on-choosing-a-hypermedia-format/

**Disabled-control UX (T3).** "Disabled buttons don't explain what's wrong" — if the affordance is computed client-side from the invariant, the same function should yield the *reason*, not just a boolean.
https://smart-interface-design-patterns.com/articles/disabled-buttons/

---

## Q4. Events after write: emit `<object>.changed` from one place

**In-transaction dispatch (Bogard, 2014) — T1.** Entities collect events; infrastructure dispatches them in `SaveChanges` before commit so side effects are "within the same logical transaction, but not necessarily in the same scope of raising the domain event." He notes the out-of-process option: "persisting our events as JSON and having an offline process pick up those undispatched events."
https://lostechies.com/jimmybogard/2014/05/13/a-better-domain-events-pattern/

**After-commit dispatch (Khorikov, 2017) — T2.** Dispatching before commit "is opening the application for potential inconsistency issues" (email sent, transaction rolled back). After-commit via ORM post-commit hooks "is good in most cases. There's still a small chance of inconsistency" (process dies between commit and dispatch; external consumer fails). For "100% certainty": persist events as rows, background worker processes them with retries — i.e. the outbox.
https://enterprisecraftsmanship.com/posts/domain-events-simple-reliable-solution/

**Postgres NOTIFY (docs 18) — T1.** "if a NOTIFY is executed inside a transaction, the notify events are not delivered until and unless the transaction is committed." Payload "must be shorter than 8000 bytes." Queue is 8 GB; "If this queue becomes full, transactions calling NOTIFY will fail at commit." Notifications go to sessions that have executed LISTEN — nothing is retained for a listener that is not connected (not durable). Ordering guaranteed within and across transactions by commit order.
https://www.postgresql.org/docs/current/sql-notify.html

**Recall.ai incident (2025-03, published 2025-07) — T1 measurement.** Transactions containing NOTIFY take an `AccessExclusiveLock` at commit "to ensure that queue entries appear in commit order", serializing all commits; caused three outages under tens of thousands of concurrent writers. They moved to application-layer event tracking in under a day. "Don't use LISTEN/NOTIFY if you want your database to scale to many writers." The page reports an upstream fix landed later (version not confirmed here).
https://www.recall.ai/blog/postgres-listen-notify-does-not-scale ; discussion https://simonwillison.net/2025/Jul/11/postgres-listen-notify/

**Outbox in Node (pg-transactional-outbox README) — T1 for the library.** Stores messages in the business transaction, "guarantees that a message is sent at least once"; two strategies: polling, or logical replication (requires `wal_level=logical` + a publication; "adds complexity compared to polling"). Needs a broker for the reference example.
https://github.com/Zehelein/pg-transactional-outbox

**CDC (Debezium) — T1 (snippet only, 403).** Row-level `before`/`after` from the WAL; complete audit without app logging; `REPLICA IDENTITY FULL` writes the whole row to WAL on every UPDATE. Intent recovered by joining a metadata row written in the same transaction.
https://debezium.io/blog/2019/10/01/audit-logs-with-change-data-capture-and-stream-processing/

**PGlite and logical replication — uncertain.** Search snippets say PGlite historically had "no logical replication / publications / subscriptions" and that support is being developed (v0.4 announcement 2026-03). Not verified in this pass; treat logical-replication-based outbox/CDC as unavailable on the PGlite local path until checked.
https://electric.ax/blog/2026/03/25/announcing-pglite-v04

### Evidence on lost events without an outbox
- Structural (T1/T2): after-commit in-process dispatch loses the event if the process dies between commit and handler (Khorikov); NOTIFY loses it if no listener is connected at commit (PG docs semantics).
- No published incident report of *lost business events* at small scale was found in this pass; the found incident (Recall.ai) is a throughput failure, not loss. The vendor/glossary claims that dual-write bugs are "silent and cumulative" (T3, Conduktor/MVP Factory) are plausible but unmeasured.

---

## Q5. "search + open" as the only reads; "edit" as the only write

**Linear public API — T1.** Reads: `issue(id)` and paginated `issues(filter: ...)`; "Most results that are paginated can also be filtered"; comparators `eq/neq/in/nin/lt/gt/…/contains…`, `and`/`or` nesting, relation filters (e.g. by assignee email), `every` for many-to-many. Write: single `issueUpdate(id, input)`. The docs do not state a rationale.
https://linear.app/developers/filtering ; https://linear.app/developers/graphql ; changelog https://linear.app/changelog/2021-09-16-graphql-filters

**Notion public API — T1.** `POST /v1/search` (by title; filter only on `object` type; sort by `last_edited_time`), `POST /v1/data_sources/{id}/query` (structured filter/sort within a database), `GET /v1/pages/{id}`, `PATCH /v1/pages/{id}`. Notion's own limitations page: search "works best when it's being used to query for pages and databases by name"; it is "not optimized for exhaustively enumerating through all documents", "not guaranteed to return everything", and for "searching or filtering within a particular database" you must use the query endpoint; indexing is not immediate. I.e. Notion needed **two** list shapes: a cross-object text search and a per-object structured query.
https://developers.notion.com/reference/search-optimizations-and-limitations ; https://developers.notion.com/reference/post-search ; https://developers.notion.com/reference/query-a-data-source ; https://developers.notion.com/reference/patch-page

**Height API — T3 (community docs, acknowledged dated).** "Search tasks" = full-text query + status/list filters; official docs "somewhat dated".
https://height-api.xyz/docs/intro/

**Stripe — T1.** The counter-shape: list/retrieve per resource, but writes are per-transition endpoints with named webhooks (see Q2).

**What breaks: N+1.** Any list whose rows need related rows (assignee, team, last message) hits N+1 if resolved per row. Standard fix in GraphQL is DataLoader batching within one tick (T1 graphql-js docs). https://www.graphql-js.org/docs/n1-dataloader/
The simpler fix for a fixed set of list views is a read model / query per object that does the join once — this is the CQRS half of vertical slices ("Vertical Slices Architecture is essentially CQRS", Dudycz T2) and Convex's shape (queries are separate functions from mutations, kept fast because "queries ... run on every relevant data change", T1). No source found that measured "search+open only" against a richer read API; the evidence is structural.

---

## Candidate structures

| Structure | What it requires | What practitioners report | Fit with the stated contract |
|---|---|---|---|
| **Per-object action module** (one module per object: `search`, `open`, `edit`, plus its few named verbs; invariants as a pure function on the resulting state; events emitted after commit inside the module) | Per-object folder; one invariant function per object; one write path per object; a read model per list view; a post-commit emit in one place | This is Phoenix's context shape (verb functions, "prefer distinct contexts per resource", changeset returned to the UI — T1) and Convex's shape (thin public functions over `convex/model`, validators on every public function — T1). 37signals ships a 500-model app with no service layer — behavior on the model (T1). Failure mode: a context that absorbs loosely related entities (T1); generic `update` blocks per-intent permissions (Convex T1, Ash T1). | Direct match to 4 objects × (search/open/edit). Extra verbs (send message, adjust, stop) sit in the same module as named functions. Simplest of the five. |
| **Vertical slices** (one folder per action: 17 slices) | 17 handlers, each with its own validation and data access; discipline to extract shared domain code only when it hurts | Bogard T1: works when the team "understands code smells and refactoring"; Dudycz T2: pure slices risk domain concepts scattering; tolerated duplication (Fritzsche T2). | Works, but a shared per-object invariant function is exactly the "shared domain concept" pure slices scatter. With 17 verbs over 4 nouns, slice-per-verb yields many near-empty slices; slice-per-object is the previous row. |
| **Aggregates + application services** (DDD) | Aggregate root per object; invariants on the root; one aggregate per transaction; thin app services coordinating; events collected on the aggregate | Foundational T1 (Fowler, Evans, Vernon). Reported failures: anemic services / thin-delegation boilerplate (37signals T1, Fowler T1); large aggregates → lock contention (Vernon T1). | The invariant-on-resulting-state idea is Khorikov's "always-valid" model (T2). But the *application service* layer is what 37signals and Phoenix drop; for 4 objects it is a second layer with nothing to coordinate. |
| **Resource framework (Ash-style)** | Declarative resource + named actions + validations + policies; API derived | Ash's own guidance is the opposite of one generic `edit`: "numerous actions, named after the intent" (T1). Users: steep learning curve, time in source code, unclear testing of generated code, lock-in fear (T3 forum); good compile errors, boilerplate removal (T2 spike). No TypeScript equivalent with comparable maturity found in this pass. | Philosophically opposed to whole-object edit. Adopting it means one action per transition. |
| **Sync-engine mutators** (Zero / Replicache / Electric through-the-DB) | Same mutator code client + server; server-authoritative; zero-cache or equivalent; Postgres-only, logical replication; client reads are cache-only | Zero T1: shareable but "don't have to be the same"; client cannot read the DB or await network; needs permission checks server-side. Replicache T1: with a normalized SQL backend "implement the mutators twice." Figma engineer T1: dual implementations drift; ask if sync is "overkill". Marmelab T2: alpha, three services. Electric T1: online writes recommended for simple always-online apps; through-the-DB is "heavy". | Gives "same function on both sides" literally, at the cost of a sync server, Postgres-only + logical replication (PGlite path unverified), and client-side invariants that cannot see DB state. The invariant-as-affordance goal is reachable without it (shared pure function + server reply). |

---

## What the evidence supports (with uncertainty)

1. **Organize by object, not by verb, not by layer.** The two shipped-system T1 sources closest to "few nouns, few verbs" (Phoenix contexts; 37signals) both put the verbs on the noun and drop the application-service layer. Convex says the same in TypeScript terms: thin public functions over a `model` directory, validator on every public function. Vertical slices per verb is not contradicted, but with 17 verbs / 4 nouns the "slice" and the "object module" coincide; the practitioner warning is against a shared orchestration layer *above* them, not against a shared invariant function *inside* them.

2. **"Validate the resulting state" is a real, named pattern** (always-valid domain model; Ecto validations; Khorikov's "validation and invariants are the same rules seen from two sides"). The Ecto split — in-memory validations vs DB constraints — is the practical line for what the UI can evaluate locally. **Uncertainty:** none of these sources runs the invariant on the client for affordances; LiveView runs it on the server per keystroke. Sharing a pure TypeScript invariant across a monorepo is well-trodden for schemas (T3 evidence only), but the DB-dependent and permission-dependent parts must stay server-side (Zero T1, Figma T1).

3. **Whole-object edit with lifecycle as a field is how Linear's and Notion's public APIs are shaped; per-transition endpoints is how Stripe's are shaped.** The strongest T1 arguments for per-transition are (a) per-intent authorization (Convex, Ash) and (b) named events/intent for audit (Stripe emits `invoice.finalized`, not `invoice.changed`). If the contract keeps a single `edit`, the evidence says recover intent with a change event that carries a diff (`before`/`after`, CDC-style) plus who/why metadata written in the same transaction (Debezium recipe). **Uncertainty:** no source measured a team that started with one edit + invariants and reported outcomes; the Ash forum thread is the closest to "resource+actions in production" and its complaints are about the framework, not the action model. Literal full-object replace was not found in any shipped public API — both Linear and Notion take partial input; if the edit is a true replace, add a version check (`If-Match`-style) or accept last-write-wins knowingly.

4. **Events: one post-commit emit, in-process, is the documented "good in most cases" choice; the outbox is the documented "100%" choice.** For a single-process-or-two team on PGlite/Postgres: in-process after-commit emission (Khorikov T2) is the simplest; LISTEN/NOTIFY adds a commit-time global lock under many writers (Recall.ai T1) and 8 KB payloads (PG docs T1) and is not durable; logical-replication outbox/CDC needs `wal_level=logical` and is unverified on PGlite. If loss between commit and handler matters, a polling outbox table (pg-transactional-outbox's polling mode) is the smallest durable step and works on plain SQL. **Uncertainty:** no small-scale loss incident report was found; the loss argument is structural.

5. **"search + open" per object is the shape Linear and Notion expose.** What broke for Notion is documented by Notion: one cross-object search is not a substitute for a per-object structured list query (index lag, not exhaustive, no in-database filtering) — they have both. The structural fix for list views needing joins is a read model per object (one query that does the join), which is what the CQRS reading of vertical slices and Convex queries already are. DataLoader is the fix only if the read side is GraphQL-style per-field resolution. **Uncertainty:** no measured comparison found; this is structural evidence.

Net: the simplest structure the evidence supports is **one module per object** holding `search`, `open`, `edit` (+ that object's named verbs), a pure `invariants(state)` function exported to the UI and the agent tool layer, a read model per list view, and one post-commit emit of `<object>.changed` with a diff. The parts the evidence says *not* to add first: an application-service layer above the modules, a sync engine to share mutators, LISTEN/NOTIFY as the bus, a resource framework that wants one action per intent.

---

## Sources (all accessed 2026-09-11)

T1
- https://www.jimmybogard.com/vertical-slice-architecture/ (2018-04-19)
- https://lostechies.com/jimmybogard/2014/05/13/a-better-domain-events-pattern/ (2014-05-13)
- https://phoenix.hexdocs.pm/1.7.14/contexts.html
- https://hexdocs.pm/phoenix_live_view/form-bindings.html
- https://ecto.hexdocs.pm/Ecto.Changeset.html (v3.14)
- https://dev.37signals.com/vanilla-rails-is-plenty/ (2022-11-08)
- https://dev.37signals.com/good-concerns/ (2022-10-10)
- https://docs.convex.dev/understanding/best-practices/
- https://v2.remix.run/docs/route/action/
- https://ash.hexdocs.pm/what-is-ash.html (v3.33.3), https://ash.hexdocs.pm/actions.html, https://hexdocs.pm/ash_state_machine/what-is-ash-state-machine.html
- https://martinfowler.com/bliki/AnemicDomainModel.html (2003-11-25)
- https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf (2011)
- https://zero.rocicorp.dev/docs/mutators, https://zero.rocicorp.dev/docs/when-to-use
- https://doc.replicache.dev/howto/share-mutators, https://doc.replicache.dev/concepts/how-it-works
- https://electric.ax/docs/guides/writes, https://electric.ax/blog/2024/07/17/electric-next (2024-07)
- https://expertofobsolescence.substack.com/p/the-hard-things-about-sync (2025-04-01, ex-Figma LiveGraph)
- https://www.postgresql.org/docs/current/sql-notify.html
- https://www.recall.ai/blog/postgres-listen-notify-does-not-scale (incident 2025-03)
- https://github.com/Zehelein/pg-transactional-outbox
- https://docs.stripe.com/invoicing/integration/workflow-transitions
- https://linear.app/developers/graphql, https://linear.app/developers/filtering
- https://developers.notion.com/reference/search-optimizations-and-limitations, https://developers.notion.com/reference/patch-page, https://developers.notion.com/reference/query-a-data-source
- https://www.graphql-js.org/docs/n1-dataloader/
- https://debezium.io/blog/2019/10/01/audit-logs-with-change-data-capture-and-stream-processing/ (snippet only)

T2
- https://www.architecture-weekly.com/p/my-thoughts-on-vertical-slices-cqrs (2025-08-25)
- https://ricofritzsche.me/why-vertical-slices-wont-evolve-from-clean-architecture/ (2025-05-15)
- https://khorikov.org/posts/2022-06-06-validation-vs-invariants/ (2022-06-06)
- https://enterprisecraftsmanship.com/posts/domain-events-simple-reliable-solution/ (2017-10-03)
- https://marmelab.com/blog/2025/02/28/zero-sync-engine.html (2025-02-28)
- https://stack.convex.dev/object-sync-engine
- https://launchscout.com/blog/digging-into-the-ash-framework (2023-02-22)
- https://blog.appsignal.com/2020/07/14/building-state-machines-in-elixir-with-ecto.html (2020-07-14)
- https://www.fujimon.com/blog/linear-sync-engine (2024-08-14, secondary on Artman's talk)

T3
- https://www.codewithjason.com/rails-service-objects/ (2019-09-24); https://camerondutro.com/2021/05/21/the-case-for-service-objects/
- https://dev.to/gabrielanhaia/your-go-service-layer-is-just-a-transaction-script-thats-not-a-bug-457b (2024)
- https://milanjovanovic.tech/blog/what-invariants-are-and-why-a-domain-model-is-the-best-place-to-enforce-them (2026-05-02)
- https://elixirforum.com/t/my-thoughts-on-ash/69829 (2026-08-20)
- https://alembic.com.au/ash-framework (vendor)
- https://blog.appsignal.com/2026/01/13/domains-and-resources-in-ash-for-elixir.html (tutorial, no tradeoffs)
- https://leapcell.io/blog/sharing-types-and-validations-with-zod-across-a-monorepo ; https://catalins.tech/share-zod-validation-schema-between-server-and-client/
- https://www.mscharhag.com/api-design/rest-concurrent-updates
- https://htmx.org/essays/hateoas/ ; https://sookocheff.com/post/api/on-choosing-a-hypermedia-format/
- https://smart-interface-design-patterns.com/articles/disabled-buttons/
- https://height-api.xyz/docs/intro/
- https://simonwillison.net/2025/Jul/11/postgres-listen-notify/
