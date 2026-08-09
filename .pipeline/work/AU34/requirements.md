# AU34 — Requirements

`DOC-CLASS: update` — `governance/README.md` gains nothing new (it points at the registries, which is
where the change lands), but `docs/guides/developer/index.md` and `work-packages.md`, plus every doc that
names `@hyperidle/shared`, describe a package that will not exist. Reason: the noun changes, not the model.

`plan.md` is authoritative. Nothing below adds an outcome, an AC, or a scope item. Where a number here
disagrees with `plan.md`, the number here was measured on the live tree after AU29 (`0791c4fd`) landed
and the one in `plan.md` predates that merge; §1 lists every such disagreement. §5.1 surfaces the one place
this artifact reads an AC other than literally, so the founder rules on it rather than inherits it.

**A founder ruling landed mid-refinement.** `.pipeline/work/AU34/founder-rulings.md` Ruling 1 —
*a framework package may name another framework package, as a property of the model* — is binding and is
carried through §4, §6 and §7. §4.8 reports the measurement that prompted it, made against the population
this artifact had been missing.

**Every `reach` list in §4 is derived at the SYMBOL level.** The derivation builds the post-split map of
every exported name → its destination package — following re-exports to the declaring module, then
applying the three symbol relocations in §4.4 that move a name independently of its module — and
attributes every consumer import by the *name it imports*, not by the module it happens to live in. §4.7 is
the audit trail. Deriving at module level is what produced the two errors this revision fixes: a symbol that
crosses a package boundary on its own is invisible to a module-level audit **by construction**.

**The derivation population was itself a defect, and §4.8 closes it.** Rounds 1–3 fixed the *unit*
(module → symbol) but never the *population*: consumers were enumerated from files **outside**
`framework/shared`, so the package's own internal imports — which become cross-package crossings on the day
of the split — were never measured at all. §4.8 runs the intra-package import graph against the §4
destination map. Two classes of defect only that pass can see: the edges Ruling 1 exists for, and the two
edges that must be **removed** rather than permitted (§3 D1's second act, and B3's `domain-model` →
`credential-access`).

---

## 0. What this work package is for

`reach: everyone` is the one permission the governance model grants unconditionally, and `framework/shared`
is the only target that holds it. That grant was made to a substrate of types, errors and formatting. It
now covers, silently, an agent-harness protocol, an HTTP middleware stack, a credential cipher, a markdown
toolchain and a filesystem-mount seam — not because anyone decided those should be reachable from the web
UI, but because of where the files sit.

The deliverable is therefore **a set of audience decisions**, one per new package, each with a reason that
survives being written down. Splitting the files is the mechanical part. §3 and §4 are the actual work.

**Value:** after this ships, "who may reach this" is eighteen deliberate answers instead of one blanket,
and **exactly one** of them is `everyone`. Two model changes ship with it: a framework package may name
another framework package (Ruling 1, scoped to `framework/<name>` targets), and a framework package with no
declared audience fails the lint whether or not anything imports it (§7.4). A module that wants universal reach has to earn it in a diff
review, and `shared` stops being the path of least resistance for exactly the code that most needs a
boundary.

---

## 1. Current behaviour, measured

Everything in this section was measured on the live worktree at `0791c4fd`, not read from `plan.md`.

### 1.1 Method

Symbol-level reachability: the barrel `framework/shared/src/index.ts` and the five declared subpaths were
parsed with the TypeScript compiler, every re-export followed to the module that actually declares the
name, and every `import`/`export … from` statement in every tracked `.ts`/`.tsx` file outside
`framework/shared/` resolved against that map. Consumers were bucketed into the production and development
worlds by `CLAUDE.md`'s file rule and attributed to their workspace package by the same last-path-segment
rule the census uses (`scripts/lib/repo-census.ts:521`).

That index is what §4's `reach` lists, §4.7's audit, §2's Cut B and §1.3's export census are all computed
from. **The unit is the exported name**, so a name that changes package independently of its module is
tracked correctly.

`npm run knip:production` was run and is **clean (exit 0, zero unused files)**.

The web bundle was built (`npm run build`, then re-run with `--sourcemap`) and its module graph read out of
the sourcemap `sources` array — not inferred from the minified text, where package names do not survive.

### 1.2 What is actually in the package

| | `plan.md` | live | note |
|---|---|---|---|
| production source modules | 92 | **95** | AU29 moved `agent-scaffold`, `like-escape`, `profiles`, `system-prompt-templates` **in** from `framework/db`, and moved `observability/dispatcher` **out** to `layers/core-api/src/observability/dispatcher.ts` |
| barrel export statements | 89 | **95** | `src/index.ts`, 756 lines |
| declared subpaths | 5 | 5 | `/crypto` `/git` `/http` `/net` `/observability` |
| exported names on the public surface | — | **640** | across the barrel and the five subpaths — see §1.3 |
| modules reached from outside | 81 of 92 | **79 of 95** | of the 16 unreached: 6 are barrels, 9 are package-internal, **1 is dead** |
| consumer import sites | ~1,149 | **771** | derived below |
| named-symbol bindings | — | **1,707** | the number `1,149` matches neither live figure |
| packages that import it | — | **30** | 28 in production, 25 in development |
| packages that declare it in a manifest | — | **31** | including its own |
| development files inside the package | — | **86** | 85 under `src/__tests__` and `src/*/__tests__`, plus `src/harness/__testing__/mock-harness-adapter.ts` |

**The 771, derived** so it can be re-run and diffed rather than trusted: 726 static specifier occurrences,
which decompose as **382 production `import` + 336 development `import` + 8 production `export … from`**,
plus **45** occurrences of `import("@hyperidle/shared").Symbol`.

Those 45 split two ways, and the earlier draft got both wrong. **29 are TypeScript import-type positions**
(`import("@hyperidle/shared").Symbol` in a type slot, erased at build); **16 are genuine runtime
`await import("@hyperidle/shared")` calls, and every one is in a development file** — e.g.
`framework/design-system/src/__tests__/AM5-compose-artifact-body.test.tsx:179,190,200`,
`layers/core-api/src/__tests__/explicit-session-start.production.integration.test.ts:23,195,234`,
`layers/core-api/src/services/__tests__/model-gateway-package-dissolved.test.ts:26`. No production file
performs a runtime import of the barrel. Of the import-type positions: **18 occurrences across 9 production files** —
`layers/core-ui/src/shell/TaskSheet.tsx:47,50`, `layers/core-ui/src/pages/Conversations.tsx:180,196,202`,
`layers/core-ui/src/pages/review/ReviewCodeDiff.tsx:41,385,392`, `layers/core-api/src/app.ts:52,178,188,189`,
`layers/core-api/src/routes/threads.ts:946,1353`, `layers/core-api/src/services/policy-bindings.ts:86`,
`layers/agent-orchestration/run-orchestration/src/contracts.ts:252,257`,
`layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts:296` — and the rest in development files.
The names they take land on `domain-model`, `conversation-parts`, `filesystem-contract` and
`work-intent-port`, and every consuming package is already in the relevant list, so **no reach list changes
because of them**. They are counted as import sites because they carry a specifier that must be rewritten.

An independent count that excludes `export … from`, or `.tsx`, or the tooling role, will land lower; the
decomposition is given so the difference is locatable instead of arguable. The 1,707 binding count
reproduces independently.

Most-reached modules, by count of distinct production packages — every one lower than `plan.md`'s figure,
because AU29 pruned consumers:

| module | live | `plan.md` |
|---|---|---|
| `events.ts` | 14 | 15 |
| `event-bus.ts` | 13 | 15 |
| `types.ts` | 11 | 13 |
| `agent-work-intent-recorder.ts` | 8 | 9 |
| `logger.ts` | 8 | 8 |
| `model-gateway.ts` | 8 | 10 |

The directory counts in `plan.md` hold: `harness` 8 modules + barrel / 10 consumer packages; `http` 7 + barrel
/ 4 consumers, all server-side; `blocks` 6 + barrel / 3 consumers; `observability` 3 + barrel / 1 consumer;
`kinds` 9 modules, 2 of them reached externally; `crypto` 1 module / **5** consumers (`plan.md` says 6).

### 1.3 Dead modules, and the dead-export census

`plan.md` flags eleven modules as reached by nothing outside the package and asks whether they are dead.
`knip:production` **cannot answer this question**: the barrel re-exports every one of them, so in the
production graph every module is reachable from an entry point and knip reports zero unused files. The
answer had to come from the symbol-level pass above.

Result: **one of the eleven is dead. The other ten are package-internal and live.**

| module | verdict | evidence |
|---|---|---|
| `format/money.ts` | **DEAD — delete** | `formatMoney` / `formatTokenCount` have zero importers anywhere in the repo except `framework/shared/src/__tests__/money.test.ts`. Nothing inside the package imports the module either. |
| `blocks/slug.ts` | internal, live | imported by `blocks/derive-blocks.ts:24` and `blocks/normalise.ts:7` |
| `kinds/code.ts` … `kinds/url.ts` (6) | internal, live | each imported by `kinds/registry.ts` |
| `kinds/kind-definition.ts` | internal, live | imported by all six kind modules |
| `observability/events.ts` | **externally reached** | `layers/core-api/src/observability/dispatcher.ts` — AU29 gave it an external consumer, so `plan.md`'s "unreached" is now false |
| `toon-errors.ts` | internal, live | imported by `toon-codec.ts:1`, thrown at four sites |

**The export census, and the withdrawal of an exhaustiveness claim.** §9 defines dead as an export reachable
from no production file outside its own package. Applied to the whole public surface that definition bites
far harder than the earlier draft admitted: **640 exported names; 248 with no production consumer outside
the package; 231 with no consumer in either world** (verified zero-reference examples include
`KNOWLEDGE_SCOPES`, `REVERSIBILITY`, `PART_KINDS`, `moneyToWire`, `zeroMoney`, `canonicalJson`,
`sanitizeHttpUrl`, `assertUrlNotSSRF`, `AgentScaffoldRequest`, `ApiErrorCode`). An independent count landed
at 602/230/211; the difference is in how a name published from two entry points is counted, and both refute
the earlier claim by two orders of magnitude.

**`plan.md:41` puts export pruning on the merits out of scope, so the deletion set does not grow.** What
this work package deletes is the set **the split forces a decision on** — a name that must be assigned to a
destination package, and has no consumer to assign it for:

| export | why the split forces it |
|---|---|
| `formatMoney`, `formatTokenCount` | their module is deleted |
| `slug` | `block-derivation`'s only public name with no importer |
| `codeKind`, `codePreviewSchema` | reached only by a `design-system` test |
| `KindDefinition`, `OldKindMapping` | reached by nothing |
| `ToonParseError` | reached only by the package's own test |
| `EventBusAdapter` | a port (§3 D3) with zero importers in either world — it would otherwise have to be placed |
| `UnsupportedAgentProviderError` | reached only by tests. The class is **not** deleted — it moves to `framework/credential-access` with `resolveProvider`, its only throw site (§4.4), and is simply absent from that package's public surface |

Ten names. **This set is not exhaustive and is not offered as evidence for AC-5** — §5.1 states what AC-5
is actually satisfied by.

`EMPTY_SLUG_SENTINEL` and `ROOT_OUTLINE_SENTINEL` are **not** on the public surface and never were —
`blocks` is not a declared subpath, so `blocks/index.ts:5` exports them only within the package. They need
no decision.

