# AU34 — founder rulings

## Ruling 1 — a framework package may name another framework package (2026-08-09)

Founder, verbatim: *"framework to framework imports should be fine. lets adapt the rule to allow
that."*

**Context.** `framework/shared` has no framework-to-framework edge today because it is one package.
Splitting it into eighteen turns nine internal imports into cross-package crossings — `event-bus` →
`diagnostics` (`event-bus.ts:8`), `host-process` → `diagnostics` (`git/git-runner.ts:16`),
`http-middleware` → `diagnostics` (`http/access-boundary.ts:31`), `harness-protocol` → `event-bus`
(`harness-port.ts:46`), `tool-protocol` → `event-bus` (`tool.ts:27`), `harness-protocol` →
`work-intent-port` (`harness-port.ts:45`), `harness-protocol` → `harness-capability`
(`harness/harness-adapter.ts:7`, `harness/harness-capability-read-model.ts:40`), `conversation-parts` →
`harness-capability` (`part.ts:687`), `tool-protocol` → `harness-protocol` (`tool.ts:28`) — plus a
matching `manifest` crossing for each, so the packages could not even declare one another as
dependencies. `inAudience` (`scripts/lib/governance-model.ts:166-171`) matches only `actor.role` or
`actor.name`, and none of the model's 10 existing surfaces grants the `framework` role. The category
had no precedent.

**Ruling.** Adapt the rule. A framework package naming another framework package is allowed, as a
property of the model — not as a sibling name threaded through each target's `reach` list.

**Consequence, and what a `reach` list now means.** A framework surface's audience describes who
**outside the framework role** may name it. Reach lists therefore carry no sibling entries, and no
`decided-rules.json` rows are needed for `framework → framework` pairs — a material reduction against
the 70–200-row estimate.

**Widening this also grants, stated so it is not discovered later.** The ruling is general, so it also
admits framework packages naming the three framework surfaces that exist today —
`framework/api-contract` (`reach: ["layer"]`), `framework/design-system` (`reach: ["core-ui"]`) and
`framework/db`. Nothing imports them from a framework package now; the ruling means such an import
would no longer be refused. `framework/design-system`'s written reason ("there is exactly one user
interface. A second consumer of the design system means a second interface, which is a product
decision, not an import") is the one whose intent this most plainly relaxes. Flagged, not actioned —
the founder's ruling is general and stands as given.

**Predicate — scoped by the orchestrator, 2026-08-09.** The ruling's text ("a framework package naming
another framework package") is literally satisfied by any surface *of* a framework package, which
includes `db:schema-ns`, `db:unknown` and `db:testing` — all `reach: []` today, and the first two
`oneDoorSurfaces`. The broad reading would grant all eighteen new packages production reach to "one
import that hands over every table at once" and to the undecided-surface catch-all. `plan.md:40` puts
table and boundary work out of scope (AU30/AU31), so AU34 has no mandate to move that line.

The clause therefore admits a `framework`-role source **only when the target surface label is
`framework/<name>`**. `db:*` surfaces keep their declared audiences unchanged. The attack case §6
already requires must be the **control twin** that a `framework` source is still refused at
`db:schema-ns` — that is the case that makes the gate discriminate between the two readings, and
`governance/decided-rules.json` cannot, since it holds no `source: "framework"` row for any `db:*`
target. Flagged to the founder; reversible on request.

**Where it lands.** The crossing/decision model (`scripts/lib/governance-model.ts`, and the twin in
`scripts/lib/governance-attacks.ts`), the written model in `governance/README.md`, and whatever
`decided-rules.json` rows the change makes unnecessary. Because it alters the model rather than one
package's audience, `framework/db/src/__tests__/governance-model.test.ts` is the gate that must
reproduce it.

## Ruling 2 — AC-5 is literal: a module with no consumer is deleted or folded in (2026-08-09)

Founder, verbatim: *"A module without a consumer makes no sense, that module can be deleted or just
folded into something that actually has a consumer."*

**Context.** `plan.md:51`: *"No module survives the split that nothing outside its own **package**
reaches."* Ten modules are reached only from inside their new package — the six `kinds/*` definitions,
`kinds/kind-definition.ts`, `blocks/slug.ts`, `toon-errors.ts`, `observability/events.ts`.
`requirements.md` proposed to satisfy the AC by co-locating each beside its importer, i.e. reading
"package" as "module".

**Ruling.** The literal reading stands. A module nothing outside its own package reaches does not
survive: **delete it, or fold it into the module that actually consumes it.** Co-location is not
satisfaction — the AC is enforced as written, and `requirements.md`'s §5.1 reinterpretation is
withdrawn.

**This does not collide with `plan.md:36`.** That constraint forbids "a diff that alters what a function
does". Folding a module into its consumer moves declarations between files; it changes no function's
behaviour, so it is placement and squarely in scope. The earlier framing of these two constraints as
irreconcilable was wrong.

**Applies to the whole split, not just the ten.** Any module the final package set leaves with no
consumer outside its own package is deleted or folded before the split lands — including any created by
the folding itself. The end state is checkable: no module in any new package is reached only from
inside it.

## Ruling 3 — the audience table is approved; rule rows are recorded minimally (2026-08-09)

**Concept gate passed.** The founder approved the eighteen packages and their audiences as stated in
`requirements.md` §4.1/§4.2, with the derivation audit in §4.7. Build authorised.

**Row policy: minimal.** `governance/decided-rules.json` records the new audiences in the shape
`framework/api-contract` and `framework/design-system` already use — a row per named source plus one
general contrast row per surface, rather than a row for every named source→target pair. Roughly 40–70
new rows against the exhaustive alternative's ~180; the file goes from 118 to roughly 160–190.

The decisions are recorded either way — the minimal shape does not weaken enforcement, because the
audience itself lives in `architecture.json` `surfaces` and the rows record verdicts the model must
reproduce. What the minimal shape gives up is an explicit written row for every pair; what it buys is a
file that stays readable.

## Open — none

Both rulings requested at refinement are given. The audience table itself (`decided-rules.json` rows)
goes to the concept gate with the architecture, not before it.
