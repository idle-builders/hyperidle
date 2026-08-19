# harness-capability — destroyer verdict (framework)

## Where does this package go?

**Verdict: DISSOLVE → `framework/harness-protocol`** (the one runtime function dissolves the other way, into `core-ui`).

This package is not a package. It is 13 type declarations, 1 const, and one 9-line function.
`harness-protocol` — the adapter contract — imports six of the thirteen types to define its own
surface (`HarnessAdapter`, `HarnessCapabilities`, the read-model). The two packages describe one
noun: *what a harness is and can do*. They were split in AU34 solely to break an import cycle;
inside one package that cycle is just file imports, and the file-level graph is already acyclic
(the AU34 lore in `harness-capability-descriptor.ts` says so itself). A package boundary whose
only job is cycle bookkeeping is tidiness, not core value.

The one reason this package exists apart from harness-protocol: `core-ui` and `conversation-parts`
want descriptor types without the adapter machinery. But every one of their imports is
`import type` — zero runtime cost, tree-shaken to nothing. Keeping a whole package so a UI
`package.json` stays prettier is exactly the invented boundary the brief names.

**On the three-package question (harness-capability / harness-protocol / tool-protocol):**
harness-capability and harness-protocol are **one thing** — merge them, no hesitation; the
capability descriptor is a projection of the adapter's `getCapabilities()` and the two types
(`HarnessRuntimeCapabilities` vs `HarnessCapabilities`) are the same flags declared twice.
tool-protocol is a different noun (tools, not harnesses) — I make no claim it must join; if the
tool-protocol destroyer also lands on harness-protocol as home, fine, but the hard, evidenced
edge is capability↔protocol.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/harness-capability"` → 8 production consumers (rest are tests/stories):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `framework/harness-protocol` (harness-adapter.ts, read-model) | `HarnessAccessMode`, `HarnessAuthActionDescriptor`, `HarnessDiscoveryStatus`, `HarnessModelDescriptor`, `ReturnEnforcementChannel`, `HarnessCapabilityDescriptor` | **Yes — this is the dissolve target.** It already embeds these types in its own contract. |
| `layers/agent-execution/harness-registry` (5 files) | `HarnessCapabilityDescriptor`, `ReturnEnforcementChannel`, `HarnessReadinessState`, `HarnessAuthActionDescriptor`, `HarnessModelDescriptor`, `HarnessRuntimeCapabilities`, `HarnessDiscoveryStatus` | No — execution layer; core-api/core-ui may not import it (Mechanism B). Imports harness-protocol already. |
| `layers/agent-execution/src/boot.ts` | `ReturnEnforcementChannel` (type) | No — same. |
| `layers/agent-orchestration/run-orchestration/provisioner.ts` | `ReturnEnforcementChannel` (type) | No — same. |
| `layers/core-api/routes/harnesses.ts` | `HarnessCapabilityDescriptor` (type) | No — it is the wire producer, not the owner. Already reaches harness-protocol for the read-model. |
| `layers/core-ui` (7 files) | `HarnessCapabilityDescriptor` (type), `derivePrimaryHarness` (runtime) | Owns `derivePrimaryHarness` (sole caller: SetupFlow). Types come from harness-protocol as `import type`. |
| `framework/conversation-parts/part.ts` | `HarnessCapabilityDescriptor`, `HarnessModelOptionDescriptor` (types, for `deriveComposerPills`) | Moot — `deriveComposerPills` is producer-less dead machinery (see feature kill #1). |
| `framework/domain-model` | none (reverse: harness-capability imports `ModelProvider`, `PrimaryHarnessConfig` from it) | — |

Three of eight consumers import exactly one type each. This is not a shared package; it is six
symbols in the wrong file.

## If written today, from scratch

One file in `framework/harness-protocol` next to `harness-adapter.ts`:

- `HarnessCapabilityDescriptor` — the GET /api/harnesses wire DTO (shrunk: no `accessMode`, no
  `runtime`, one `modelProviders`)
- `HarnessDiscoveryStatus` + `HarnessReadinessState` — drives row greying and the disable toggle
- `HarnessAuthActionDescriptor` — drives the auth CTA (kind, label, command only)
- `HarnessModelDescriptor` — drives the model pickers (id, label, provider, selectable only)
- `ReturnEnforcementChannel` — 5 members, the one capability the system genuinely branches on
- `derivePrimaryHarness` → a private helper inside `core-ui/src/pages/SetupFlow.tsx`

The package `framework/harness-capability` does not exist.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 2 |
| SIMPLIFY | 4 |
| KEEP | 2 |

Surface: 15 exports → 6 exports (60% cut). Package count: −1. Survivors all relocate into
`harness-protocol`; nothing keeps its own package.

## Feature-level kills

**1. Per-model composer option pills — machinery on both ends of the wire, nothing in the middle.**
`HarnessModelOptionDescriptor` / `HarnessModelOptionControl` / `HarnessOptionChoice` /
`HarnessOptionControlKind` / `HARNESS_OPTION_CONTROL_KINDS` — five of the fifteen exports — exist
so a harness can declare per-model options that render as composer pills. **No production code has
ever created one.** Every construction site of `HarnessModelDescriptor` writes `options: []`
(harness-discovery.ts:101,141,762,801; harness-capability-descriptors.ts:87); the only non-empty
`options:` in the repo are a demo-world questionnaire and tests. Downstream, `deriveComposerPills`
(conversation-parts/part.ts) filters an always-empty array — and even redeclares its own local
`RECOGNIZED_CONTROL_KINDS` instead of importing the exported const, proving the const was never
needed — and SessionView.tsx:640-686 renders pills that have never appeared. Kill the types, the
const, `HarnessModelDescriptor.options`, `deriveComposerPills`, and the SessionView pill-mapping
branch, plus their tests. What breaks: nothing observable — the UI paints identically.

**2. Runtime capability badges — flags nobody branches on, displayed through crossed wires.**
`HarnessRuntimeCapabilities` (preCompactionTrigger, subAgents, mcpSupport, fileEditing, toolUse)
is declared three times (here, `HarnessCapabilities` in harness-protocol, `agent-profile.ts` in
domain-model). On the descriptor it is display-only: harness-presentation.ts:147-150 turns flags
into badge strings, AgentProfile.tsx:385 renders `CapabilityBadge`s. The exhaustive branch search
found exactly ONE runtime branch in the whole repo — provisioner.ts:1510 on `mcpSupport` — and it
reads the adapter's own `HarnessCapabilities`, not this type. The smoking gun that the badges
carry no value: `core-api/routes/agent-profile.ts` maps `toolUse: caps.preCompactionTrigger`
(line 214) and `fileEditing: caps.subAgents` (line 218) — the UI has been displaying the WRONG
flags under hand-waving "rough proxy" comments and no one ever noticed, because no decision hangs
on them. harness-presentation's own comment admits the production shape is all-false
("Capabilities confirmed after first run"). Per the brief: a capability never tested at runtime is
DELETE. Kill `HarnessRuntimeCapabilities`, the descriptor's `runtime` field, `provenCapabilities`/
`capabilitySummary` badge plumbing, `mapCapabilities` + `AgentHarnessCapabilities`
(domain-model copy), and the badge rows. Keep `mcpSupport` and `returnEnforcement` on
harness-protocol's `HarnessCapabilities` — the two members with real branches. What breaks: the
Settings harness fold loses its capability chips and AgentProfile loses four badges — chips that
were partly false anyway.

**3. Dead enforcement channels.** `"sdk-inprocess"` — declared by zero adapters; its own doc
comment says "dead"; provision-return-hook.ts:78 keeps a no-op case "for backward compat" with
nothing. `"soft-continue"` — declared by zero production adapters (cursor-agent derives to
`"none"` via `deriveCliChannel`, cli-harness-adapter.ts:338-340); referenced only by tests. Union
shrinks 7 → 5; two no-op case arms and their tests die.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `derivePrimaryHarness` | function | UI:SetupFlow (team creation) | MERGE | Sole caller is SetupFlow.tsx — 9 lines with a hardcoded stale-model fallback (`"claude-sonnet-4-6"`); inline into core-ui, the package's only runtime code goes with it. |
| 2 | `ReturnEnforcementChannel` | type | AGENT: provisioner.ts:1456 → provision-return-hook dispatch; declared by every adapter | SIMPLIFY | The one genuinely load-bearing capability — real branch per channel. Drop dead members `"sdk-inprocess"` + `"soft-continue"` (declared by nobody, see feature kill #3); relocate beside `HarnessCapabilities.returnEnforcement` in harness-protocol. |
| 3 | `HarnessOptionControlKind` | type | DEAD | DELETE | Zero references anywhere, including inside its own package — `HarnessModelOptionControl` respells the same literals instead of using it. |
| 4 | `HarnessAccessMode` | type | DEAD (written, never read) | DELETE | Every descriptor construction stamps it; `.accessMode` is read by zero production files (only an e2e fixture literal). Produced-never-consumed decoration — delete type + descriptor field + `HarnessCapabilities.accessMode` + the construction sites. |
| 5 | `HarnessReadinessState` | type | UI:/settings harnesses + SetupFlow (row greying, CTA gating via harness-presentation.ts) | KEEP | Discovery produces it, the UI branches on it (`state !== "unauthenticated"` etc.) — a real runtime-tested capability. Moves to harness-protocol. |
| 6 | `HarnessAuthActionKind` | type | INTERNAL (member of #7 only) | MERGE | Zero external references; inline the union into `HarnessAuthActionDescriptor.kind`, stop exporting. |
| 7 | `HarnessAuthActionDescriptor` | interface | UI: SetupFlow.tsx:107-108, SettingsHarnesses.tsx:148, harness-presentation.ts:98,191 | SIMPLIFY | `kind`/`label`/`command` are read and branch the auth CTA — real. `description` and `credentialNames` are written (harness-discovery.ts:707-726) and read by nobody — delete both members. Moves to harness-protocol. |
| 8 | `HarnessOptionChoice` | interface | DEAD (member of dead #9) | DELETE | Part of the producer-less option-pill subsystem — feature kill #1. |
| 9 | `HarnessModelOptionControl` | type | DEAD (member of dead #10) | DELETE | Part of the producer-less option-pill subsystem — feature kill #1. |
| 10 | `HarnessModelOptionDescriptor` | interface | producer-less: every production `options:` write is `[]` | DELETE | No production code has ever constructed one; its only consumers (`deriveComposerPills`, SessionView pill branch) process a permanently empty array. Feature kill #1 — delete consumers too. |
| 11 | `HarnessModelDescriptor` | interface | UI: AgentEditor model dropdown (model-options-for-harness.ts), SetupFlow, SettingsHarnesses model rows | SIMPLIFY | `id`/`label`/`provider`/`selectable` are read. `options` (always `[]`, kill #1), `contextWindow` (copied at descriptors.ts:84, read nowhere), `inheritedFromGateway` (written, read nowhere — `selectable` does the actual filtering) — delete three members. Moves to harness-protocol. |
| 12 | `HarnessRuntimeCapabilities` | interface | display-only badges; zero runtime branches on the descriptor copy | DELETE | Feature kill #2. Flags declared three times across three packages; the only real branch (`mcpSupport`, provisioner.ts:1510) reads harness-protocol's `HarnessCapabilities`, not this. The agent-profile crossed-wire mapping (`toolUse ← preCompactionTrigger`, `fileEditing ← subAgents`) shipped unnoticed — proof the display carries no value. |
| 13 | `HarnessDiscoveryStatus` | interface | UI: settings/setup greying, toggle, disabled stamp (AM4) | KEEP | `state`/`disabled` are branched on in harness-presentation and the route stamps `disabled` from server_config — real. `version`/`reason` render in the fold. Moves to harness-protocol. |
| 14 | `HarnessCapabilityDescriptor` | interface | UI: GET /api/harnesses wire DTO → SetupFlow, SettingsHarnesses, SettingsAgents, AgentEditor, SessionView | SIMPLIFY | The package's actual product surface — the harness picker and settings screens live off it. Shrink: drop `accessMode` (#4), drop `runtime` (#12), collapse the duplicate provider lists (`runtime.modelProviders` written-never-read vs top-level `modelProviders` self-labeled "Legacy" yet the one actually read — keep one field). Moves to harness-protocol. |
| 15 | `HARNESS_OPTION_CONTROL_KINDS` | const | TEST-ONLY (own package's descriptor test) | DELETE | Only reference outside its declaration is its own test asserting the literal back at itself; part.ts redeclared a private copy rather than import it. Dead code plus a test that dies with it. |

## Types / DI ports

No DI ports. All 13 declarations verdicted above. The parallel copies that die with #12:
`AgentHarnessCapabilities` (framework/domain-model/src/agent-profile.ts:93-100) and
`mapCapabilities` (core-api/routes/agent-profile.ts:202-221). `HarnessCapabilities`
(harness-protocol) survives as the single flags home, shrunk to the branched-on members.

## Holes this leaves

1. **Settings/AgentProfile capability chips disappear** (feature kill #2). Users no longer see
   "File editing / Tool use / MCP / Sub-agents" chips. Two of the four were mapped from the wrong
   source flags, so the display was partly false; the honest replacement is nothing.
2. **Composer pill machinery gone** (feature kill #1). If a future harness wants per-model options
   (e.g. a thinking-budget selector), the subsystem must be rebuilt. Today it renders nothing for
   any of the five harnesses — rebuild when a real producer exists, not before.
3. **core-ui and conversation-parts gain a `@hyperidle/harness-protocol` dependency** for type-only
   imports (they lose the lighter-weight package). Zero runtime weight — every import is
   `import type` — but the UI's package.json now names the protocol package that also declares
   event-bus/work-intent-port deps. If governance forbids that edge, the fallback is SPLIT: a
   single `harness-descriptor.ts` file stays framework-side — but as a file inside
   harness-protocol, not as a package.
4. **`"soft-continue"` removal** means a future spawnable cursor-agent must re-add its channel
   member and hook case — one union member and one case arm, earned when cursor actually spawns.
5. The two in-package test files die with the package; descriptor-shape coverage continues to live
   where it already really lives — the adapter and route tests that construct descriptors.