Ten test consequences must be paid rather than worked around — four here, and the six in §4.6 that follow
from deleting a re-export:
`framework/design-system/src/__tests__/AM5-compose-artifact-body.test.tsx:179,190` (takes `codePreviewSchema`
and `codeKind`); `layers/core-api/src/services/__tests__/model-gateway-package-dissolved.test.ts:28` (asserts
`UnsupportedAgentProviderError` is on the barrel); and
`layers/agent-execution/harness-registry/src/__tests__/{return-gate,return-status-tool}.test.ts` (namespace
imports of a package that will not exist).

### 1.4 The browser-bundle claim — measured, and partly wrong

`plan.md` asserts "a markdown toolchain and an HTTP framework sit in the dependency closure of every package
that names `shared` — including the browser bundle." Measured against a real production build
(2,205,802 bytes raw / 633.81 kB gzip, 692 source modules, 34 of `shared`'s modules present):

- **`hono` is NOT in the browser bundle.** Zero `hono` and zero `@hono/zod-validator` modules appear in the
  sourcemap. The `/http` subpath is deliberately never value-re-exported from the barrel
  (`framework/shared/src/http/index.ts` header, AU26 A1), so rolldown drops it. The claim is true at the
  **manifest** level — 31 manifests declare an HTTP framework most of them never use — and false at the
  **bundle** level. Both are worth fixing; only one is what the plan says.
- **The markdown toolchain IS in the browser bundle** — `remark-parse`, `remark-gfm`, `unified`,
  `github-slugger` and ~100 `micromark-*`/`mdast-*` modules — but **because `layers/core-ui` production code
  genuinely calls `deriveBlocks`.** Splitting `block-derivation` out will **not** shrink the web bundle. It
  removes the parser from the closure of the other packages. Validation scenario 3 ("the markdown toolchain
  is absent unless a package that genuinely renders markdown is in the graph") is satisfied by that reading
  and by no other; nobody should expect the web bundle to get smaller.
- **`@noble/hashes` is in the browser bundle via `blocks/`, not via the credential cipher.** The only two
  importers in the whole package are `blocks/block-id.ts:6-7` and `blocks/derive-blocks.ts:16-17`.
  `crypto/credential-encryption.ts` uses `node:crypto`, not `@noble/hashes`. The hash library therefore
  follows the block toolchain, not the cipher.
- **Four pieces of substrate over-reach the split removes, none of them named in the plan.** Three are build
  warnings the web build prints today:

  > Module `"node:fs"` has been externalized for browser compatibility, imported by `framework/shared/src/system-prompt-templates.ts`
  > Module `"node:path"` has been externalized … imported by `framework/shared/src/system-prompt-templates.ts`
  > Module `"node:crypto"` has been externalized … imported by `framework/shared/src/tool.ts`

  Both modules are value-exported from the universal barrel, so the browser's module graph reaches code that
  reads the filesystem and code that hashes with a Node built-in. Rolldown externalizes the built-ins and
  tree-shakes the bodies out of the final chunk, so nothing breaks — today.

  The fourth leaves no warning and is only visible in the sourcemap:
  **`framework/shared/src/harness/harness-event-normalization.ts` is in the shipped browser bundle with zero
  `core-ui` and zero `design-system` consumers.** It rides in purely as a value re-export from the universal
  barrel (`index.ts:360`). Its only production consumer is `harness-registry`. That is the harness protocol,
  in the web bundle, because of where the file sits — the exact defect `plan.md:5` describes, present in
  shipped output.

  **The disappearance of the three warnings, and of `harness-event-normalization` from the bundle's module
  list, is the cheapest available proof that the substrate stopped over-reaching.**

Out of scope but recorded because it will confuse the next reader of the bundle: the browser carries **two**
markdown stacks — `remark`/`micromark` via `shared/blocks`, and `markdown-it` + `tiptap-markdown` via
`core-ui`'s editor. Consolidating them is not this work package.

### 1.5 The AU29 dependency, half-discharged

`plan.md` names two files AU29 would take off the event bus and out of the framework role.
`observability/dispatcher.ts` **did** move (`layers/core-api/src/observability/dispatcher.ts`; the reason is
recorded in `framework/shared/src/observability/index.ts`). `agent-run-admission.ts` **did not** — it is
still at `framework/shared/src/agent-run-admission.ts`.

This does not block. The file is 32 lines holding two type guards over the closed kind list in `events.ts`,
it touches no bus, and §4 places it beside that list. No file is placed twice.

---

## 2. The two cuts, done independently

`plan.md:28` requires the package set be designed twice before reconciling. Both passes were made over the
same 95-module inventory. Neither is the answer; §3 is.

### Cut A — grouped by what the code *is*

| group | what it holds |
|---|---|
| vocabulary | closed sets, wire shapes, and the pure predicates over them |
| protocol | an interface two processes or two layers agree on |
| transport | the things that move a message: the bus, the HTTP middleware |
| encoding | bytes ↔ structures: markdown→blocks, TOON, the cipher, query-pattern escaping |
| formatting | a value → the string a human reads |
| platform | the modules that touch the host OS |
| diagnostics | the logger, the scrubber, the observability sink |
| derivation | pure computation over vocabulary |

Cut A's own failure, found while making it: **derivation does not separate from vocabulary.** `deriveHealthLevel`
belongs beside `AgentRunSummary`; `canTransitionTaskState` beside `TASK_STATES`. A "derivations" package would
be named for a verb and would depend on every vocabulary there is. Cut A's honest form keeps a noun and the
pure functions over it together, and splits a derivation out only when it drags a dependency with it — which
is exactly what `blocks/derive-*` does, and nothing else does.

### Cut B — grouped by who reaches it, computed

Cut B is a **computation over the §1.1 index**, not a judgement. Classes are applied in order, first match
wins, so they are disjoint and total over all 95 modules. `INTERFACE = {core-ui, design-system}`;
`AGENT_RUNTIME` = every package under `layers/agent-execution/` or `layers/agent-orchestration/`, plus
`remote-worker`. Only **production** consumers classify; the development world relaxes every rule that is
not a one-door surface, so a dev-only consumer cannot decide an audience.

| class | definition | count | modules |
|---|---|---|---|
| **unreached** | no production consumer outside the package | **16** | the 6 barrels · `format/money` · `blocks/slug` · `toon-errors` · `kinds/{kind-definition,code,data,html,image,text,url}` |
| **interface-only** | every production consumer is in `INTERFACE` | **7** | `part` · `proposed-call` · `blocks/{block-id,derive-blocks,derive-payloads,normalise}` · `harness/derive-primary-harness` |
| **agent-runtime-only** | every production consumer is in `AGENT_RUNTIME` | **8** | `harness-port` · `harness/{enforcement-registry,harness-event-normalization,harness-events,return-actions}` · `session-request` · `agent-run-admission` · `toon-codec` |
| **server-side** | has production consumers, none in `INTERFACE` | **38** | `http/*` (7) · `logger` `redact` `observability/*` (5) · `git/git-runner` `net/ssrf` `profiles` `validate-env` (4) · `system-prompt-templates` `agent-scaffold` `factory-roster` (3) · `tool` `builtin-tool-catalog` (2) · `harness/{harness-adapter,harness-capability-read-model,worker-protocol}` (3) · `event-bus` · `crypto/credential-encryption` · `filesystem` · `agent-work-intent-recorder` · `cron` · `like-escape` · `initials` · `api-types` · `auth` · `configuration` · `trigger` · `task-transition` · `artifact-preview` · `kinds/old-kind-map` |
| **universal** | reached by an `INTERFACE` package **and** by at least one other | **26** | `types` `knowledge` `team` `routine` `notifications` `connection` `credential` `errors` `events` `hint` `mention` `thread` `agent-roles` `agent-profile` `agent-behavior-config` `agent-run-view` `session-activity` `model-gateway` `blocks/types` `types/money` `types/artifact` `kinds/registry` · `harness/harness-capability-descriptor` · `format/bet` `format/time` `scope-labels` |

Cut B's own failures, and they are why it is not the answer:

1. **It cannot classify sixteen modules at all.** A cut by who-reaches-it has nothing to say about a module
   nobody reaches. §1.3 has to answer those, and it answers them by content and by internal reachability —
   Cut A's ground, not Cut B's.
2. **It names packages after their audience.** "The 38 things no interface package reaches" is a query, not a
   package. Cut B produces correct boundaries and no names.
3. **It is blind to a symbol that moves on its own.** Cut B's unit is the module, so it classifies
   `model-gateway` as universal and `credential` as universal, and cannot see that a port inside each has an
   audience of two. D3 is a Cut A finding that Cut B is structurally incapable of making.
4. **It disagrees with the answer in five places, and §3 adjudicates each.** Cut B's universal class is 26;
   `domain-model` ends at 39 source modules. The 13 that differ are D4, D9, D10, D11 and the seven internal
   `kinds/*` modules, each resolved on a stated ground below.

---

## 3. Reconciliation — where the two cuts disagreed, and what was decided

**D1 — `harness/` is one thing by kind and two things by audience.** Cut A puts all eight harness modules in
one protocol package. Cut B splits them: `harness-capability-descriptor.ts` and `derive-primary-harness.ts`
are reached by `core-ui`; the adapter, the worker protocol, the event normalizer, the return-action set, the
enforcement registry and the capability read-model are reached by nothing in the interface.
**Decided: Cut B. Two packages.** A screen renders *what a harness is and whether it is ready*; it never
speaks *how a run is dispatched to one*. This is the decision `plan.md:13` names as the actual work.
`core-ui`'s seven consuming files are `settings/SettingsHarnesses.tsx`, `settings/SettingsAgents.tsx`,
`settings/AgentEditor.tsx`, `settings/model-options-for-harness.ts`, `settings/harness-presentation.ts`,
`pages/SetupFlow.tsx` — and `components/SessionView.tsx`, which is a conversation surface, not a settings
screen. That widens the framing rather than narrowing it: the descriptor is not "a settings shape", it is
the shape any surface uses to say which harness a run is on.
**Cost, paid in this work package, and it moves a symbol on its own:** `harness-adapter.ts` and
`harness-capability-descriptor.ts` import each other today. The only edge is
`HarnessCapabilityDescriptor.returnEnforcement?: HarnessCapabilities["returnEnforcement"]`
(`harness-capability-descriptor.ts:111`). **Breaking it takes two acts, and stating only the first produces
a cyclic graph and a red `check`:**

1. `ReturnEnforcementChannel` — a seven-member closed set declared at `harness-adapter.ts:223` — moves to
   `harness-capability`, and the adapter imports it back.
2. **`harness-capability-descriptor.ts:111` is rewritten to name `ReturnEnforcementChannel` directly, and
   the `HarnessCapabilities` import at `:3` is deleted.** Act 1 alone does not remove the edge:
   `HarnessCapabilities` stays in `harness-protocol` (§4.4), so the descriptor still imports it and
   `harness-capability → harness-protocol → harness-capability` remains a cycle. §4.8 measures both states —
   with act 1 only, the graph has that cycle; with both acts it is acyclic. **The symbol-level derivation shows what a module-level one hides:
`ReturnEnforcementChannel` has three production importers —
`harness-registry/src/provision-harness-environment.ts:1`, `harness-registry/src/cli-harness-adapter.ts:25`,
and `run-orchestration/src/provisioner.ts:26`, plus a fourth at
`harness-registry/src/provision-return-hook.ts:40` that the `export … from` scan cannot see (§4.6) — so
`run-orchestration` is in `harness-capability`'s audience purely because of this relocation.** It is in the list (§4.2). Rejected alternative: park the symbol in
`domain-model`, where the reach question disappears — that dodges one name by granting the whole repo reach
to a harness enforcement vocabulary, which is the defect being fixed.

**D2 — `events.ts` and `event-bus.ts` are the same kind and different audiences.** Cut A calls both transport.
Measured: `events.ts` is reached by `core-ui` and `design-system`; `event-bus.ts` is reached by neither, in any
world.
**Decided: Cut B. Two packages.** The event *union* is vocabulary the interface names when it types a handler;
the bus is an in-process object a browser does not have. Splitting them also takes `logger.ts` out of the
interface's closure, since `event-bus.ts:8` is the only thing that pulled it there.

**D3 — ports were sitting inside the universal package, and the test that finds them had to be sharpened.**
The earlier draft's scan looked for method-bearing exported interfaces. That criterion and the written
definition of a port were not the same test: `EventHandler` and `WildcardHandler` (`events.ts`) are exported
*function types* a subscriber implements and the bus receives, so they satisfied the definition while
escaping the scan. **The definition is sharpened so the two agree, and so it does the work it is for:**

> A **port** is an exported interface or function type that names a **capability the holder can invoke on
> someone else's behalf**, supplied across a package boundary by someone other than its owner. A port in the
> universal package advertises that capability to everyone. A callback the caller hands in, and a record
> with function members, are argument shapes, not seams.

Applied to `domain-model`'s 39 modules, that test finds:

- **`EventBusAdapter`** (`events.ts:660`, `publish`/`subscribe`/`unsubscribe`, the deferred Redis adapter) —
  a port by the test, and **zero importers anywhere in the repo, in either world**. It is not a port that
  must move; it is a dead export. Deleted (§1.3).
- **`CredentialResolver`** (`credential.ts:84`) — a port: it fetches a secret on the caller's behalf, and
  `core-api/credentials` implements it (`credential-resolver.ts`) while `harness-registry` receives it
  (`cli-harness-adapter.ts`). Two production importers, not thirty. **It leaves `domain-model`.** And because
  `model-gateway.ts`'s `resolveModel` (`:222`, `:298`, `:330`) takes that port as a parameter, `resolveModel`
  is port-carrying too and leaves with it — its only production importer is `remote-server`.
- **`EventHandler`, `WildcardHandler`** — not ports: the bus calls them back, they invoke nothing on anyone's
  behalf. They stay in `domain-model`, and they stay on its public surface because
  `framework/event-bus` — a different package after the split — consumes them.
- **`KindDefinition`** (`kinds/kind-definition.ts`) — not a port: a record with function members, held by
  nothing outside its own package (§1.3).

Both moved names land in `framework/credential-access` (§4.2) — `credential-cipher` renamed to say what it
now holds: everything that needs a live secret. `credential.ts` and `model-gateway.ts` are therefore **split
symbol-by-symbol, not by an adjectival half** — §4.4 gives the full list, because "the catalog half" does not
tell a builder where `ResolvedModel` goes.

**And the exported-name unit has its own blind spot, which §4.8's sweep closes.** `resolveModel` is not the
only consumer of `CredentialResolver` inside `model-gateway.ts`: two **non-exported** helpers take it too —
`resolveProvider` (`:219-222`) and `resolveModelTier` (`:295-298`) — and `UnsupportedAgentProviderError` is
thrown at `:263`, inside `resolveProvider`. A table keyed on exported names has no cell for any of them. Left
where they are, `domain-model` imports `credential-access`: forbidden before Ruling 1, *permitted* after it,
and wrong either way — it inverts the audience order D4 declares binding, so a universal package would carry
a narrow one in its closure. **Decided: the two private helpers move with `resolveModel`.** `model-gateway.ts`
splits into two files — the catalog and config stay in `domain-model`; `resolveModel`, `resolveProvider`,
`resolveModelTier` and `UnsupportedAgentProviderError` form `credential-access`'s resolver module. The
`domain-model → credential-access` edge disappears rather than being permitted.

The sweep found no other case: `ReturnEnforcementChannel`'s only residual use is
`harness-adapter.ts:267`, which is the import-back act 1 already provides for, and `credential.ts`'s
remaining mention of `CredentialResolver` is prose in a doc comment (`:76`).

**D4 — `session-request.ts` is agent-runtime-only by audience and universal by graph.** `events.ts:1` imports
it, `trigger.ts` imports it, and `events.ts` is universal.
**Decided: the graph wins. It goes in `domain-model`.** The alternative is a universal package that depends on
a narrower one, which inverts the audience order.

**D5 — `filesystem.ts` mixes a noun and ports.** Cut A calls the closed sets vocabulary and
`FilesystemMounter`/`FilesystemAuthResolver` ports. Cut B measures one audience — five packages, never the
interface.
**Decided: one package, `filesystem-contract`, at that measured audience.** D3's rule sends ports out of the
universal package; here the whole module is already outside it, so no split is needed.

**D6 — `part.ts` has exactly one consumer.** Cut B classifies it interface-only, and the measurement is
`layers/core-ui` and nothing else. It also imports `harness-capability-descriptor.ts`.
**Decided: its own framework package, `conversation-parts`, reach `["core-ui"]`** — the same shape and reason
as the existing `framework/design-system` entry. Rejected: relocating it into `layers/core-ui`, which puts it
outside the framework role AC-1 names.

**D7 — `git-runner`, `ssrf`, `validate-env` and `profiles` are four kinds and one audience.**
**Decided: one package, `host-process`.** Four single-module packages is ceremony. The name states the fact
they share and Cut A missed: these are the only modules in the substrate that touch the host OS.

**D8 — `builtin-tool-catalog.ts` reads as vocabulary and is reached like a protocol** (one service).
**Decided: it goes in `tool-protocol`, beside `tool.ts`.**

**D9 — `agent-run-admission.ts` is agent-runtime-only by audience and vocabulary by content.**
**Decided: `domain-model`, beside `events.ts`, renamed `agent-work-intent-kinds.ts`.** A predicate over a
closed set is part of the set.

**D10 — `proposed-call.ts` is interface-only by audience and load-bearing for two protocols by graph.**
`harness-adapter.ts:4`, `tool.ts` and `builtin-tool-catalog.ts` all import `Reversibility` from it.
**Decided: the graph wins, as in D4. It stays in `domain-model`.**

**D11 — `presentation-format` cannot hold `everyone`, and cannot hold a role grant either.**
The first draft granted it `everyone` on `eslint.config.ts:642-699`; that rule's `files` key
(`eslint.config.ts:652`) covers only `core-ui` and `design-system` — evidence for three packages, not thirty.
The second draft fell back to `["core-ui","design-system","core-api","service"]`.
**Decided: the `service` grant is withdrawn too.** §4.5 states the test a role grant must pass, and
`presentation-format` fails it: exactly one service formats anything. `reach` permits, it does not force
reuse, so "a future service should use the one formatter" is a prediction, not a rule about the role.
Final: `["core-ui","design-system","core-api"]`. **`framework/domain-model` is the only package in the repo
with `reach: everyone`.**

**D12 — `like-escape.ts` cannot go into `framework/db`, and cannot be named after its file.**
`like-escape.ts:20-24` carries an AU29 `@lore` stating the function touches no database, and
`governance/decided-rules.json:3` records AU29 deleting the `db:util`/`db:bootstrap` rows under **Ruling
12.3**. A `db:query-text` surface would re-create the deleted anomaly under a new name, on this artifact's
say-so. **Withdrawn.** But `framework/like-escape` names the file it sits in today, which `plan.md:23` rules
out as "just renaming the problem".
**Decided: `framework/query-escaping`** — the concept is turning user text into a literal that a query
engine cannot read as syntax. `escapeLikePattern` is the one instance of it today; a second escaper belongs
in the same package, which is the test a concept name has to pass and a function name cannot. Rejected:
`domain-model` (over-grants `everyone` to something four packages use); relocating into `layers/core-api`
(its three other consumers are that layer's services, and `service → layer (own)` is a decided verdict for
`di` only, not for `import`).

**D13 — narrowing the surfaces turns five production re-exports into build errors, and each needs a decision.
A sixth republication exists in a spelling the rule cannot see.**
See §4.6. Cut A and Cut B both miss this entirely: it is not a property of a module or of an audience, but of
the *act of republishing* one. It only appears once the surfaces are narrower than `everyone`.

**Agreements worth recording** (both cuts landed in the same place): `credential.ts`'s catalog (universal) vs
the cipher (six named packages); `blocks/types.ts` (the Block shape, universal) vs `blocks/derive-*` (the
parser, two named packages); `system-prompt-templates.ts` and `tool.ts` are not universal — and here the two
cuts agree with a build warning (§1.4) rather than with each other.

---

## 4. The package set — the deliverable

Eighteen new framework packages. Every one of the 95 modules is placed or deleted; the totals reconcile in
§4.3, the two symbol-level splits are itemised in §4.4, and §4.7 is the derivation audit for every list.

`reach` values are the vocabulary the model already speaks (`scripts/lib/governance-model.ts:166-171`):
`everyone`, a **role** name, or a **package** short name — the last path segment, which is how the existing
`framework/design-system: ["core-ui"]` entry is written. There is no layer-inheritance in `inAudience`:
naming `agent-execution` does **not** admit `harness-registry`. A layer appears in a list only when the
layer's own source imports the package.

**Under Ruling 1, a `reach` list names who may reach the package from OUTSIDE the framework role.** A
framework package naming another is allowed as a property of the model, so no list below carries a sibling
framework package — and none does: every name in §4.7 is a layer, a service or an application. §4.8 reports
the edges this covers.

**Development-only consumers do not appear in any list.** The development world relaxes every production rule
except the one-door surfaces (`governance/README.md:60-69`), and §7.3 adds none. Each is recorded in §4.7.

### 4.1 The one successor of `shared` that keeps `everyone`

**`framework/domain-model`** — the product's nouns: the closed sets, the wire shapes, and the pure predicates
over them. 39 source modules (two of them split — §4.4). Manifest: `zod`.

> `reach: everyone` — **the only successor of `shared` that keeps it.** (`architecture.json` will still hold
> `everyone` on `framework/db`, `db:client` and `db:row-type`, so the file carries four such grants after
> AU34, not one. The claim this work package can make, and AC-3 can be checked against, is the narrower one:
> of the eighteen packages `shared` becomes, exactly one is universal.) **Why:** these are the names the whole system uses for the same things — a task state,
> a bet status, a knowledge scope, a thread, a team, a model in the catalog. Nothing here has behaviour beyond
> a predicate over its own closed set, **nothing here declares a port** (D3, verified by the sharpened scan),
> and nothing here carries a dependency a browser cannot run — it imports `zod` and no `node:` builtin. This
> is the same reason the model already grants `everyone` to `db:row-type`: a shape is not an access path.
> **Measured: 25 packages import it in production, covering every production role in the model — `layer`
> (`core-api`, `core-ui`, `agent-execution`, `agent-orchestration`), `service` (**17 of 19** — every one
> except `filesystems` and `filesystem-mounting`), `framework`
> (`db`, `design-system`) and `application` (`desktop`, `remote-server`).** The four packages that do not
> (`remote-worker`, `filesystems`, `filesystem-mounting`, `api-contract`) are an accident of what they happen to need, not a
> boundary anyone drew — the fourth is `framework/api-contract`, which imports nothing from `shared` today.
> `tooling` is not cited: `eval` and `setup` reach it in development only, which is
> exactly the evidence §4.7 refuses to grant on.

`types.ts` · `knowledge.ts` · `team.ts` · `routine.ts` · `notifications.ts` · `connection.ts` · `credential.ts` ·
`configuration.ts` · `hint.ts` · `proposed-call.ts` · `trigger.ts` · `auth.ts` · `api-types.ts` · `errors.ts` ·
`agent-roles.ts` · `agent-profile.ts` · `agent-behavior-config.ts` · `agent-run-view.ts` · `session-activity.ts` ·
`session-request.ts` · `task-transition.ts` · `thread.ts` · `mention.ts` · `blocks/types.ts` · `types/money.ts` ·
`types/artifact.ts` · `kinds/kind-definition.ts` · `kinds/{code,data,html,image,text,url}.ts` · `kinds/registry.ts` ·
`kinds/old-kind-map.ts` · `artifact-preview.ts` · `model-gateway.ts` *(see §4.4)* · `events.ts` ·
`agent-run-admission.ts → agent-work-intent-kinds.ts`

### 4.2 The seventeen packages with a named audience

**`framework/presentation-format`** — a value turned into the string a human reads. 4 modules. No dependencies.
`reach: ["core-ui", "core-api"]`
> **Measured, exactly.** Three packages format anything: the interface, the design system, and the one layer
> that composes a user-visible string on the server. `design-system` is a framework package, so under Ruling 1
> it reaches this without an entry — a `reach` list names who may reach from outside the framework role.
> **Not `everyone`** — the `eslint.config.ts:642-699` evidence covers only two of them. **No `service`
> grant** — exactly one service formats, which fails the test in §4.5 (D11).

`format/bet.ts` · `format/time.ts` · `initials.ts` · `scope-labels.ts`

**`framework/harness-capability`** — what an installed harness *is*: its readiness, the models it offers, the
tools it already has, the auth action it needs, and how its return enforcement is provisioned. 2 modules + the
relocated `ReturnEnforcementChannel`. No dependencies.
`reach: ["core-ui", "core-api", "harness-registry", "connections", "run-orchestration"]`
> **Measured at the symbol level, exactly.** `harness-registry` produces the descriptor, `core-api` and
> `connections` serve it, `core-ui` renders it on seven surfaces (D1) — and **`run-orchestration` is here
> because of the `ReturnEnforcementChannel` relocation**, at `run-orchestration/src/provisioner.ts:26`. A
> module-level derivation attributes that import to `harness-protocol`, where the symbol used to live, and
> the resulting list fails `reach-declared-surfaces-only` on a legal import. This is the half of `harness/` a
> screen legitimately names — and separating it is what lets the other half say no to the interface.
> `agent-run-config` reaches it in development only.

`harness/harness-capability-descriptor.ts` · `harness/derive-primary-harness.ts` · `ReturnEnforcementChannel`

**`framework/harness-protocol`** — how a run is dispatched to a harness and how its output comes back: the
adapter interface, the event stream, the worker wire protocol, the return-action set, the capability
read-model, the cross-process port. 8 modules, less `ReturnEnforcementChannel`. No dependencies.
`reach: ["harness-registry", "agent-orchestration", "run-orchestration", "session-requests", "agent-run-config", "core-api", "remote-worker"]`
> **Measured, exactly.** A contract between a harness process, the layer that runs it, and the worker that
> hosts it. The web UI is not one of those; `harness-event-normalization.ts` is in the browser bundle today
> only because the barrel put it there (§1.4). `core-api` is in the list because it hosts `/api/workers` and
> the run-orchestration composition — a live architectural question the audience records rather than hides.
> `agent-run-config` is here because `agent-run-config/src/validate-agent-config.ts` imports
> `HarnessCapabilityReader` and `harnessRegistrationMeta` from `harness-capability-read-model.ts`, which
> lives here and not in `harness-capability`. The `agent-execution` layer itself imports nothing; its service
> does.

`harness/harness-adapter.ts` · `harness/harness-events.ts` · `harness/harness-event-normalization.ts` ·
`harness/return-actions.ts` · `harness/enforcement-registry.ts` · `harness/worker-protocol.ts` ·
`harness/harness-capability-read-model.ts` · `harness-port.ts`

**`framework/tool-protocol`** — the descriptor/dispatch contract the tool provider and the tool handlers agree
on, and the catalog of built-in tools it can carry. 2 modules. Manifest: `zod`; imports `node:crypto`.
`reach: ["harness-registry", "tool-handlers", "core-api", "review", "settings"]`
> **Measured, exactly.** The two halves of tool dispatch live in different layers and must not name each other;
> this is what they name instead. It hashes with `node:crypto`, which is why the web build externalizes a Node
> built-in today (§1.4).

`tool.ts` · `builtin-tool-catalog.ts`

**`framework/work-intent-port`** — the recorder/reader seam a `core-api` route uses to write an agent work
intent into a table `agent-orchestration` owns. 1 module. No dependencies.
`reach: ["core-api", "conversation", "knowledge", "policy", "review", "routine", "work", "run-orchestration"]`
> **Measured, exactly: eight packages — `core-api` and six of its services on the writing side, and
> `run-orchestration` on the owning side.** A port exists to keep two named layers from naming each other.
> The `agent-orchestration` layer itself does not import it.

`agent-work-intent-recorder.ts`

**`framework/filesystem-contract`** — the Filesystem primitive's vocabulary and its mount, auth and capture
seams. 1 module. No dependencies.
`reach: ["core-api", "agent-orchestration", "filesystems", "filesystem-mounting", "run-orchestration"]`
> **Measured, exactly.** Mounting a sandbox is a server act. The interface renders a filesystem through the
> API's response shape; giving it the mounter interface would make a browser look like a plausible host.

`filesystem.ts`

**`framework/conversation-parts`** — the Part vocabulary and the adapters that derive Parts from messages and
session activity. 1 module. No dependencies.
`reach: ["core-ui"]`
> **Measured, exactly.** There is exactly one conversation surface. A second consumer of the Part vocabulary
> means a second conversation, which is a product decision, not an import.

`part.ts`

**`framework/block-derivation`** — markdown text turned into the block tree the renderer walks, and the
content-addressed id that keeps a block stable across edits. 5 modules.
Manifest: `remark-parse`, `remark-gfm`, `unified`, `github-slugger`, `@noble/hashes`.
`reach: ["core-ui"]`
> **Measured, exactly.** Deriving blocks means running a markdown parser and a hash. Exactly two packages
> render block content — the interface, and `design-system`, which is a framework package and reaches this
> under Ruling 1 without an entry. **This is the package whose manifest holds `remark-*`, `unified`,
> `github-slugger` and `@noble/hashes` — and the reason no other manifest does.** `core-api` reaches it in
> development only.

`blocks/block-id.ts` · `blocks/derive-blocks.ts` · `blocks/derive-payloads.ts` · `blocks/normalise.ts` ·
`blocks/slug.ts`

**`framework/event-bus`** — the in-process publish/subscribe object. 1 module. No dependencies.
`reach: ["core-api", "agent-execution", "agent-orchestration", "service", "application"]`
> **Measured: thirteen packages — all three server layers, seven `core-api` services, two
> `agent-orchestration` services (`run-orchestration`, `session-requests`), and `remote-server`.** All three
> layers import it directly, so all three are named. **Role grants (§4.5):** `service` — any service may
> publish, and half the services already do; `application` — an application composes the bus at boot, and
> both server applications are composition roots by role. A browser has no in-process bus; it has HTTP and
> SSE, and it reaches the event *types* in `domain-model`. `architecture.json`'s `eventBus.host` stays
> `framework`.

`event-bus.ts`

**`framework/http-middleware`** — the primitives a route file on either application's Hono app needs. 7 modules.
Manifest: `hono`, `@hono/zod-validator`, `zod`; imports `node:crypto`.
`reach: ["core-api", "agent-orchestration", "harness-registry", "run-orchestration"]`
> **Measured, exactly.** Only the two layers that publish an HTTP API, and the two services that mount a route
> or compare a key. **This is the package that carries `hono` — and the reason thirty other manifests stop
> carrying it.**

`http/access-boundary.ts` · `http/body-limit.ts` · `http/env.ts` · `http/explicit-start-projection.ts` ·
`http/rate-limit.ts` · `http/timing-safe.ts` · `http/validate.ts`

**`framework/diagnostics`** — the structured logger, the secret scrubber, and the observability event/adapter
contract with its console sink. 5 modules. No dependencies.
`reach: ["core-api", "service", "application"]`
> **Measured: eight packages — `core-api`, five of its services (`conversation`, `knowledge`,
> `notifications`, `routine`, `work`), `run-orchestration`, and `remote-server`.**
> **Role grants (§4.5):** `service` — a log line happens where the process is, every service runs in one, and
> six of the nineteen already log; `application` — every application installs a sink. **`layer` is deliberately not granted:**
> the rule "every layer logs" is false, because `core-ui` must not. `core-api` is enumerated instead, and the
> other two server layers earn an entry when they start logging — which is the model working as designed.

`logger.ts` · `redact.ts` · `observability/events.ts` · `observability/types.ts` · `observability/console-adapter.ts`

**`framework/host-process`** — the host as seen from a server process: spawning `git`, resolving a hostname
before we fetch it, reading the environment at boot, resolving the deployment profile. 4 modules.
Imports `node:child_process`, `node:dns`, `node:net`, `node:util`.
`reach: ["agent-orchestration", "run-orchestration", "notifications", "remote-server"]`
> **Measured, exactly.** Every module here names the operating system. `core-api` and `filesystem-mounting`
> reach it in development only — the first draft listed `filesystems`, which reaches it in neither world.

`git/git-runner.ts` · `net/ssrf.ts` · `validate-env.ts` · `profiles.ts`

**`framework/factory-defaults`** — the roster and the system-prompt templates a fresh installation is seeded
with. 3 modules. Imports `node:fs`, `node:path`.
`reach: ["core-api", "agent-orchestration", "tool-handlers"]`
> **Measured, exactly.** It reads template files off disk, so a browser cannot run it at all — which is
> exactly the `node:fs` warning the web build prints today (§1.4).

`system-prompt-templates.ts` · `agent-scaffold.ts` · `factory-roster.ts`

**`framework/credential-access`** — everything that needs a live secret: the port that resolves a credential's
value, the AES-256-GCM cipher that decrypts a stored one, and the model resolution that cannot produce a
`ResolvedModel` without one. 1 module + the relocations in §4.4. Imports `node:crypto`.
`reach: ["core-api", "credentials", "agent-orchestration", "connections", "remote-server"]`
> **Measured at the symbol level, exactly:** the cipher is reached by `core-api`, `credentials`,
> `agent-orchestration`, `connections` and `remote-server`; `CredentialResolver` by `credentials` (which
> implements it) and `remote-server` (which composes it at boot); `resolveModel` by `remote-server`. Five
> names. `harness-registry` was a sixth in the first draft, on the strength of `cli-harness-adapter.ts`
> re-exporting the port — a re-export this change deletes, leaving it importing nothing from here in
> either world, so it is not in the audience.
> Not a preemptive wall — the observation that nothing else has ever held a secret, written down so nothing
> else starts by accident.

`crypto/credential-encryption.ts` · `CredentialResolver` · `resolveModel` · `resolveProvider` ·
`resolveModelTier` · `UnsupportedAgentProviderError` *(present, but not exported from the barrel — §4.4)*

**`framework/cron`** — parsing a cron expression and computing the next run from it. 1 module. No dependencies.
`reach: ["core-api", "routine", "tool-handlers"]`
> **Measured, exactly.** The routine service owns the tick, `core-api` validates one at its route, and the
> tool handler that creates a routine parses one. The first draft also listed `agent-orchestration`, which
> imports it from no file.

`cron.ts`

**`framework/toon-codec`** — the TOON text codec and its parse error. 2 modules. No dependencies.
`reach: ["run-orchestration"]`
> **Measured, exactly.** One service encodes context bundles as TOON, and nothing else speaks the format.

`toon-codec.ts` · `toon-errors.ts`

**`framework/query-escaping`** — turning user text into a literal a query engine cannot read as syntax.
1 module. No dependencies.
`reach: ["core-api", "knowledge", "users", "work"]`
> **Measured, exactly:** the four packages that build a `LIKE` query. **Named for the concept, not the
> function** — `escapeLikePattern` is one instance of it, and a second escaper belongs in the same package
> (D12). **Why not `framework/db`:** that would re-create the `db:util` surface AU29 deleted under Ruling
> 12.3, against the module's own `@lore` at `like-escape.ts:20-24` — a reversal this artifact has no
> authority to make.

`like-escape.ts`

**Deleted.** `format/money.ts` — §1.3.

### 4.3 Every module accounted for

| destination | modules | | destination | modules |
|---|---|---|---|---|
| `framework/domain-model` | 39 | | `framework/http-middleware` | 7 |
| `framework/presentation-format` | 4 | | `framework/diagnostics` | 5 |
| `framework/harness-capability` | 2 | | `framework/host-process` | 4 |
| `framework/harness-protocol` | 8 | | `framework/factory-defaults` | 3 |
| `framework/tool-protocol` | 2 | | `framework/credential-access` | 1 |
| `framework/work-intent-port` | 1 | | `framework/cron` | 1 |
| `framework/filesystem-contract` | 1 | | `framework/toon-codec` | 2 |
| `framework/conversation-parts` | 1 | | `framework/query-escaping` | 1 |
| `framework/block-derivation` | 5 | | **deleted** | 1 |
| `framework/event-bus` | 1 | | **barrels dissolved** | 6 |

Counted by **source module before Ruling 2's folds**: 88 placed + 1 deleted + 6 barrels = **95**. After the
folds (§4.9) the surviving counts are `domain-model` **32**, `block-derivation` **4**, `toon-codec` **1**, all
others unchanged — **79 surviving + 9 folded + 1 deleted + 6 barrels = 95**.

One cell needs a note rather than a number: **`credential-access` holds two files after the split, not one.**
`model-gateway.ts` divides (§4.4) and its resolver half becomes a new module beside
`crypto/credential-encryption.ts`. Nothing is misplaced and no source module is double-counted — the table
counts source modules, and a module that divides is still one source module.

### 4.4 The three symbol relocations, itemised

A destination given as "the catalog half" does not tell a builder where `ResolvedModel` goes. Every name that
crosses a package boundary independently of its module is listed here, and §4.7's audit is computed from this
table — which is what makes the audit capable of catching this class rather than only the instances someone
happened to notice.

**`harness/harness-adapter.ts` → `harness-protocol`, except:**

| name | destination | why |
|---|---|---|
| `ReturnEnforcementChannel` | `harness-capability` | breaks the descriptor ↔ adapter cycle (D1); the adapter imports it back |

Everything else in the module — `HarnessAdapter`, `HarnessCapabilities`, `ReturnHookConfig`, `AdapterInfo`,
`AdapterMeta`, `ConversationMessage`, `McpConnectionInfo`, `SessionConfig`, `SessionHandle`, `SessionMetrics`,
`SessionResult`, `SessionWorkflow` — stays in `harness-protocol`.

**`credential.ts` → `domain-model`, except:**

| name | destination | why |
|---|---|---|
| `CredentialResolver` | `credential-access` | a port by the sharpened test (D3) |

Staying: `CREDENTIAL_CATALOG`, `CREDENTIAL_NAMES`, `CREDENTIAL_STATES`, `CredentialCatalogEntry`,
`CredentialName`, `CredentialState`, `isCredentialName`.

**`model-gateway.ts` → `domain-model`, except:**

| name | destination | why |
|---|---|---|
| `resolveModel` | `credential-access` | takes a `CredentialResolver` (`:330`) |
| `resolveProvider` *(not exported)* | `credential-access` | takes a `CredentialResolver` (`:219-222`); leaving it behind makes `domain-model` import `credential-access` (D3) |
| `resolveModelTier` *(not exported)* | `credential-access` | takes a `CredentialResolver` (`:295-298`); same |
| `UnsupportedAgentProviderError` | `credential-access`, **not exported from its barrel** | thrown at `:263` inside `resolveProvider`, which moves with it; no production importer (§1.3) |

The last row resolves a contradiction two earlier drafts carried: §1.3 said the class "stays and is thrown
internally", §4.4 sent it to `credential-access`. Both are now one statement — it moves **with its only throw
site** and is absent from the new package's public surface.

Staying in `domain-model`, each with its measured production importers so the reading is checkable:
`ResolvedModel` (core-api, harness-registry, remote-server, run-orchestration) · `ModelGatewayConfig`
(core-api, routine, settings) · `MODEL_PROVIDERS` (core-api, core-ui, settings) · `ModelTierConfig`
(core-api, settings) · `MODEL_CATALOG` (harness-registry) · `ModelProvider` (core-ui) · `isCatalogModel`
(agent-run-config) · `catalogEntry`, `DEFAULT_AGENT_HARNESS`, `DEFAULT_AGENT_MODEL_ID`,
`DEFAULT_AGENT_MODEL_PROVIDER` (core-api) · `BUILT_IN_GATEWAY_CONFIG` (settings) · `ModelCatalogEntry`,
`ModelRequest` (no production importer; kept, not deleted — §1.3 does not prune on the merits).

Every one of those importers is admitted by `domain-model`'s `everyone`, so the split creates no red build.
Under the earlier "catalog + config half" wording a builder could reasonably have sent `ResolvedModel` to
`credential-access`, whose audience excludes three of its four importers.

### 4.5 When a role may be granted instead of a name

Three lists grant a **role** rather than enumerate. §9 previously exempted role grants from the "a bare name
with no consumer is a guess" rule without saying why a role differs. The test, stated so it can be applied
and failed:

> A role may be granted when the permission is **a rule about the role** — true of any member by virtue of
> what the role is — **and** a substantial share of the role already exercises it. Otherwise enumerate.

| grant | rule about the role | already exercising it | verdict |
|---|---|---|---|
The repo has **19 services, 3 applications and 4 layers**; the shares below are measured against those
denominators, not estimated.

| grant | rule about the role | already exercising it | verdict |
|---|---|---|---|
| `event-bus` → `service` | any service may publish on the bus | **9 of 19** | granted |
| `event-bus` → `application` | an application composes the bus at boot | **1 of 3** | granted — see below |
| `diagnostics` → `service` | a service runs in a process, and a process logs | **6 of 19** | granted |
| `diagnostics` → `application` | an application installs the sink | **1 of 3** | granted — see below |
| `diagnostics` → `layer` | — false: `core-ui` is a layer and must not log | 1 of 4 | **refused**, `core-api` enumerated |
| `presentation-format` → `service` | — false: `reach` permits, it does not force reuse | **0 of 19** | **refused** (D11) |

The two `application` grants are the weakest, at 1 of 3, and the earlier draft overstated them as 1 of 2 by
forgetting `remote-worker`. They still pass on the first clause, which is the load-bearing one: composing the
bus and installing the sink is what a composition root *is* — `desktop` and `remote-worker` do not do it
because of what they host, not because the permission would be wrong for them. `presentation-format` fails on
that clause too, which is why its share of **zero** only confirms a refusal already decided.

The three surviving grants admit members with no import today. That is intended and is the difference from a
bare name: the entry states a permission the role holds, not a prediction about one package.

### 4.6 The six production republications the narrowing breaks — D13

`scripts/rules/no-laundered-re-exports.ts:240-248` forbids a cross-package `export … from` a framework surface
whose reach is not `everyone`. It emits `severity: "error"` directly (`:136`), `governance/rule-severity.json`
has no key for it, and `scripts/governance-lint.ts:230` defaults an unkeyed rule to `error`. These pass today
for exactly one reason, stated in the rule's own `@lore` at `:30-33`: **re-exporting `framework/shared`
launders nothing because its reach is `everyone`.** AU34 removes that reason, and the rule fires whether or
not the re-exporting package is itself in the audience.

The symbol-level pass finds **thirteen production `export … from` bindings, in eight statements, across eight files**. Three resolve
to `domain-model` and stay legal — `framework/design-system/src/index.ts:4` (`AgentOperationalStatus`),
`layers/core-api/knowledge/src/role-community-map.ts:8` (`communityForRole`),
`layers/core-ui/src/hooks/useSessionActivity.ts:29` (`ActivityEntry`). **Five sites flip to `error`**, and
each gets a decision here rather than downstream. In every case the laundering turns out not to be
load-bearing, so **no audience is widened and no list in §4.2 changes:**

| site | names | new surface | decision |
|---|---|---|---|
| `layers/agent-execution/harness-registry/src/index.ts:1` | `AdapterInfo`, `AdapterMeta`, `HarnessAdapter` → `harness-protocol`; `HarnessCapabilityDescriptor` → `harness-capability`; `ToolRegistry` → `tool-protocol` | three | **Stop re-exporting.** Zero production importers take any of these through `@hyperidle/harness-registry`; the one consumer is a test (`core-api/src/services/__tests__/harness-capability-read-model.test.ts:17`, `AdapterMeta`), which names `harness-protocol` directly. |
| `…/harness-registry/src/adapter-pool.ts:29` | `AdapterInfo`, `AdapterMeta` → `harness-protocol` | one | **Stop re-exporting.** Same: no production importer. |
| `…/harness-registry/src/cli-harness-adapter.ts:53` | `CredentialResolver` → `credential-access` | one | **Stop re-exporting.** No downstream importer at all. |
| `layers/core-api/credentials/src/credential-resolver.ts:31` | `CredentialResolver` → `credential-access` | one | **Stop re-exporting, and repoint the two production importers**: `layers/core-api/src/app.ts:2` and `applications/remote-server/src/create-server.ts:67` currently obtain it through `@hyperidle/credentials`. Both `core-api` and `remote-server` are already in `credential-access`'s reach, so they name it directly. Two tests follow. |
| `layers/core-ui/src/utils/scope-labels.ts:22` | `scopeKindToLabel` → `presentation-format` | one | **Stop re-exporting, and repoint `layers/core-ui/src/pages/KnowledgeDetail.tsx:77`** to `@hyperidle/presentation-format`. `core-ui` is in that reach. The util keeps its own `SCOPE_CREATE_OPTIONS`/`SCOPE_PILL_OPTIONS`. |

**A sixth republication exists in a spelling the rule cannot see, and it is an omission from a set called
complete rather than a lint failure.** `layers/agent-execution/harness-registry/src/provision-return-hook.ts:40,42`
republishes `ReturnEnforcementChannel` as two statements — `import type { … } from "@hyperidle/shared"` then a
separate `export type { ReturnEnforcementChannel }`. The rule's own `@lore`
(`scripts/rules/no-laundered-re-exports.ts:52-57`) records that it does not detect this form. It will not fail
the build; it will silently keep handing a `harness-capability` name to anyone who can name
`harness-registry`. **Decided: it goes with the other four — stop republishing.** The same file is also a
**fourth production importer of `ReturnEnforcementChannel`**, which D1 now counts.

**Two undercounts corrected.** Deleting `adapter-pool.ts:29`'s re-export breaks **six same-package
development files** that reach `AdapterMeta`/`SelectRequirements` through `../adapter-pool.js` —
`AM2-harness-capability-descriptors.test.ts:3`, `AM4-adapter-pool-disabled.test.ts:28`,
`X3-adapter-pool-type.test.ts:26`, `adapter-pool-ab1.test.ts:19`, `adapter-pool-s4.test.ts:27`,
`adapter-pool.test.ts:22`. Mechanical, but §1.3's "four test consequences" undercounted; the true figure is
ten. And a statement-level count of 8 corresponds to 13 name-level bindings — another reason the unit has to
be the name.

### 4.7 Derivation audit — every name in every list, and every omission

Computed at the symbol level over the post-split map, including §4.4's relocations. `dev-only` names are
recorded and **not** granted.

| package | production consumers → the list | dev-only, not granted | role grants (§4.5) |
|---|---|---|---|
| `domain-model` | 25 packages, every production role represented | `eval`, `setup` | `everyone` |
| `presentation-format` | `core-api`, `core-ui` (`design-system` reaches it as framework→framework) | — | — |
| `harness-capability` | `connections`, `core-api`, `core-ui`, `harness-registry`, **`run-orchestration`** | `agent-run-config` | — |
| `harness-protocol` | `agent-orchestration`, `agent-run-config`, `core-api`, `harness-registry`, `remote-worker`, `run-orchestration`, `session-requests` | `tool-handlers` | — |
| `tool-protocol` | `core-api`, `harness-registry`, `review`, `settings`, `tool-handlers` | — | — |
| `work-intent-port` | `conversation`, `core-api`, `knowledge`, `policy`, `review`, `routine`, `run-orchestration`, `work` | `eval` | — |
| `filesystem-contract` | `agent-orchestration`, `core-api`, `filesystem-mounting`, `filesystems`, `run-orchestration` | — | — |
| `conversation-parts` | `core-ui` | — | — |
| `block-derivation` | `core-ui` (`design-system` reaches it as framework→framework) | `core-api` | — |
| `event-bus` | 13 packages (3 layers + 9 services + 1 application) | `eval`, `tool-handlers` | `service`, `application` |
| `http-middleware` | `agent-orchestration`, `core-api`, `harness-registry`, `run-orchestration` | — | — |
| `diagnostics` | `conversation`, `core-api`, `knowledge`, `notifications`, `remote-server`, `routine`, `run-orchestration`, `work` | `db`, `setup` | `service`, `application` |
| `host-process` | `agent-orchestration`, `notifications`, `remote-server`, `run-orchestration` | `core-api`, `filesystem-mounting`, `setup` | — |
| `factory-defaults` | `agent-orchestration`, `core-api`, `tool-handlers` | `setup` | — |
| `credential-access` | `agent-orchestration`, `connections`, `core-api`, `credentials`, `harness-registry`, `remote-server` | `core-ui`, `eval` | — |
| `cron` | `core-api`, `routine`, `tool-handlers` | — | — |
| `toon-codec` | `run-orchestration` | — | — |
| `query-escaping` | `core-api`, `knowledge`, `users`, `work` | — | — |

**What the symbol-level unit changed against the module-level draft:** `run-orchestration` added to
`harness-capability` (the `ReturnEnforcementChannel` relocation — a red build otherwise); the `service` grant
removed from `presentation-format` (D11); `like-escape` renamed to `query-escaping` (D12). Every other list is
identical, which is the expected result — a module-level derivation is correct exactly where no symbol moves
on its own.

### 4.8 The population the earlier rounds never measured — and the ruling it produced

Rounds 1–3 enumerated consumers from files **outside** `framework/shared`. The package's own internal
imports were therefore never in the population, and on the day of the split every one of them becomes a
cross-package crossing. Running the intra-package import graph against the §4 destination map — at symbol
level, so the three relocations in §4.4 are followed, and resolving every barrel import through to the module
that declares the name — produces **21 ordered package pairs across 47 cross-destination import statements**
(88 name bindings).

An earlier draft said 22 pairs and treated `observability/console-adapter.ts:1` as a pair against "the old
barrel" while resolving the identical situation at `http/rate-limit.ts:33-34` and `http/body-limit.ts:48-49`
straight through to `domain-model`. Resolved consistently, `console-adapter`'s three names all land in
`diagnostics`, its own package, and produce no pair at all. An independent count of the statement figure
landed at 50 against this 47; the definition used here is *distinct `file:line` import statements that
produce at least one cross-destination edge*, given so the difference is locatable. No conclusion moves —
the pair count, which is what the ruling turns on, agrees.

**What needs Ruling 1, derived rather than taken on trust:**

| | pairs | why |
|---|---|---|
| all cross-destination pairs, both acts applied | 21 | measured |
| − `format/money.ts` → `domain-model` | −1 | the source module is deleted (§1.3), so it is not an edge |
| − targeting `domain-model` | −10 | `reach: everyone` already admits the `framework` role — `inAudience` short-circuits on `everyone` at `governance-model.ts:167` before any role or name test, and it does so for `manifest` crossings as well as `import`; no ruling needed |
| − `domain-model` → `credential-access` | −1 | **removed, not permitted** — D3's private-helper fold eliminates it |
| **needing Ruling 1** | **9** | |

(`harness-capability` → `harness-protocol` does not appear because D1's second act has already removed it;
with act 1 only the same measurement reports 22 pairs and a cycle.)

The nine, each with the file that creates it: `conversation-parts` → `harness-capability` (`part.ts:687`) ·
`event-bus` → `diagnostics` (`event-bus.ts:8`) · `harness-protocol` → `event-bus` (`harness-port.ts:46`) ·
`harness-protocol` → `harness-capability` (`harness/harness-adapter.ts:7`,
`harness/harness-capability-read-model.ts:40`) · `harness-protocol` → `work-intent-port`
(`harness-port.ts:45`) · `host-process` → `diagnostics` (`git/git-runner.ts:16`) · `http-middleware` →
`diagnostics` (`http/access-boundary.ts:31`) · `tool-protocol` → `event-bus` (`tool.ts:27`) ·
`tool-protocol` → `harness-protocol` (`tool.ts:28`). Each carries a matching `manifest` crossing, so without
the ruling the new packages could not declare one another as dependencies at all.

This independently reproduces the nine recorded in Ruling 1. The two subtractions above are the finding the
count alone hides: **two of the edges must not be admitted.** Ruling 1 would make
`domain-model → credential-access` legal, and it is still wrong — a universal package carrying a
narrow one in its closure inverts the audience order D4 declares binding. Legality and correctness are not
the same test, and the ruling settles only the first.

**One pair the pre-split graph cannot show, because B3 creates it.** `credential-access`'s new resolver module
references `ModelProvider`, `ResolvedModel`, `ModelGatewayConfig` and `ModelRequest` (`model-gateway.ts:25`,
`:55`, `:49`, `:200`), `ModelTier` (`types.ts`) and `MissingCredentialError` (`errors.ts`) — every one of them
staying in `domain-model`. So the split adds **`credential-access` → `domain-model`**, a twenty-second pair
absent from the twenty-one above because it does not exist until the file is split. It targets `everyone`, so
it needs no ruling and adds no cycle; it is stated because this section claims to measure against the
post-split map and the pre-split graph cannot see it.

**Acyclicity, re-verified mechanically with both removals applied:** 21 pairs, **no cycles**. With D1's second
act omitted the same check reports `harness-protocol → harness-capability → harness-protocol`, which is why
§3 D1 now states two acts and §6.1 lists both.

### 4.9 Ruling 2 — the modules with no consumer outside their package

`plan.md:51` is enforced literally (`founder-rulings.md` Ruling 2): a module nothing outside its own package
reaches is **deleted, or folded into the module that actually consumes it**. Computed against the final §4
map and iterated to a fixpoint, so a module stranded *by the folding* is caught too:

**Nine modules fail, not ten.** `observability/events.ts` is in Ruling 2's context list but has an external
production consumer — `layers/core-api/src/observability/dispatcher.ts`, which AU29 created (§1.3). It
passes and stays. Every one of the nine has a live in-package consumer, so **all nine fold and none is
deleted**; `format/money.ts`, which has no consumer anywhere, remains the split's one deletion.

| module | package | disposition | why that target |
|---|---|---|---|
| `kinds/kind-definition.ts` | `domain-model` | **fold into `kinds/registry.ts`** | it is the type of a registry entry; the registry and the six definitions are its only readers, and they all land in one file |
| `kinds/code.ts` | `domain-model` | **fold into `kinds/registry.ts`** | the registry builds `REGISTRY` from it; `types/artifact.ts` re-exports its preview type and takes it from the registry afterwards |
| `kinds/data.ts` · `kinds/html.ts` · `kinds/image.ts` · `kinds/text.ts` · `kinds/url.ts` | `domain-model` | **fold into `kinds/registry.ts`** | same, five times |
| `blocks/slug.ts` | `block-derivation` | **fold into `blocks/normalise.ts`** | `normalise.ts` and `derive-blocks.ts` are the two readers, and `derive-blocks.ts` already imports `normalise.ts` — folding there adds no edge |
| `toon-errors.ts` | `toon-codec` | **fold into `toon-codec.ts`** | its single reader, which throws it at four sites |

The `kinds/*` cluster collapses to one module rather than being distributed: `kinds/registry.ts` is the only
member with external reach (`design-system`, `tool-handlers`, `core-api`), so it is the consumer the other
seven fold into. A naive "fold into your first importer" would have sent `kind-definition.ts` into
`kinds/code.ts`, which is itself being folded — the fixpoint check is what makes that visible.

**The fold changes no function's behaviour** — it moves declarations between files in the same package, which
is placement, exactly as Ruling 2 states. It creates no new cross-package edge, so §4.8's graph is unaffected.

**Resulting module counts.** 95 source modules = **79 surviving + 9 folded + 1 deleted + 6 barrels
dissolved**. Per package, `domain-model` 39 → **32**, `block-derivation` 5 → **4**, `toon-codec` 2 → **1**;
every other package is unchanged. **After the fold, no module in any of the eighteen packages is reached only
from inside it** — which is AC-5, read literally, and checkable.

---

## 5. What "success" means, mapped to every plan AC

| AC | what has to be true | how it is verified |
|---|---|---|
| `framework/shared` no longer exists as a single package; what it held lives in framework packages named for what they contain | the directory is gone from `workspaces` and from disk; the 18 packages in §4 exist | the tree, and `npm run check` |
| every one of those packages has a decided audience recorded with its reason, and the build fails on a package with no audience decided | 18 new `surfaces` entries, each with `reach` and `why`; **a framework package with no entry fails the lint whether or not anything imports it** | `npm run lint` — §7.4 specifies what delivers this, §7.1 the separate defect in the message |
| only the packages whose reason for universal reach survives being written down are reachable by everyone; the rest are reachable only by their stated audience, enforced by the lint | **exactly one of `shared`'s eighteen successors** carries `everyone` (§4.1 — `architecture.json` also keeps it on `framework/db`, `db:client` and `db:row-type`, which this WP does not touch); seventeen derived lists (§4.7); six republications resolved (§4.6) | `npm run lint` — `reach-declared-surfaces-only` and `no-laundered-re-exports` |
| no package's dependency closure carries a toolchain it does not use | the table in §5.2, produced by the 31-manifest rewrite scoped in §6 | the manifests; and the three `node:*` warnings plus `harness-event-normalization.ts` disappear from the web build (§1.4) |
| no module survives the split that nothing outside its own package reaches | **read literally** (`founder-rulings.md` Ruling 2): the nine modules in §4.9 are folded into their consumers, `format/money.ts` is deleted, and the end state has no module reached only from inside its own package | the fixpoint computation in §4.9, re-run against the shipped tree |
| `npm run verify` is green and the application behaves identically — proven by running it | verify green; the app booted and exercised | `npm run verify`, then the running app |

### 5.1 AC-5 is enforced literally — the reinterpretation is withdrawn

An earlier draft proposed to satisfy `plan.md:51` by co-locating each internally-reached module with its
importer — reading "package" as "module" — and asked the founder to approve that reading. **Ruling 2 refused
it.** The literal reading stands: a module nothing outside its own package reaches is deleted or folded into
its consumer. §4.9 does that, per module, with the target and the reason.

Two things the earlier draft said about this are wrong and are withdrawn rather than softened. It claimed the
literal reading collides with `plan.md:36` ("no behaviour changes; this is placement") and therefore could not
be satisfied — it does not: folding moves declarations between files and changes no function's behaviour,
which is placement. And it leaned on the dead-export list as AC-5 evidence; AC-5 is about modules, the export
census is about names, and §1.3 no longer offers one as proof of the other.

**No ruling is outstanding on this AC.**

### 5.2 The manifests, and the AC-4 proof

| dependency | today | after |
|---|---|---|
| `hono`, `@hono/zod-validator` | `framework/shared` → 31 manifests | `framework/http-middleware` only |
| `remark-parse`, `remark-gfm`, `unified` | `framework/shared` → 31 manifests | `framework/block-derivation` only |
| `github-slugger` | `framework/shared` → 31 manifests | `framework/block-derivation` only |
| `@noble/hashes` | `framework/shared` → 31 manifests | `framework/block-derivation` only |
| `zod` | `framework/shared` → 31 manifests | `domain-model`, `http-middleware`, `tool-protocol` |

The one `everyone` package, `domain-model`, carries `zod` and nothing else — no markdown parser, no HTTP
framework, no hash library, no `node:` builtin. That is AC-4, and it is checkable from the manifests alone.
**It is produced only by rewriting the 31 consumer manifests** to name the subset of new packages each
actually uses; §6 scopes that work.

---

## 6. Scope

**In scope — the decisions.** Creating the 18 packages; assigning all 95 modules; the three symbol relocations
in §4.4; the nine folds in §4.9; deleting `format/money.ts` and the ten dead exports; the four edge rewrites
in §6.1; the six republication decisions in §4.6; 18 new `surfaces` entries and the retirement of the
`framework/shared` entry; the `decided-rules.json` consequence in §7.2.

**In scope — the two rulings' own code changes.** Neither is a package edit and both gate on the same test:

| ruling | lands in | gated by |
|---|---|---|
| **Ruling 1** — a framework package may name another, **under the predicate below** | the surface clause in `scripts/lib/governance-model.ts:292-302` and its twin in `scripts/lib/governance-attacks.ts`; the written model in `governance/README.md`; the `framework →` rows in `governance/decided-rules.json` the change makes unnecessary | `framework/db/src/__tests__/governance-model.test.ts` must reproduce it — see §6.2 for the edits that test needs; and the clause needs an attack case **plus the specific control twin in §7.5**, or the build fails on property 4 (`governance/README.md:109-124`) |
| **Ruling 2** — AC-5 literal | the nine folds in §4.9 — source moves only, no registry edit | the fixpoint check in §4.9 |

**Ruling 1's predicate — the specification a builder implements, and the reason it is not the literal
reading.** The surface clause at `governance-model.ts:292-302` decides **every** `sort: "surface"` target, not
only `framework/*` ones. `db:schema-ns`, `db:unknown` and `db:testing` are surface targets too, all
`reach: []`, and the first two are `oneDoorSurfaces`. A clause written as "admit a `framework`-role source at
clause 7" would therefore hand all eighteen new packages production reach to "one import that hands over every
table at once" and to the undecided-surface catch-all. `plan.md:40` puts table and boundary work in AU30/AU31,
so AU34 has no mandate to move that line. The founder scoped it accordingly:

> **The clause admits a `framework`-role source only when the target surface label is `framework/<name>`.
> `db:*` surfaces keep their declared audiences unchanged.**

**Ruling 1 widens exactly two existing surfaces, and only two.** A framework package may now name
`framework/api-contract` (`reach: ["layer"]`) and `framework/design-system` (`reach: ["core-ui"]`). It does
**not** widen `framework/db`, which already carries `everyone` and was therefore never refused — an earlier
draft listed it as a third. Nothing imports either today. `design-system`'s written reason — "there is exactly
one user interface; a second consumer means a second interface, which is a product decision, not an import" —
is the one whose intent this relaxes. **Flagged, not actioned.**

**In scope — the mechanical work AC-4 and AC-1 depend on.** Measured, not estimated:

| what | count | where |
|---|---|---|
| consumer `package.json` manifests declaring `@hyperidle/shared` | **31** | each rewritten to name the subset it actually uses — **this produces §5.2, and without it AC-4 is unachievable** |
| per-package `tsconfig.json` files naming `framework/shared` | **28** | project references |
| root project reference · path alias | 1 · 1 | `tsconfig.json:4` · `tsconfig.base.json:20` |
| vitest projects list (hardcoded array) | 1 → 18 entries | `vitest.config.ts:25` |
| `eslint.config.ts` references | **16** | including the `no-restricted-imports` groups at `:608`, `:949`, `:963-964` and the time-formatter allow-list at `:655`. Note `:963-964` restricts `"@hyperidle/shared/harness"` specifiers that **do not resolve today** — `harness` is not a declared subpath, so the pattern has never matched anything. Pre-existing; the rewrite will surface it |
| governance attack prose naming the surface | 1 | `scripts/lib/governance-attacks.ts:429` |
| knip workspaces block | 1 → 18 entries | `knip.json` |
| event-bus types module path | 1 | `architecture.json` `eventBus.typesModule` |
| deployment comment naming the package | 1 | `docker-compose.yml:46` |
| project rule naming the package | 1 | `.claude/rules/design-system.md:17` |
| documentation naming the package | **58** files under `docs/` | 57 name `framework/shared`, 2 name `@hyperidle/shared`; this is the `DOC-CLASS: update` surface |
| lockfile | 1 | `package-lock.json` must be regenerated for 18 new workspaces |
| consumer import sites | **771** | §1.2 |

**In scope — the package's own development world**, which the earlier draft omitted entirely:

| what | count | note |
|---|---|---|
| new `package.json`, `tsconfig.json`, `src/index.ts`, `vitest.config.ts` | 4 × 18 | `framework/shared/vitest.config.ts` is retired; the root array in `vitest.config.ts:25` is a separate edit |
| test files to distribute | **85** under `src/__tests__` and `src/*/__tests__`, less the two below | |
| test files that are **deletions**, not moves | 2 | `__tests__/money.test.ts` and `__tests__/money-harness.test.ts` cover `format/money.ts`, which is deleted (§1.3); the parts covering `types/money.ts` move to `domain-model` |
| non-`.ts` fixtures that must move with their tests | **15** | `src/__tests__/blocks/fixtures/golden-corpus/*.md` (12) + `src/__tests__/blocks/golden-ids.json` → `block-derivation`; `src/harness/__tests__/fixtures/{claude-stream,codex-exec}.jsonl` → `harness-protocol` |
| the mock adapter | 1 | `src/harness/__testing__/mock-harness-adapter.ts` → `harness-protocol` |

**Distributing the tests is a decision, not a move.** At least three span more than one destination —
`__tests__/types.test.ts`, `__tests__/o1-event-split.test.ts`, `__tests__/AE6-kind-registry.test.ts` — and a
test that asserts across two packages either splits or picks a home and imports the other across a boundary.
Four more must change regardless (§1.3).

### 6.1 Four edge rewrites, all placement, all before the split

1. `ReturnEnforcementChannel` from `harness-adapter.ts:223` to `harness-capability` (D1).
2. `observability/console-adapter.ts:1` imports `createLogger`, `Logger` and `ObservabilityEvent` from
   `"../index.js"` — the package's own barrel. Must import the three from their modules directly.
3. `http/rate-limit.ts:33-34` imports `ApiErrorResponse` and `API_ERROR_CODES` from `"@hyperidle/shared"` —
   the package importing itself by package name.
4. `http/body-limit.ts:48-49` — identical to (3).

(2), (3) and (4) do not resolve at all once the barrel and the package name are gone.

**The pre-split form of (3) and (4) is a relative import (`../api-types.js`), not `@hyperidle/domain-model`.**
§8 requires these to land before the split; a package that does not exist yet cannot be named. They become
`@hyperidle/domain-model` imports in the same mechanical sweep as the other 771 sites. An earlier draft
specified the post-split spelling for a pre-split step, which is not executable.

### 6.2 The gate itself is an edit, not only a gate

§6 names `framework/db/src/__tests__/governance-model.test.ts` as what proves Ruling 1. It is also a file this
work package has to change, and nothing above said so:

- **`makeActor` (`:79-101`) knows exactly three package names** — `core-ui`, `agent-execution`,
  `harness-registry` — and its `default` branch returns `{ role: <package-name> as Role }`, which is not a
  valid role at all. Every `scope: "named"` row AU34 adds needs a real actor. The eighteen reach lists name
  **25 distinct packages** (`agent-execution`, `agent-orchestration`, `agent-run-config`, `connections`,
  `conversation`, `core-api`, `core-ui`, `credentials`, `design-system`, `filesystem-mounting`, `filesystems`,
  `harness-registry`, `knowledge`, `notifications`, `policy`, `remote-server`, `remote-worker`, `review`,
  `routine`, `run-orchestration`, `session-requests`, `settings`, `tool-handlers`, `users`, `work`), each
  needing its role and, for a service, its home layer.
- **The row count is hardcoded in three places**: `expect(decided.totals.rows).toBe(118)` (`:171`) and two
  `expect(checked, …).toBe(118)` loop assertions (`:214`, `:229`). All three move with `totals.rows` in the
  JSON, and `governance/README.md:31` states the count in prose as well.

**Out of scope**, restating `plan.md` and adding what the measurement turned up:
- taking the framework off the event bus (AU29); table, composition-root or cross-layer boundary work
  (AU30, AU31);
- pruning the other ~238 exports with no consumer (§1.3) — `plan.md:41`;
- acting on Ruling 1's widening of `api-contract`, `design-system` and `db` — flagged above, not actioned;
- the two markdown stacks in the browser bundle (§1.4);
- whether `core-api` should host `/api/workers` (§4.2, `harness-protocol`);
- moving `escapeLikePattern` into `framework/db` — explicitly rejected in D12;
- shrinking the web bundle. This work package does not, and §1.4 says why.

**Non-goals.** No behaviour changes. No re-export shim in a surviving `shared`, no deprecation period, no
alias package. No new barrel beyond each package's own `src/index.ts`; the five subpath exports do not survive
as subpaths, because each is now a package. No new file under `governance/` — `no-per-file-allowances` fails
the build on one.

---

## 7. What this work package must also change

**7.1 — When something *imports* an undeclared framework package, the lint fails with the wrong message.**
(The case where *nothing* imports it is §7.4 — a different defect with a different fix. An earlier draft
conflated the two and delivered neither AC-2 nor validation scenario 4.)
`frameworkSurfacesOf` (`scripts/governance-context.ts:187-195`, twinned at `scripts/lib/governance-attacks.ts:928`)
maps a framework package to `framework/<name>` **only when that label already exists in
`architecture.surfaces`**. A framework package with no entry therefore never becomes a `surface` target:
`scripts/lib/crossings.ts:166-170` falls through to `targetForPackage`, and the crossing is judged by the
generic clauses. The build does fail — via `reach-across-only-from-a-composition-root` — but reports "only a
composition root reaches across", not "this package has no decided audience". The fix is to map **every**
framework package to its label unconditionally. Adding eighteen packages is exactly when this must be true.

**7.2 — `governance/decided-rules.json` holds twelve rows targeting `framework/shared`, and the ruling is
larger than replacing them.**
Six sources × two kinds, every one `allowed` in both worlds — the blanket, written down.

**Magnitude, revised under Ruling 1 and grounded in the file's real density rather than an estimate.** The
rows are not a cross product — they record the pairs someone decided. Measured: `framework/shared` **12**
(six source roles × two kinds, because everything may reach it), `framework/design-system` **4** (its one
allowed audience plus the forbidden contrast), `framework/db` **4**, `framework/api-contract` **2**. A
narrow-audience surface therefore costs **2–4 rows** and an `everyone` surface **10–12**.

Ruling 1 removes the `framework` source role from every framework-target row — a framework package naming
another is a property of the model now, not a decided pair.

**The row count is a policy choice, not a derived number, and the earlier "60–80" was neither.** Nothing gates
coverage: `scripts/governance-new-cells.ts:8` says in terms that it is "a report, not a gate", and the live
file proves the point — `framework/db` carries `everyone` and just **4** rows, all `manifest`. So the honest
statement is the range under each policy, with the arithmetic shown:

| policy | rows | how it is counted |
|---|---|---|
| **minimal** — record each surface's decisive verdict plus one forbidden contrast, as `api-contract` (2) and `design-system` (4) do | **~40–70** | 17 narrow surfaces × 2–4, plus `domain-model` at ~10 |
| **exhaustive** — one row per *named* source per kind, as `framework/shared` does for its six roles | **~180** | the seventeen narrow lists carry **68** named source→target pairs; 68 × 2 kinds = 136, plus 17 × 2 contrast rows = 34, plus `domain-model` at 10 |

Ruling 1's saving scales with the policy: **36 rows** under the exhaustive one (one `import` + one `manifest`
per new surface), and **0–18** under the minimal one, where a `framework` source may never have been recorded
at all. Either way this is the largest single change the file has taken — 12 rows retire and somewhere between
forty and a hundred and eighty arrive. The README marks it frozen (`governance/README.md:31`), and
`framework/db/src/__tests__/governance-model.test.ts` gates it: the model must reproduce every row exactly.

**What is being asked for.** One thing: approval of the audience table in §4 and §4.7, which
`founder-rulings.md` places at the concept gate with the architecture rather than before it. The rows are read
off the approved `reach` lists — a mechanical consequence, not a second set of decisions. Both rulings
requested during refinement have been given. Precedent is in the file's own header: AU29 deleted the `db:util` and `db:bootstrap`
surfaces along with their six rows under Ruling 12.3. **Nothing in this artifact reverses a shipped ruling** —
D12 withdrew the one place an earlier draft did.

**7.4 — Nothing in the repo today fails on a framework package that has no `reach` entry, and AC-2 requires
it.** `plan.md:62` states the failure as a property of *adding* a package: *"Given a new framework package is
added with no `reach` entry, when `npm run lint` runs, then the build fails naming the package."* §7.1's
mechanism only fires when something **imports** the package — an undeclared package with no importer emits no
crossing at all and lints clean. No rule in `scripts/rules/` enumerates framework packages and requires a
surface; the registered set is `classification-total`, `crossings`, `db-symbols-all-placed`, `floors-tight`,
`misplacement-ledger`, `no-laundered-re-exports`, `no-per-file-allowances`,
`no-production-imports-development`, `no-stale-build-artifacts`, `pattern-live`, `registries-honest`.

**This is a registry-honesty failure, and `registries-honest` is where it belongs.** It already receives
`architecture` and already iterates `census.packages` (`scripts/rules/registries-honest.ts:31,40,63`), and a
package's role comes from the `framework/*` workspace glob — so a newly added `framework/foo` is in its
population from the very first lint, with no importer anywhere. That is precisely the property `plan.md:62`
states and §7.1's mechanism provably cannot deliver.

**Two things the rule must check, in both directions:**

1. **Every `framework`-role package resolves to a declared surface `framework/<name>`.** A package that does
   not fails, naming the package. This is `plan.md:31` — "a package with no decided audience does not ship".
2. **Every declared `framework/<name>` surface resolves to a package that exists.** Nothing checks this today,
   which means retiring the `framework/shared` surface is unenforced: leaving the entry behind after the
   directory is gone would lint clean.

**Its floor cannot be `minScope`.** `minScope: 25` is a floor on the rule's whole scope — 34 package
directories — not on the framework subset. If the framework half of the check matched zero packages the scope
would still be 34 and the rule would read clean forever: the `au6` shape, one level down. The framework subset
therefore needs its own explicit non-zero assertion inside the rule, hard-failing per `CLAUDE.md` when the
scan finds nothing. The subset is 4 today and 21 after AU34.

**7.5 — The attack case for Ruling 1 must include a specific control twin, or the gate cannot tell the two
readings apart.** §6 already requires an attack case for the new clause; property 4 makes that unavoidable.
But the obvious attack — "a framework package names another framework package, expect allowed" — passes under
*both* the broad and the scoped reading, and so does the whole of `decided-rules.json`: it holds **no row with
`source: "framework"` for any `db:*` target** (the only `db:schema-ns` rows are `layer` and `tooling`;
`db:unknown` has `layer` and `application`). The gate §6 names would therefore reproduce all 118 rows under
either implementation.

**The control twin is the discriminating case: a `framework`-role source naming `db:schema-ns` must still be
refused.** That is the assertion the broad reading fails and the scoped one passes, and it is what keeps a
future edit from quietly widening the clause back. A second twin for `db:unknown` costs nothing and covers the
catch-all.

**7.3 — No new package joins `oneDoorSurfaces`.** The current three are `db:schema-ns`, `db:unknown` and
`framework/design-system`. None of the eighteen is a door production has only one of: a test reaching the
cipher, the harness protocol or the HTTP middleware directly does not build a state production cannot produce.
The raw-runtime one-door already covers the act that matters. This is also why §4.7 grants nothing on the
strength of a development-only consumer.

---

## 8. Sequencing — a constraint, not a plan

`plan.md:28` fixes the order and it is binding: **the package set is settled before anything moves, and the 771
consumer import sites move mechanically and last.** There is no shim; every import site is rewritten against a
final package set, once. If the set is still moving when the sites are rewritten, they are rewritten twice, and
the second pass has no safety net because the old specifier no longer resolves.

Four consequences fall out of the measurement:

- The four edge rewrites in §6.1 must land **before** the split, in their **pre-split spelling** — (3) and (4)
  as relative imports, since `@hyperidle/domain-model` does not exist yet.
- **The nine folds (§4.9) land before the split too.** Folding a module into its consumer inside the current
  package is a self-contained, independently verifiable change; doing it during the split means moving a file
  and dissolving it in one diff, and the fixpoint check has nothing stable to run against.
- The ten dead exports and `format/money.ts` should go **before** the split. Deleting an export the split would
  otherwise have to place is strictly less work, and it makes the ten test consequences (§1.3, §4.6) small isolated
  failures rather than noise inside a 771-site diff.
- **The five re-export decisions (§4.6) are not part of the import-site rewrite.** Four of them delete a
  published name from a package's surface, and two repoint production importers. They are separate edits with
  their own review, and they must land with the surfaces that make them illegal — not before, when they look
  like gratuitous churn, and not after, when the build is already red.
- The 31 manifests are the AC-4 proof, not bookkeeping. Copying `shared`'s old dependency block into eighteen
  new ones would satisfy the typecheck and fail the acceptance criterion.

---

## 9. Load-bearing nouns

**Audience.** The set of actors permitted to name a surface, written as `reach` in
`governance/architecture.json`. Derived at the symbol level (§4.7), and wider than the measurement only where
a **role** is granted under the test in §4.5. Those four grants are the only places a name in a list has no
importing file behind it, and each states the rule it rests on. A bare package name with no consumer is not an
audience decision; it is a guess that fails the lint on the first legal import.

**Substrate.** After this work package, one package: `framework/domain-model`. Nothing else may be called the
substrate, and "it used to be in `shared`" is not an argument for joining it.

**Port.** An exported interface or function type that names a capability the holder can invoke on someone
else's behalf, supplied across a package boundary by someone other than its owner. Ports go with their
protocol, never in the universal package (D3) — a port in an `everyone` package advertises that capability to
the whole repo. The test is measured, not eyeballed: `CredentialResolver` is a port (it fetches a secret;
`credentials` implements it, `remote-server` composes it); `EventBusAdapter` is one too and is dead;
`EventHandler`/`WildcardHandler` are callbacks the bus invokes, not capabilities they hold; `KindDefinition`
is a record nothing outside its package has ever held.

**Protocol** vs **capability**, in the harness split (D1). A *capability* is what a harness is and whether it
is ready — a shape the API serves and a screen renders. A *protocol* is how a run is dispatched to one and how
its output comes back. The test: could a browser meaningfully hold this value? A descriptor, yes. An adapter,
no. Rejected reading: "everything under `harness/` is the harness surface" — naming a package after the
directory it sits in today, which `plan.md:23` rules out.

**Named for what it holds.** `plan.md:5` requires it and `plan.md:23` rules out a name that "just renames the
problem". D12 applied the test to `like-escape` and renamed it; two packages had escaped the test and are
checked here rather than left. **`framework/cron`** holds cron-expression parsing and next-run computation —
`cron` is the name of the expression syntax, not of the file, and a second scheduling-syntax module belongs in
it. **`framework/toon-codec`** holds the TOON codec and its parse error — `toon-codec` names the format and
the act, and after §4.9's fold it is one file whose name is the concept. Both pass; neither is renamed.

**Dead.** Reachable from no production file outside its own package. A module reachable only from a test is
deleted; so is an export reachable only from a test. **The definition is broader than this work package acts
on:** 248 of 640 exported names satisfy it (§1.3), and `plan.md:41` puts pruning on the merits out of scope,
so only the ten the split forces a decision on are deleted. **Applied to modules rather than names it is not
broader — it is exact, and it is AC-5:** the nine in §4.9 are folded into their consumers and
`format/money.ts` is deleted. Rejected reading: "knip says it is used" — knip
resolves through the barrel and cannot see this class of death at all.

---

## 10. Nothing is deferred; both rulings are given

Every audience in §4 is decided and every name traces to §4.7. Every one of the five re-export sites in §4.6
has a decision. The three items in §7 are consequences, each with the file and line it lands in.

**Both rulings requested during refinement have been given** and are carried through: Ruling 1
(framework→framework, §4.8 and §6) and Ruling 2 (AC-5 literal, §4.9 and §5.1). What remains is approval of the
audience table itself (§4, §4.7, magnitude in §7.2), which `founder-rulings.md` places at the concept gate
with the architecture rather than before it. Nothing here reverses a shipped ruling.

**Two things Ruling 1 widens are flagged and not actioned** (§6): a framework package may now name
`framework/api-contract` and `framework/design-system`. `framework/db` is not a third — it already carries
`everyone`, so it was never refused. Under the ruling's **scoped predicate** (§6) `db:schema-ns`, `db:unknown`
and `db:testing` are not widened either; §7.5 specifies the control twin that proves it.

No newly discovered outcome. Two things sit at the edge and are recorded as **facts the audience makes
visible, not scope**: `core-api` hosting `/api/workers` (§4.2, `harness-protocol`), and `framework/toon-codec`
having a single consumer (§4.2).
