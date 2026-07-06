DOC-CLASS: minor

# POLISH-060 — v0.6.0 Human-Testing Fix Sweep

Remediation of the ~40 issues surfaced by founder human-testing of the notarized v0.6.0 desktop
build (`plans/v0.6.0-human-testing.md`). Root-caused by a 5-agent investigation swarm 2026-07-06;
every item below carries confirmed file:line causes. Built off `origin/main` (`b95e9b59`), NOT the
release branch — these are product changes; v0.6.0 is re-cut from main after they land.

## Phase 0 — Goal

**Value & audience.** The founder (and first real users) get a desktop app whose onboarding actually
wires up the machine's harnesses, whose settings/agent/knowledge/work surfaces are internally
consistent (rows + split-pane, not grey-box cards), and whose assistant chat + agent model-switching
actually work. Value: v0.6.0 is *usable end-to-end*, not just launch-able.

**Success (observable).** After this sweep: onboarding discovers harnesses + lets you pick a primary
one, and created agents use it; a selected folder becomes a filesystem; the assistant chat returns a
model reply; switching an agent to claude-code no longer errors; grey-box cards and aggressive empty
states are gone app-wide; knowledge dates are formatted and scope resolves to a real name; the Work
team page can create a bet and edit routines/agents.

**Scope.** Product-quality fixes to onboarding, settings, knowledge, work, assistant/provider
resolution, and the shared design-system list/empty patterns. **Non-goals:** no new primitives; no
release-mechanics changes (that's RELEASE-060); the native-titlebar item (T1) is exploratory and may
defer; "Boil the Lake" is intentional factory seed — not removed.

## Triage — real bug vs misread vs by-design

| Verdict | Items |
|---|---|
| **Misread — no code change** | "Settings title missing" (present at `SettingsPage.tsx:45` — tested DMG was stale; verify only). "Boil the Lake" default knowledge (intentional factory ETHOS seed `factory-bootstrap.ts:271`). |
| **By-design — but surfaced/parameterized here** | agents default to sonnet-4-6/builtin (`model-gateway.ts:94-100`) — kept as *fallback*, but onboarding-created agents now use the chosen primary harness. Scope-change feature exists (`ScopeChangeDialog.tsx`) but is authorship-gated/buried — surfaced. |
| **Real bug — fix** | everything else below. |

## Clusters (build order = dependency order)

### Cluster A — Design-system foundation (BLOCKS B–F; build first)
Root cause of most "grey box" + "aggressive empty state" complaints is one component.
- **A1. De-grey `ItemList` empty/error/loading.** `packages/design-system/src/ItemList.tsx:108-113` wraps
  empty/error/loading content in `bg-[var(--surface-container)]` (the grey box). AC: an empty `ItemList`
  renders its `EmptyState`/`ErrorState` on the page surface with no grey container; component test asserts
  no `--surface-container` wrapper class in the empty branch.
- **A2. `contained`→`flush` where rows shouldn't sit in a grey card.** AC: Work team lists + Connections
  render rows directly (no grey card) — covered by their cluster ACs, but the `flush` variant must exist
  and drop `--surface-container` (already does, `WorkOverview.tsx:154`).
- **A3. Compact desktop size for `Button`/`Input`.** `Button` carries `min-h-[44px]` (AQ-015 touch floor)
  unconditionally; settings forms read too tall on desktop. AC: a compact/desktop density that relaxes
  `min-h-[44px]` above the ≤1024px breakpoint (AQ-015 only requires 44px on touch), used by settings.
  Keep the 44px floor at ≤1024px. Component test asserts the relaxed min-height at desktop width.
- **A4. Sidebar must not scroll as a whole.** `AppShell.tsx:830` mount wrapper lacks height/overflow
  clamp, so the whole `<aside>` scrolls instead of only the fast-nav (`Sidebar.tsx:651` already
  `flex-1 min-h-0 overflow-y-auto`). AC: add `h-full overflow-hidden` to the mount wrapper (+ mobile
  drawer); only the fast-nav scrolls. E2E/DOM assert the aside is not the scroll container.

### Cluster B — Provider/model resolution (server; independent of A)
- **B1. Empty `Supported: .` error when switching agent/assistant to claude-code.** `validateAgentConfig`
  (`packages/server/src/routes/agents.ts:150-158`) reads `getCapabilities().modelProviders` which is `[]`
  for CLI adapters, disagreeing with the registration metadata `select()` uses (`["anthropic"]`,
  `adapter-pool.ts:607`). AC: switching an agent/assistant to a CLI harness (claude-code) with an
  anthropic model validates OK (no error); an actually-incompatible combo still errors with a NON-empty
  supported list. Test: `validateAgentConfig("claude-code","anthropic",…)` passes; provider-agnostic
  (empty caps) treated as "no check". Fix source-of-truth to registration metadata (or treat empty as
  agnostic) — pick the minimal correct interpretation.
- **B2. Assistant chat "The model provider returned an error. This is usually temporary."**
  `mapErrorToNotice` (`assistant-turn.ts:154-199`) buckets ALL unmapped throws (incl. `HttpError`
  401/400) into the generic "temporary" provider_error. AC: (a) reproduce via the server log line
  `[assistant-turn] unmapped error class` to get the REAL error; (b) map `HttpError` explicitly —
  401/403 → "check your key", 400 → "model/config" notice, not "temporary"; (c) verify the builtin
  adapter translates catalog ids (`claude-sonnet-4-6`) to valid Anthropic Messages-API model strings
  (a mismatch = deterministic 400 masquerading as "temporary"). Test the error-mapping; live-verify the
  chat returns a reply on a good key.
- **B3. Onboarding-created agents use the chosen primary harness, not hardcoded builtin.**
  `scaffold-agents.ts:99-101` hardcodes `harnessType:"builtin"`, `modelId:"claude-sonnet-4-6"`.
  Parameterize `persistScaffoldedAgents`/`scaffoldAgents` to accept a primary harness+model and thread
  it from team creation. AC: creating a team with primary harness=claude-code yields agents with
  `harnessType:"claude-code"`; default (unspecified) still falls back to builtin. (Depends on E cluster
  passing the choice; land the server seam here.)

### Cluster C — Onboarding (SetupFlow)
- **C1. Name placeholder** `SetupFlow.tsx:258` `"Tobias Grundtner"` → `"Your name"`. AC: placeholder text.
- **C2. Discover harnesses in onboarding + pick primary.** SetupFlow calls no discovery. Reuse
  `GET /api/harnesses` (the service Settings uses, `SettingsHarnesses.tsx:51`). AC: onboarding lists
  ready harnesses and lets the user choose a primary; choice flows into `POST /api/teams` → B3.
- **C3. Selected folder becomes a filesystem + git detection.** SetupFlow stores `repoPath` only as
  `teams.factoryDbPath` (`teams-routes.ts:405`); never calls `POST /api/filesystems`. AC: after
  onboarding, the chosen folder appears as a filesystem (`GET /api/filesystems?teamId=`) with
  `kind:"code"` and a detected branch; git-ness is detected (check `.git`, read branch).
- **C4. Remove out-of-place onboarding notifications.** The AB2 agent-health notifications fire on the
  fresh team (`teams-routes.ts:836-837` → `maybeNotifyAgentError`) and/or the auto-opened AssistantOverlay
  welcome (`AppShell.tsx:283`). AC: a freshly-onboarded team does not enqueue "needs attention"
  notifications within a grace window / for agents with zero sessions; the jarring popups are gone.

### Cluster D — Settings page
- **D1. Cursor shown as supported.** `cursor-agent` is a full `KNOWN_HARNESS_FAMILIES` member
  (`harness-capability-descriptors.ts:11`) but is permanently inert (`harness-adapter.ts:200`). AC:
  Settings does not present cursor as an authable/selectable backend (render disabled "not supported"
  or drop it); no "Log in to Cursor" CTA.
- **D2. Assistant is just another agent.** Remove the separate `SettingsAssistant` section + the
  `role !== "assistant"` filter (`SettingsAgents.tsx:752`); assistant appears as a row in the agent
  list using the shared edit flow. AC: assistant row is in the agents list; edited via the same panel.
- **D3. Built-in harness grouping + split-pane.** Group Models (tiers) + Credentials (LLM keys) under a
  "Built-in harness" section opening in `SplitView` (like review/artifacts). AC: built-in harness
  settings (tiers + its credentials) live together and open in the split-pane detail.
- **D4. Org chart edges + label.** Empty edges on a fresh team is real (teams create no `org_edges`);
  raw `team-<uuid>` leaks because the row renders `edge.target` raw (`SettingsOrgChart.tsx:226`). AC:
  team-mechanism edges render the team NAME (resolve via `data.teams`); empty state has explanatory copy
  (teams don't auto-create edges) OR team membership derives an edge. Pick the clearer of the two.
- **D5. Shared-backend consolidation.** Email hint "Used for notifications and login" (`SettingsProfile.tsx:99`)
  is wrong for local mode; Worker + Backend are separate sections but Worker is a facet of backend. AC:
  email hint is backend-aware/reworded; Worker folds into the Backend section (shown only in shared mode).
- **D6. Agent edit → split-pane + real config.** Edit is an inline table card (`SettingsAgents.tsx:815`)
  and `AgentEditDialog` is a modal. AC: agent edit opens in `SplitView` detail; model dropdown filters by
  the selected harness's providers (not full catalog, `SettingsAgents.tsx:576`); edit form fetches the
  role's system-prompt template (currently only the ADD form does, `:326`); a way to set a new/different
  role exists; switching harness reconciles the provider (no empty-Supported error — ties to B1).
- **D7. Harness section rows + split-pane + fix dead show/hide.** `HarnessCard` hand-rolls markup and its
  `Fold` "Show/Hide" does nothing when `models.length===0` (`HarnessCard.tsx:119,163`). AC: harness rows
  use `Row`/`ItemList`; the Show/Hide only renders when there's foldable content; a configurable harness
  opens settings in `SplitView`.
- **D8. Connections empty state.** `ItemList variant="contained"` renders an empty grey box for each of
  three groups (`SettingsConnections.tsx:343`). AC: empty groups show a proper `EmptyState` (or hide),
  no bare grey box (rides A1/A2).

### Cluster E — Knowledge
- **E1. Format last-edited date.** `KnowledgeDetail.tsx:1011` renders raw ISO; use `absoluteDateTime`
  from `packages/shared/src/format/time.ts:142`. AC: formatted date, not ISO.
- **E2. Resolve scope to a real name.** Detail renders bucket label "Team" (`scopeKindToLabel`) and the
  breadcrumb pushes raw deprecated `item.scope` (`KnowledgeDetail.tsx:750`). AC: server GET resolves
  `scopeId`→`scopeName` (team/topic name) and web renders "scope: Team Nimmly" style; deprecated
  `KnowledgeScope` path dropped from the breadcrumb.
- **E3. Surface scope-change.** The action is buried in an overflow menu + authorship-gated so factory-
  agent-owned items show no entry point (`KnowledgeDetail.tsx:406,579`). AC: scope-change is reachable
  for user-editable items; factory items read as read-only (not "silently no control"). Confirm the gate.

### Cluster F — Work views
- **F1. Grey boxes → rows/flush.** WorkTeam routines/agents lists are `contained` (grey); Active Bets is
  a hand-rolled grey `BetRow`/`StatTile` (`WorkTeam.tsx:749,721`); all of WorkRoutine is hand-rolled grey
  cards (`WorkRoutine.tsx:223,328,345,366`). AC: these render as `Row`/`ItemList variant="flush"` /
  `KeyValue`, no gratuitous `--surface-container` panels.
- **F2. Create-bet button on team page.** `WorkTeam` Active Bets `SectionLabel` has no action. AC: a
  "+ New bet" button routes to the existing `/work/bet/new` (mirrors Routines/Agents trailing action).
- **F3. Routine/agent edit in split-pane.** WorkRoutine is a read-only full page (no prompt editing);
  agent edit is a modal. AC: routine + agent detail open as `SplitView` destination (like
  review/conversations); routine prompt/attachments are editable.

### Cluster T — Native titlebar (exploratory, may defer)
- **T1.** Electron windows use the default OS frame (`main.ts:497,597` — no `titleBarStyle`). Claude-
  desktop-style needs `titleBarStyle:"hiddenInset"` (macOS) + a web `-webkit-app-region:drag` strip
  (net-new shell component). AC (if built): traffic-lights inset into a custom drag strip; app content
  fills the frame. Defer if it risks the sweep's timeline — flagged as the one net-new UI piece.

## Definition of Done
- Every Cluster A–F AC proven: component/unit tests for logic (validator, error-mapping, scope
  resolution, ItemList de-grey, filesystem registration, harness parameterization); DOM/component tests
  for the row/empty/split-pane changes; **painted proof** (screenshot of the running app) for the visual
  clusters (grey-box removal, empty states, settings/work split-pane, onboarding harness picker).
- Assistant chat returns a real model reply on a valid key (live proof, not stub).
- `npm run verify` green on the final commit (check + lint + knip + test:all + build + attestation).
- Misreads documented (no dead work); T1 done or explicitly deferred with reason recorded here.
- Reviewer (`/pipeline:review`) pass on the diff before ship.

## Required reading (downstream agents)
- `plans/v0.6.0-human-testing.md` — the raw founder findings.
- The 5 investigation reports are inlined in the orchestrator context; key file:line anchors are in each
  cluster above.
- `packages/design-system/src/{ItemList,Row,SplitView,EmptyState,Button,Input}.tsx` — the canonical
  primitives every visual fix must consolidate onto (EXTRACT, don't invent).
