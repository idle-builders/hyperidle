# harness-capability — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

**Ruling A3 (per-model options → agent configuration)** is the only ruling that moves rows in this
package. The first wave killed the entire five-export option subsystem as producer-less. The ruling
splits it: the *pill path* (per-message composer toggling) stays dead, but the *option concept*
survives as part of the agent's configuration — an agent is configured once with how its model
should run.

| Export / site | Old verdict | New verdict | Ruling |
|---|---|---|---|
| `HarnessModelOptionDescriptor` (#10) | DELETE | **FINISH** → harness-protocol descriptor + AgentEditor | A3 — the harness's declaration of which options a model supports survives; its consumer moves from composer to agent config. `scope: "launch" \| "durable"` member still dies — per-message ("launch") scope is the pill concept. |
| `HarnessModelOptionControl` (#9) | DELETE | **FINISH** → harness-protocol | A3 — the control union is what tells AgentEditor which input to render (select/boolean/number/text). Survives with #10. |
| `HarnessOptionChoice` (#8) | DELETE | **FINISH** → harness-protocol | A3 — member of the `select` control arm; survives with #9. |
| `HarnessModelDescriptor.options` member (inside #11) | delete member | **keep member (FINISH)** | A3 — `models[].options` is the declaration channel: the harness declares per-model options on the same wire DTO AgentEditor already reads for the model dropdown. #11's verdict value stays SIMPLIFY; the member list changes. |
| `deriveComposerPills` + SessionView pill branch (feature kill #1 downstream) | DELETE | **DELETE — unchanged** | A3 explicitly: "As per-message composer pills they are not valuable. Delete the pill path." |
| `HarnessOptionControlKind` (#3), `HARNESS_OPTION_CONTROL_KINDS` (#15) | DELETE | **DELETE — unchanged** | A3 does not resurrect them. The control union's own `kind` discriminant is the vocabulary; the standalone union was never referenced even inside its own package, and the const's only consumer is a test asserting the literal back at itself. Validation of a submitted option value is per-descriptor (against the specific declared control), never against a kind list — no runtime iteration need exists. |

**Rows changed: 4** (#8, #9, #10 verdict-value changes; #11 member-level change). Everything else
stands at full strength.

**Ruling 1 (shared backend, OIDC) — re-judged, no row moves.** None of this package's kills rested
on a single-user premise. `HarnessAccessMode` is written-at-every-construction, read-by-zero-files —
dead on any user count. The runtime-capability badges display crossed wires (`toolUse ←
preCompactionTrigger`, `fileEditing ← subAgents`, agent-profile.ts:214,218) — wrong for one user and
wrong for a team of twenty. `"sdk-inprocess"`/`"soft-continue"` are declared by zero adapters —
adapter count doesn't scale with humans. `derivePrimaryHarness` serves SetupFlow team creation,
which a multi-team org runs *more*, not less — MERGE into core-ui stands. The shared-backend premise
actually *strengthens* A3's reshape: per-agent options configured once server-side are shared team
state; per-message pills would have been per-human ephemera.

**Ruling 2 (events) — N/A.** This package declares no event types.

**Ruling 3 (knowledge ritual → plugin) — N/A.** Nothing here is ritual-about-the-work; no PLUGIN
verdicts.

### Per-model options as agent configuration

**Where the concept lives — nothing invented, every piece exists today:**

- **Storage:** `agent_run_config` table, sole reader/writer
  `layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts`. It already holds
  exactly the sibling facts (`harnessType`, `modelTierPreference`, `modelId`, `modelProvider`) —
  "how this agent's model should run" is this table's one sentence. Add one nullable jsonb column
  `model_options` (`Record<string, string | number | boolean> | null`). `null` ≡ no overrides,
  preserving the store's absent-row ≡ all-null invariant (`DEFAULT_AGENT_RUN_CONFIG` gains
  `modelOptions: null`; `AgentRunConfigPatch`, `CONFIG_COLUMNS`, and the upsert's `"field" in patch`
  walk each gain the field).
- **Declaration:** the harness declares which options each model supports via
  `HarnessModelDescriptor.options` on the GET `/api/harnesses` wire DTO — the field that exists
  today and that every production construction site writes as `[]`
  (harness-discovery.ts:101,141,762,801; harness-capability-descriptors.ts:87). FINISH means a first
  real producer: at least one adapter declares a real option (the obvious candidate: a
  thinking/reasoning-budget select on the builtin or claude adapter).
- **Edit surface:** `layers/core-ui/src/settings/AgentEditor.tsx`. It already selects the
  descriptor and derives the model dropdown from `descriptor.models` via
  `model-options-for-harness.ts` (AgentEditor.tsx:142-143). When the selected model's `options` is
  non-empty, render one control per `HarnessModelOptionDescriptor` (`control.kind` picks the
  input), prefilled from `runConfig.modelOptions ?? defaultValue`.
- **Write path:** PATCH `/api/agents/:id` (`layers/core-api/src/routes/agents.ts`), which already
  builds an `AgentRunConfigPatch` with `"field" in body` semantics (line 125 pattern). Validate the
  submitted map against the selected model's declared descriptors — unknown key or value violating
  its control (bad choice, out-of-range number) → 400 — mirroring the existing AH2
  (harness, provider, modelId) triple validation at line 248.
- **Resolution:** the provisioner already reads the run config at provisioner.ts:923 and resolves
  model facts into session start. Pass `runConfig.modelOptions` through to the adapter's
  session-start params. The `HarnessAdapter` contract (harness-protocol/harness-adapter.ts) has
  **no options input today** (`rg modelOptions` → zero hits) — adding that parameter is part of the
  FINISH, and each adapter maps recognized keys onto its real invocation (CLI flag, settings file,
  API param).
- **What is NOT rebuilt:** no per-message override, no composer surface, no session-scoped option
  state. `scope` disappears from the descriptor — every option is durable agent config.

**Build list (the FINISH, concretely):** 1 jsonb column + store plumbing; descriptor validation in
the PATCH route; AgentEditor option controls; adapter start-param + per-adapter mapping; one real
declared option to prove the wire end-to-end. Until the first adapter declares an option, the UI
renders nothing new — the feature lights up per-harness as declarations appear, which is the correct
producer-first ordering the first wave found violated (UI machinery existed, producer never did).

---

## Where does this package go?

**Verdict: MERGE → `framework/harness-protocol`** (the one runtime function merges the other way,
into `core-ui`). Unchanged by the rulings — the surviving option types are *declaration-side* (part
of the descriptor the harness serves), so they move with the descriptor into harness-protocol; the
chosen *values* live in `agent_run_config`, which is a table, not a type home.

This package is not a package. It is 13 type declarations, 1 const, and one 9-line function.
`harness-protocol` — the adapter contract — imports six of the thirteen types to define its own
surface. The two packages describe one noun: *what a harness is and can do*. They were split in AU34
solely to break an import cycle; inside one package that cycle is just file imports, and the
file-level graph is already acyclic. A package boundary whose only job is cycle bookkeeping is
tidiness, not core value.

The one reason this package exists apart from harness-protocol: `core-ui` and `conversation-parts`
want descriptor types without the adapter machinery. But every one of their imports is
`import type` — zero runtime cost. Keeping a whole package so a UI `package.json` stays prettier is
exactly the invented boundary the brief names.

**On the three-package question:** harness-capability and harness-protocol are **one thing** —
merge them, no hesitation. tool-protocol is a different noun (tools, not harnesses) — no claim it
must join.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/harness-capability"` → 8 production consumers (rest are tests/stories):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `framework/harness-protocol` (harness-adapter.ts, read-model) | `HarnessAccessMode`, `HarnessAuthActionDescriptor`, `HarnessDiscoveryStatus`, `HarnessModelDescriptor`, `ReturnEnforcementChannel`, `HarnessCapabilityDescriptor` | **Yes — this is the merge target.** |
| `layers/agent-execution/harness-registry` (5 files) | descriptor + readiness + enforcement types | No — execution layer; imports harness-protocol already. |
| `layers/agent-execution/src/boot.ts` | `ReturnEnforcementChannel` (type) | No — same. |
| `layers/agent-orchestration/run-orchestration/provisioner.ts` | `ReturnEnforcementChannel` (type) | No — same. |
| `layers/core-api/routes/harnesses.ts` | `HarnessCapabilityDescriptor` (type) | No — wire producer, not owner. |
| `layers/core-ui` (7 files) | `HarnessCapabilityDescriptor` (type), `derivePrimaryHarness` (runtime) | Owns `derivePrimaryHarness` (sole caller: SetupFlow). |
| `framework/conversation-parts/part.ts` | option types for `deriveComposerPills` | Dies with the pill path — the surviving option types' consumer is AgentEditor (core-ui), not conversation-parts. |
| `framework/domain-model` | none (reverse dependency) | — |

## If written today, from scratch

Against the corrected premise — a shared backend serving a team and an org of teams, identity via
OIDC, an event stream plugins hang off — one file in `framework/harness-protocol` next to
`harness-adapter.ts`:

- `HarnessCapabilityDescriptor` — the GET /api/harnesses wire DTO the shared backend serves to
  every team member's client (shrunk: no `accessMode`, no `runtime`, one `modelProviders`)
- `HarnessDiscoveryStatus` + `HarnessReadinessState` — row greying and the disable toggle; these
  are server facts about the backend's harness pool, identical for every viewer
- `HarnessAuthActionDescriptor` — the auth CTA (kind, label, command only)
- `HarnessModelDescriptor` — model pickers (id, label, provider, selectable, **options**)
- `HarnessModelOptionDescriptor` / `HarnessModelOptionControl` / `HarnessOptionChoice` — the
  harness's declaration of per-model knobs; rendered once, in agent configuration, by whoever on
  the team administers the agent; values stored per-agent in `agent_run_config`
- `ReturnEnforcementChannel` — 5 members, the one capability the system genuinely branches on
- `derivePrimaryHarness` → a private helper inside `core-ui/src/pages/SetupFlow.tsx`

The package `framework/harness-capability` does not exist. No standalone control-kind union, no
exported kind const, no per-message option scope, no composer pill derivation.

## Kill summary (revised)

| Verdict | Count |
|---|---|
| DELETE | 4 |
| FINISH | 3 |
| MERGE | 2 |
| SIMPLIFY | 4 |
| KEEP | 2 |

15 rows total. Surface: 15 exports → 9 surviving declarations, all relocated into
`harness-protocol` (plus one function inlined into core-ui). Package count: −1. First wave cut 60%;
the ruling converts three of those cuts into FINISH work with a named home.

## Feature-level findings

**1. Per-model options — pill path DELETE, option concept FINISH (reshaped by A3).**
The measured facts stand exactly as found: no production code has ever constructed a
`HarnessModelOptionDescriptor` — every `HarnessModelDescriptor` construction writes `options: []`
(harness-discovery.ts:101,141,762,801; harness-capability-descriptors.ts:87); the only non-empty
`options:` in the repo are a demo-world questionnaire and tests; `deriveComposerPills`
(conversation-parts/part.ts:721, consumed at SessionView.tsx:565) filters a permanently empty array
and redeclares its own local `RECOGNIZED_CONTROL_KINDS` rather than importing the exported const;
SessionView's pill row (~628-686) has never painted a pill. What changes is the disposition:
delete `deriveComposerPills`, the SessionView pill branch, `scope`, `HarnessOptionControlKind`,
`HARNESS_OPTION_CONTROL_KINDS`, and their tests — but keep the three descriptor shapes and the
`options` member, and FINISH them into agent configuration per the section above. What breaks
today: nothing observable — the UI paints identically until an adapter declares the first option.

**2. Runtime capability badges — DELETE, unchanged, and Ruling 1 does not soften it.**
`HarnessRuntimeCapabilities` is declared three times across three packages. On the descriptor it is
display-only; the exhaustive branch search found exactly ONE runtime branch in the repo
(provisioner.ts:1510 on `mcpSupport`) and it reads harness-protocol's own `HarnessCapabilities`,
not this type. The smoking gun: `core-api/routes/agent-profile.ts` maps
`toolUse: caps.preCompactionTrigger` (line 214) and `fileEditing: caps.subAgents` (line 218) — the
UI has displayed the WRONG flags indefinitely under "rough proxy" comments and nobody noticed,
because no decision hangs on them. A whole team seeing wrong flags is worse than one founder seeing
them. Kill `HarnessRuntimeCapabilities`, the descriptor's `runtime` field,
`provenCapabilities`/`capabilitySummary` badge plumbing, `mapCapabilities` +
`AgentHarnessCapabilities` (domain-model copy), and the badge rows. Keep `mcpSupport` and
`returnEnforcement` on harness-protocol's `HarnessCapabilities` — the two members with real
branches.

**3. Dead enforcement channels — DELETE, unchanged.** `"sdk-inprocess"` — declared by zero
adapters; its own doc comment says "dead"; provision-return-hook.ts:78 keeps a no-op case for
nothing. `"soft-continue"` — declared by zero production adapters (cursor-agent derives to
`"none"` via cli-harness-adapter.ts:338-340); referenced only by tests. Union shrinks 7 → 5.

## Full export audit (revised)

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `derivePrimaryHarness` | function | UI:SetupFlow (team creation) | MERGE | Sole caller is SetupFlow.tsx — 9 lines with a hardcoded stale-model fallback (`"claude-sonnet-4-6"`); inline into core-ui. Ruling 1 re-check: team creation exists per team in a multi-team org — used more, not less; MERGE stands. |
| 2 | `ReturnEnforcementChannel` | type | AGENT: provisioner.ts:1456 → provision-return-hook dispatch; declared by every adapter | SIMPLIFY | The one genuinely load-bearing capability. Drop dead members `"sdk-inprocess"` + `"soft-continue"` (feature #3); relocate beside `HarnessCapabilities.returnEnforcement` in harness-protocol. |
| 3 | `HarnessOptionControlKind` | type | DEAD | DELETE | Zero references anywhere, including inside its own package — `HarnessModelOptionControl`'s `kind` discriminant respells the literals. A3 does not resurrect it: the surviving control union carries its own vocabulary. |
| 4 | `HarnessAccessMode` | type | DEAD (written, never read) | DELETE | Every descriptor construction stamps it; `.accessMode` read by zero production files. Premise-free — dead at any user count. Delete type + descriptor field + `HarnessCapabilities.accessMode` + construction sites. |
| 5 | `HarnessReadinessState` | type | UI:/settings harnesses + SetupFlow (row greying, CTA gating) | KEEP | Discovery produces it, the UI branches on it — real runtime-tested capability. Moves to harness-protocol. |
| 6 | `HarnessAuthActionKind` | type | INTERNAL (member of #7 only) | MERGE | Inline the union into `HarnessAuthActionDescriptor.kind`, stop exporting. |
| 7 | `HarnessAuthActionDescriptor` | interface | UI: SetupFlow.tsx:107-108, SettingsHarnesses.tsx:148, harness-presentation.ts:98,191 | SIMPLIFY | `kind`/`label`/`command` branch the auth CTA — real. `description` and `credentialNames` written (harness-discovery.ts:707-726), read by nobody — delete both members. Moves to harness-protocol. |
| 8 | `HarnessOptionChoice` | interface | member of #9's `select` arm | **FINISH** | **Was DELETE — Ruling A3.** Survives as part of the select control's declaration shape; consumer becomes AgentEditor. Moves to harness-protocol with #9/#10. |
| 9 | `HarnessModelOptionControl` | type | member of #10 | **FINISH** | **Was DELETE — Ruling A3.** The discriminated union that tells AgentEditor which input to render. Moves to harness-protocol. |
| 10 | `HarnessModelOptionDescriptor` | interface | producer-less today: every production `options:` write is `[]` | **FINISH** | **Was DELETE — Ruling A3.** The harness's per-model option declaration. FINISH = first real adapter declaration + AgentEditor controls + `agent_run_config.model_options` column + PATCH validation + provisioner→adapter pass-through (see "Per-model options as agent configuration"). Member `scope: "launch" \| "durable"` DIES — per-message scope is the pill concept; all options are durable agent config. `required` dies with it — agent options are overrides atop `defaultValue`. |
| 11 | `HarnessModelDescriptor` | interface | UI: AgentEditor model dropdown (model-options-for-harness.ts:39, AgentEditor.tsx:142), SetupFlow, SettingsHarnesses | SIMPLIFY | `id`/`label`/`provider`/`selectable` read today; **`options` now survives as the declaration channel (A3)** — was slated for member deletion. `contextWindow` (copied at descriptors.ts:84, read nowhere) and `inheritedFromGateway` (written, read nowhere) still die. Moves to harness-protocol. |
| 12 | `HarnessRuntimeCapabilities` | interface | display-only badges; zero runtime branches on the descriptor copy | DELETE | Feature #2. Crossed-wire badge mapping shipped unnoticed — proof the display carries no value. Ruling 1 re-check: wrong flags shown to a whole team are still wrong flags; DELETE stands. |
| 13 | `HarnessDiscoveryStatus` | interface | UI: settings/setup greying, toggle, disabled stamp (AM4) | KEEP | `state`/`disabled` branched on in harness-presentation; route stamps `disabled` from server_config. Moves to harness-protocol. |
| 14 | `HarnessCapabilityDescriptor` | interface | UI: GET /api/harnesses wire DTO → SetupFlow, SettingsHarnesses, SettingsAgents, AgentEditor, SessionView | SIMPLIFY | The package's actual product surface. Shrink: drop `accessMode` (#4), drop `runtime` (#12), collapse the duplicate provider lists to one. `models[].options` stays (A3). Moves to harness-protocol. |
| 15 | `HARNESS_OPTION_CONTROL_KINDS` | const | TEST-ONLY (own package's descriptor test) | DELETE | Only reference outside its declaration is its own test asserting the literal back at itself; part.ts redeclared a private copy rather than import it. A3 does not need it: option-value validation is per-descriptor against the specific control, never against a kind list. |

## Types / DI ports

No DI ports. All 13 declarations verdicted above. Parallel copies that die with #12:
`AgentHarnessCapabilities` (framework/domain-model/src/agent-profile.ts:93-100) and
`mapCapabilities` (core-api/routes/agent-profile.ts:202-221). `HarnessCapabilities`
(harness-protocol) survives as the single flags home, shrunk to the branched-on members.

## Holes this leaves

1. **Settings/AgentProfile capability chips disappear** (feature #2). Two of the four were mapped
   from the wrong source flags; the honest replacement is nothing.
2. **Composer pill machinery gone; option surface moves to AgentEditor** (feature #1, reshaped).
   Until the FINISH lands and a first adapter declares an option, no option UI exists anywhere —
   which is exactly today's observable state. A user wanting a per-message override has no path;
   that is the ruling's explicit trade (configure the agent, don't toggle the message).
3. **The FINISH is real work with a schema migration** — `agent_run_config` gains a column, the
   PATCH route gains descriptor validation, the adapter contract gains a start param, and at least
   one adapter must map recognized keys onto its real invocation. Until an adapter maps a key,
   a stored option is written-never-consumed — the same disease this audit kills elsewhere. The
   pass-through must land in the same work package as the first declaration, or the FINISH just
   rebuilds dead machinery one layer lower.
4. **core-ui and conversation-parts gain a `@hyperidle/harness-protocol` dependency** for type-only
   imports. Zero runtime weight. If governance forbids the edge, fallback: a single
   `harness-descriptor.ts` file inside harness-protocol, never a package.
5. **`"soft-continue"` removal** — a future spawnable cursor-agent re-adds one union member and one
   case arm, earned when cursor actually spawns.
6. The two in-package test files die with the package; descriptor-shape coverage lives where it
   really lives — adapter and route tests that construct descriptors. The FINISH brings new tests
   at the real seams: PATCH validation, store round-trip, adapter param mapping.
