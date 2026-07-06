# Track AV: First-Run Usability & Product Polish (v0.6.0 human-testing)

**What this track is (founder, 2026-07-06).** The notarized v0.6.0 desktop build was human-tested end-to-end for the first time. It **launches and is signed/notarized**, but it is **not yet usable end-to-end**: onboarding doesn't actually configure the machine's harnesses, several settings/knowledge/work surfaces present raw internals (raw UUIDs, ISO dates, bucket words) or reinvent list/detail layout as grey-box cards, and a few flows error outright. This track is the remediation of the *larger* human-testing findings — the ones that are genuine design/IA decisions or introduce a concept — so that a fresh user can install v0.6.0, get their harnesses wired, and use the daily surfaces without hitting raw internals or dead controls.

**The one boundary / frame.** **Consolidate onto the app's existing solved patterns; do not invent.** The design system already ships the primitives these surfaces should use — `Row`/`ItemList` for lists, `SplitView` for detail/edit (already adopted by Conversations and review/artifacts), `EmptyState` for empties, and the shared `absoluteDateTime` clock. Most findings are "this surface hand-rolled a grey card / a modal / a raw string instead of using the primitive." The frame is *extract the existing pattern*, per the standing rule (`feedback_design_extract_before_invent`). The **only** genuinely new nouns this track introduces are two, both flagged for `/refine`: a **primary harness** (the machine's default harness, chosen at onboarding, that new agents adopt — AV1) and a first-class, user-definable **agent role** (AV2). No new primitives beyond those.

**Already done / decided (do NOT redo).** On branch `fix/v060-polish` (POLISH-060), landing to `main` ahead of this track:
- **Cluster A — design-system foundation:** `ItemList` empty/error/loading states no longer paint the grey `--surface-container` box; `variant="flush"` renders rows on the page surface; `Button`/`Input` gained a compact desktop density (relaxed min-height above 1024px, 44px touch floor kept ≤1024px); the sidebar mount clamps overflow so only the fast-nav scrolls.
- **Cluster B — provider/model resolution:** `validateAgentConfig` now treats an empty `modelProviders` (CLI/inherited-login harness) as provider-agnostic, killing the "Harness 'claude-code' does not support provider 'anthropic'. Supported: ." (empty-list) error; `mapErrorToNotice` maps `HttpError` 401/403 → auth notice and 400 → config notice (no longer "usually temporary"); **the server seam for AV1 is already in place** — `scaffoldAgents`/`persistScaffoldedAgents` accept an optional primary harness and `CreateTeamRequest` carries `primaryHarness`.
- **Small mechanical batch (same branch):** name placeholder → "Your name"; knowledge last-edited date formatted; cursor-agent rendered non-authable in settings; org-chart edge shows the team **name** not `team-<uuid>`; connections empty state; WorkTeam lists de-greyed + "+ New bet" button. These specific fixes are **out of scope** for every WP below.
- **Not a bug:** "Boil the Lake" is an intentional factory ETHOS-principle seed (`factory-bootstrap.ts`) — do not remove. The `claude-sonnet-4-6`/`builtin` default stays as the *fallback* when no primary harness is chosen.

**Scope rules.** Every WP here consolidates onto an existing primitive or established route — cite the real component/table/route it extends in "What exists today", never rebuild it. UI WPs reuse `Row`/`SplitView`/`EmptyState`; no new list/detail/empty patterns. Backend touches reuse the existing routes (`/api/harnesses`, `/api/filesystems`, `/api/knowledge`, `/api/agents`, `/api/teams`). ETHOS-aligned: fixes for a fast small team's first-run experience, not enterprise settings ceremony. Each WP is refined + built in **its own** pipeline session.

**Reference.** `plans/v0.6.0-human-testing.md` (raw founder findings); `.pipeline/work-packages/POLISH-060/requirements.md` (triage + root-cause file:line anchors from the 5-agent investigation); `packages/design-system/src/{Row,ItemList,SplitView,EmptyState}.tsx`; `packages/web/src/pages/{SetupFlow,KnowledgeDetail,WorkTeam,WorkRoutine}.tsx`, `packages/web/src/settings/*`; `packages/server/src/routes/{harnesses,filesystems,teams-routes,knowledge,agents,assistant}.ts`, `packages/server/src/harness/harness-discovery.ts`, `packages/server/src/services/scaffold-agents.ts`.

---

### AV1 — Onboarding actually configures the machine (harness discovery, primary harness, filesystem)

**Work package.** As a new user setting up HyperIdle for the first time, I want onboarding to **discover the harnesses installed on my machine, let me pick a primary one, and register the folder I select as a real working filesystem**, so that when setup finishes my agents run on the harness I chose (not a hardcoded default) and my repo is actually connected — instead of the current flow that only takes an Anthropic key and quietly leaves everything on `builtin`/`sonnet-4-6`. Setup should also stop firing the jarring "needs attention" notifications the moment it completes.

**Why this matters.** Onboarding is the first thing every user touches and today it silently mis-configures them: harnesses they have installed are ignored, the primary-harness choice doesn't exist, the folder they pick is stored as a bare path (never a filesystem, never git-detected), and fresh agents immediately trip health notifications. A user who installs v0.6.0, follows setup, and ends up with agents that don't use their tools will conclude the product is broken. Cost of not building: the single highest-traffic flow keeps producing broken first sessions. The specific person: the first-run user (and the founder demoing to them).

**Type.** frontend + backend (onboarding UI + team/filesystem wiring).

**What exists today.** `packages/web/src/pages/SetupFlow.tsx` collects name, an Anthropic API key, a repo path, and a team preset; on submit it does `POST /api/users` → `POST /api/teams` → `PUT /api/credentials/anthropic_api_key` and navigates to `/work?onboarding=true`. The working harness-discovery service Settings uses — `discoverLocalHarnesses()` (`packages/server/src/harness/harness-discovery.ts`) surfaced at `GET /api/harnesses` — is **never called from onboarding**. A first-class filesystem registry exists (`filesystems` table, `POST /api/filesystems`, `SettingsFilesystems.tsx`) but onboarding only stores the folder as `teams.factoryDbPath` and never registers it or inspects it for git. Cluster B already added the server seam: `persistScaffoldedAgents`/`scaffoldAgents` accept an optional primary harness and `CreateTeamRequest.primaryHarness` exists. The AB2 agent-health path (`maybeNotifyAgentError` in `teams-routes.ts`) and the `?onboarding=true` AssistantOverlay auto-open are what surface the "out of place" notifications on a fresh team.

**What's genuinely missing.** The onboarding UI to discover + choose a primary harness and thread that choice into `POST /api/teams` (consuming the existing seam); the post-team registration of the selected folder as a filesystem with git detection (a `.git` check + current-branch read feeding `resourceRef.branch`); and suppression of the fresh-team notification burst. The **"primary harness"** concept is new and needs `/refine` to pin its shape (a team/workspace default vs. a per-agent stamp).

**Depends on.** None. (The server-side scaffold seam it consumes already landed on `main` via POLISH-060 Cluster B.)

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first (introduces the new load-bearing noun **primary harness**; must pin whether it's a persisted team/workspace default or only a setup-time stamp on scaffolded agents).
- **Design:** Light — extends `SetupFlow` and reuses the Settings harness-list pattern; single-variant `/design` for the harness-picker + filesystem-confirm step.

**Human concept review.** Yes — first-run flow and a new user-facing concept (primary harness); getting the setup shape wrong is expensive.

**Acceptance criteria.**
- During onboarding the user sees the harnesses actually installed on their machine (same discovery source Settings uses) and can select which one is primary; a machine with, e.g., claude and codex installed shows both as choices, not just a key field.
- After onboarding completes, agents created for the new team use the chosen primary harness (observable via the agents list / `GET /api/agents`); when the user makes no explicit choice, agents fall back to the existing `builtin`/`sonnet-4-6` default.
- The folder selected during onboarding appears as a registered filesystem for the new team (`GET /api/filesystems?teamId=` returns it) with `kind:"code"`, and its git branch is detected and recorded when the folder is a git repo.
- A freshly-onboarded team does not enqueue "needs attention"/agent-health notifications for agents that have never run a session, and the immediate post-setup popup burst the founder flagged is gone.
- Onboarding still succeeds (creates user + team + credential) when no harnesses are installed and only the builtin key path is used — the new discovery step degrades gracefully rather than blocking setup.

**Validation scenarios.**
- Given claude-code is installed and detected, when the user completes onboarding choosing claude-code as primary, then the created agents report `harnessType:"claude-code"` and the selected repo shows up as a filesystem with its branch detected.
- Given no external harness is installed, when the user completes onboarding with only an Anthropic key, then setup still succeeds and agents fall back to builtin/sonnet-4-6.
- Given onboarding just completed, when the team page first loads, then no agent-health "needs attention" notification is enqueued for the brand-new agents.

**Plan calls.** Run `/refine` first to pin the **primary harness** noun (persisted default vs. setup-time stamp), then a standard architecture pass. Plan the onboarding step that consumes `GET /api/harnesses` and threads the choice into `CreateTeamRequest.primaryHarness`; the post-team `POST /api/filesystems` call with git detection (where the `.git`/branch probe runs — desktop bridge vs. server); and the notification-suppression approach for fresh teams. Likely splittable during architecture into (a) harness discovery + primary choice + agent assignment, (b) folder→filesystem+git, (c) notification suppression — keep them one WP unless architecture argues otherwise.

**Contracts / constraints.**
- Reuse `GET /api/harnesses` / `discoverLocalHarnesses` — do not fork a second discovery path.
- Reuse `POST /api/filesystems` and the existing `filesystems` table — no new folder-registration model.
- Consume the existing `CreateTeamRequest.primaryHarness` seam — do not re-stamp agents in a new place.
- Setup must never hard-block on harness discovery (graceful degrade to builtin).
- No new notification system — suppress/guard the existing one.

**Out of scope.**
- The name-placeholder fix (done in POLISH-060).
- Redesigning the Settings harness list (AV2).
- Multi-harness-per-agent or per-agent harness overrides beyond the primary default.

**Effort.** L (~2–3d)

---

### AV2 — Settings information architecture: rows, split-pane, assistant-as-agent, roles

**Work package.** As a user managing my team in Settings, I want the settings surfaces to behave like the rest of the app — agents (including the Assistant) in a single list, detail/edit opening in the split-pane view instead of inline cards or modals, the built-in harness's models and credentials grouped in one place, and backend/worker settings consolidated — and I want to be able to **define a new role for an agent** and have the model dropdown only offer models the chosen harness supports. So that Settings stops feeling like a different app with dead buttons, dual-tracked entities, and controls that error or don't adapt.

**Why this matters.** Settings is where the user configures everything, and today it's the least consistent surface: the Assistant is dual-tracked (a bespoke editor plus exclusion from the agent list), agent edit is an inline table card while everything else uses split-pane, the built-in harness's config is scattered across two disconnected sections, the harness list has a show/hide button that does nothing, and there's no way to define a role. Each is a papercut; together they read as unfinished. Cost of not building: the configuration surface actively undermines trust in the product. Beneficiary: any user who opens Settings to change how their agents work.

**Type.** frontend (with light backend for role definition + assistant unification).

**What exists today.** `packages/web/src/pages/SettingsPage.tsx` renders ~13 stacked sections. The Assistant is dual-tracked: a bespoke `SettingsAssistant` section plus a `role !== "assistant"` filter in `SettingsAgents` (`:752`). Agent edit is an inline `<tr>` card in `SettingsAgents` (and `AgentEditDialog` is a modal); its model dropdown is the full `MODEL_CATALOG` unfiltered by harness; the edit form never fetches the role's system-prompt template (only the add form does); role is a closed `AGENT_ROLE_CATALOG` select. Built-in harness config is split across `SettingsModels` (tiers) and `CredentialsTab` (LLM keys). `SettingsWorker` and `SettingsBackend` are separate sections though Worker is a facet of shared-backend mode; the profile email hint reads "Used for notifications and login." `HarnessCard` hand-rolls its markup and its `Fold` show/hide renders nothing when a harness has no models. `SplitView` (adopted by Conversations + review) and `Row`/`ItemList` already exist and are used elsewhere in settings (Connections, Credentials, OrgChart). Cluster B already fixed the empty-`Supported:` validator so switching an agent to a CLI harness no longer errors.

**What's genuinely missing.** The consolidation work: unify the Assistant into the agent list on the shared edit flow; move agent edit + built-in-harness config + configurable-harness detail into `SplitView`; filter the model dropdown by the selected harness's providers; load the role template in the edit form; a first-class, user-definable **agent role** (new noun) replacing the closed catalog select; fold Worker into Backend and make the email hint backend-aware; gate the harness show/hide on real foldable content.

**Depends on.** None hard. (Relies on Cluster A `flush`/de-grey and Cluster B validator, both landing on `main` via POLISH-060.)

**Complexity.** L — spans many settings sections and introduces a noun; **expected to split during `/architecture`** into roughly: (a) Assistant-as-agent unification, (b) built-in-harness + harness-section into SplitView, (c) agent-edit SplitView + harness-filtered models + role definition, (d) backend/worker consolidation + email hint.

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first (introduces the user-definable **agent role** noun and reshapes how the Assistant is modeled in settings).
- **Design:** Required — settings IA redesign; multi-variant `/design` + human review for the split-pane/row restructure and the role-definition surface.

**Human concept review.** Yes — a large redesign of a core surface plus a new capability (define-a-role); high cost of getting the shape wrong.

**Acceptance criteria.**
- The Assistant appears as a row in the agents list and is edited through the same panel as any other agent; there is no separate Assistant-only section and no `role !== "assistant"` exclusion.
- Agent detail/edit opens in the `SplitView` pattern (as review/conversations do), not an inline table card or a modal; the model dropdown offers only models compatible with the selected harness's providers; switching harness never produces an empty-supported error (rides Cluster B).
- The agent edit surface lets the user set a **new or different role** (not just pick from a fixed list), and editing a prepopulated agent loads that role's default system-prompt template.
- The built-in harness's models (tiers) and its credentials are grouped together and open in the split-pane detail; a configurable harness in the harness list opens its settings in the split-pane, and the show/hide affordance only renders when there is something to expand.
- Worker settings are consolidated under the Backend section (shown only in shared-backend mode) and the profile email hint no longer claims "notifications and login" in local mode.

**Validation scenarios.**
- Given the agents list, when the user opens it, then the Assistant is one of the rows and clicking it opens the same split-pane editor as other agents.
- Given an agent on a CLI harness, when the user opens the model dropdown, then only that harness's compatible models are offered and saving does not error.
- Given the user wants a bespoke role, when they edit an agent, then they can define a new role and the system-prompt template reflects it.
- Given local (non-shared) backend mode, when the user views profile/backend settings, then Worker is not shown as a separate top-level section and the email hint is not the "notifications and login" copy.

**Plan calls.** Run `/refine` to pin the **agent role** noun (free-form vs. catalog-plus-custom) and the assistant-unification shape, then `/design` (multi-variant) for the settings IA. Architecture should split this into the sub-WPs listed under Complexity and sequence them; reuse `SplitView` + `Row` exactly as ReviewComposition/Conversations do (per-surface `surfaceKey`s). No new list/detail primitive.

**Contracts / constraints.**
- Reuse `SplitView`, `Row`/`ItemList`, `EmptyState` — no new layout primitives.
- The Assistant remains a normal agent (`role:"assistant"`, `ast-<userId>`) — unification is UI/flow, not a data-model fork.
- Model-dropdown filtering derives from the harness's declared providers (the registration-metadata source Cluster B unified on).
- Back-compat: existing agents/roles keep working; a custom role is additive.

**Out of scope.**
- Cursor-agent authability (already made non-authable in POLISH-060), org-chart label + connections empty state (done in POLISH-060).
- Onboarding harness/primary selection (AV1).
- Any change to how agents actually run (harness/provider runtime) beyond what Cluster B landed.

**Effort.** L (~4–5d across the sub-WPs)

---

### AV3 — Knowledge scope reads as a name, and can be changed

**Work package.** As a user browsing Knowledge, I want a knowledge item's scope to read as the actual thing it's scoped to — "Team Nimmly" or "Development Practice", not the bucket word "team" — and I want a clear, reachable way to change an item's scope (with factory-seeded items clearly read-only). So that scope is meaningful and editable instead of showing a raw enum I can't act on.

**Why this matters.** Scope is how knowledge is organized, and today it renders as a generic bucket word or a raw deprecated enum, with the scope-change action buried and gated so it looks absent. A user can't tell what an item is scoped to or how to move it. The confusion is compounded by two competing scope vocabularies in the code. Cost of not building: knowledge organization stays illegible and effectively immutable to the user. Beneficiary: anyone curating team/practice knowledge.

**Type.** frontend + light backend (name resolution in the knowledge route).

**What exists today.** Two scope models coexist: the kernel `scopeKind` (7-value) + `scopeId` on `knowledgeItems` (`packages/db/src/schema.ts:589`), and a deprecated 3-value `KnowledgeScope` (`packages/fabric/src/types.ts`). `scopeKindToLabel` (`packages/web/src/utils/scope-labels.ts`) collapses kinds to "Private/Team/Shared". `KnowledgeDetail.tsx` renders the bucket label in the scope row and pushes the **deprecated** `item.scope` raw into the breadcrumb (`:750`). The server `GET /api/knowledge/:id` spreads raw `scopeKind`/`scopeId` and never joins the referenced entity's name. A full scope-change flow exists (`ScopeChangeDialog.tsx` → `PATCH /api/knowledge/:id/scope`) but sits in an overflow menu behind an authorship gate, so factory-agent-owned items show no entry point. (The last-edited date formatting was already fixed in POLISH-060.)

**What's genuinely missing.** Server-side resolution of `scopeId` → a display `scopeName` (team/practice/product name) and web rendering of it; retirement of the deprecated `KnowledgeScope` breadcrumb path in favor of the kernel `scopeKind`/`scopeId`/`scopeName`; and a discoverable scope-change affordance with factory items presenting as explicitly read-only.

**Depends on.** None.

**Complexity.** M

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first (must reconcile the two scope vocabularies and settle how scope is presented; conceptual, not just a render tweak).
- **Design:** Light — extends `KnowledgeDetail`; single-variant `/design` for the scope row + change affordance + read-only state.

**Human concept review.** No — a scoped-to-one-surface presentation fix; forecast No (will park only if `/refine` marks the scope-vocabulary reconciliation a significant doc change).

**Acceptance criteria.**
- A team/practice/product-scoped knowledge item displays the resolved entity name (e.g. "Team Nimmly", "Development Practice"), not the generic bucket word or a raw id, in both the scope row and the breadcrumb.
- The server returns a resolved `scopeName` alongside `scopeKind`/`scopeId` for scoped kinds; unscoped/factory items render sensibly (e.g. "Factory") without a dangling id.
- The deprecated `KnowledgeScope` path is removed from the detail breadcrumb; scope presentation reads from the kernel `scopeKind`/`scopeId`/`scopeName`.
- A user can reach and use the scope-change action for items they may edit; factory-seeded items are presented as explicitly read-only (not silently actionless).

**Validation scenarios.**
- Given a knowledge item scoped to a team, when the user opens it, then the scope shows the team's name and the breadcrumb shows a resolved segment, not "team".
- Given a user-editable knowledge item, when the user looks for scope controls, then a change-scope action is reachable and works.
- Given the factory "Boil the Lake" principle, when the user opens it, then it reads as read-only/factory rather than showing a broken or absent scope control.

**Plan calls.** Run `/refine` to reconcile the scope vocabularies and settle presentation, then a standard pass. Plan the server name-resolution join (`teams`/practice/product) in `GET /api/knowledge/:id` (+ list), the web rendering, and the read-only vs. editable gate. Keep the change to presentation + reachability; do not redesign the scope data model.

**Contracts / constraints.**
- Do not change the kernel `scopeKind`/`scopeId` schema; add a resolved `scopeName` in the response, don't persist a denormalized name.
- Retire the deprecated `KnowledgeScope` usage in the detail view; do not add new usages.
- Factory items remain immutable via the existing authorship/factory gate — surface that state, don't grant edits.

**Out of scope.**
- The date-formatting fix (done in POLISH-060).
- A knowledge create/edit redesign beyond scope.
- Reworking `scopeKindToLabel`'s bucket labels where a resolved name isn't applicable.

**Effort.** M (~1d)

---

### AV4 — Work editing surfaces in the split-pane pattern

**Work package.** As a user working a team's routines and agents, I want their detail to open in the same split-pane view the app uses for artifacts and review — and I want to actually **edit a routine's prompt and attachments** — so that routines/agents are first-class editable surfaces instead of a read-only page and a modal, and so the Work views stop rendering their content as hand-rolled grey cards.

**Why this matters.** Routines and agents are core Work objects, but today a routine opens a read-only full page (you can pause/trigger/delete but not edit the prompt) and an agent opens a modal — both diverging from the split-pane pattern the rest of the app settled on, and the routine page renders every section as a grey card. A user who wants to tweak what a routine tells its agent simply can't. Cost of not building: routines are effectively uneditable and the Work surface stays inconsistent. Beneficiary: anyone tuning a team's recurring work.

**Type.** frontend.

**What exists today.** `packages/web/src/pages/WorkRoutine.tsx` is a full read-only page (config as `KeyValue`s; only pause/trigger/delete actions) with every section hand-rolled as a `bg-[var(--surface-container)]` card. Agent edit is `AgentEditDialog` (a modal with a raw `<textarea>`). `SplitView` is already adopted by review (`ReviewComposition.tsx`) and Conversations (`Conversations.tsx`) with ratio persistence via `useUiPreference(surfaceKey)`. POLISH-060's small batch de-greyed the WorkTeam lists and added the create-bet button, but deliberately left WorkRoutine's card restructuring to this WP.

**What's genuinely missing.** Opening routine and agent detail as the destination pane of a `SplitView` (origin = the WorkTeam list); making the routine's prompt/attachments editable and savable; and de-greying WorkRoutine's hand-rolled cards onto `Row`/`KeyValue` as part of that redesign.

**Depends on.** None hard. (Builds on Cluster A + the POLISH-060 WorkTeam de-grey on `main`.)

**Complexity.** M

**Pre-build gates.**
- **Refinement:** Not required — goal is clear (adopt the existing SplitView pattern + make the routine editable); no new noun.
- **Design:** Required — introduces editing surfaces where there were none; single-to-multi-variant `/design` for the routine/agent split-pane detail + editable routine form.

**Human concept review.** Yes — introduces new editing surfaces on a core object (editable routine); worth a founder look at the shape.

**Acceptance criteria.**
- Routine detail opens as the destination pane of a `SplitView` (origin = the team's list), matching the review/conversations pattern with persisted ratio.
- The routine's prompt and attachments are editable and savable from that detail pane; a saved change is reflected on reload.
- Agent detail opens in the same split-pane pattern rather than a modal.
- WorkRoutine's content renders on `Row`/`KeyValue`/page surface — no gratuitous `--surface-container` grey cards.

**Validation scenarios.**
- Given a team with a routine, when the user clicks it, then the routine opens in a split-pane detail (not a full-page nav or modal) and the list stays visible on the left.
- Given a routine detail, when the user edits its prompt and saves, then the change persists and shows on reload.
- Given an agent row, when the user opens it, then its detail/edit appears in the split-pane pattern, not a modal dialog.

**Plan calls.** Standard pass after `/design`. Reuse `SplitView` + `useUiPreference` exactly as `ReviewComposition.tsx`/`Conversations.tsx` do (choose `surfaceKey`s like `work.routine`, `work.agent`); move the `AgentEditDialog` body into the destination pane and add editable prompt/attachment fields to the routine detail. No new container primitive.

**Contracts / constraints.**
- Reuse `SplitView` / `useUiPreference` — no bespoke split layout.
- Routine editing goes through the existing routine update route/contract; no new routine model.
- De-grey by adopting `Row`/`KeyValue`, not by hand-tuning card backgrounds.

**Out of scope.**
- The WorkTeam list de-grey + create-bet button (done in POLISH-060).
- Bet detail/editing surfaces.
- New routine capabilities beyond editing prompt/attachments.

**Effort.** M (~1–2d)

---

### AV5 — Native window titlebar (Claude-desktop-style)

**Work package.** As a desktop user, I want HyperIdle's window to integrate its title bar into the app the way Claude Desktop does — the OS traffic-light controls inset into a custom top strip that's part of the app's design — so that the window doesn't look like a generic Electron shell with a bolted-on OS title bar.

**Why this matters.** The default OS-drawn title bar reads as "unfinished Electron app" and wastes the top strip; a hidden-inset frame with an app-designed titlebar is a small, high-visibility polish that makes the product feel native. This is exploratory (the one net-new UI piece in this track) and lowest-urgency, but it's a concrete, shippable change with an observable result, not research. Beneficiary: every desktop user (and the founder's demo). Cost of not building: the app keeps looking generic at the top; acceptable to defer, hence lowest priority.

**Type.** frontend (Electron main config + a web shell component).

**What exists today.** Both `BrowserWindow`s in `packages/desktop/src/main.ts` (`:497` local, `:597` shared) use the default OS frame — no `titleBarStyle`, no `titleBarOverlay`. There is **no** custom titlebar component and **no** `-webkit-app-region` drag region anywhere in `packages/web`/`packages/desktop`. The desktop context is already detectable via `window.__HYPERIDLE__` (used at `AppShell.tsx:211`).

**What's genuinely missing.** A `titleBarStyle:"hiddenInset"` (macOS) frame on both windows and a small web titlebar strip with a `-webkit-app-region: drag` region (and `no-drag` on interactive children) that fills the top and insets content, rendered only in the Electron context. This is the one genuinely new shell component in the track.

**Depends on.** None.

**Complexity.** M

**Pre-build gates.**
- **Refinement:** Not required — goal is clear (native hidden-inset titlebar); no new domain noun.
- **Design:** Required — a new shell UI element; single-variant `/design` for the titlebar strip (height, drag region, content inset, warm-tint background per AQ-018).

**Human concept review.** Yes — a new base shell element visible on every screen.

**Acceptance criteria.**
- Both desktop windows use a hidden-inset title bar so the OS traffic-light controls sit inset within the app's top strip (macOS), and the window remains draggable via that strip.
- A web titlebar strip renders only in the desktop (Electron) context; interactive controls in it are click-through (`no-drag`) while the strip itself is a drag region.
- App content is inset below the strip and not obscured by the window controls; the strip uses the app's warm-tint background (not the current cool `#1a1a2e`).
- The browser (non-Electron) build is unaffected — no titlebar strip and no layout shift.

**Validation scenarios.**
- Given the macOS desktop app, when it launches, then the traffic-lights are inset into an app-styled top strip and the window can be dragged by that strip.
- Given a control in the titlebar strip, when the user clicks it, then it responds (not swallowed by the drag region).
- Given the browser build, when it loads, then no titlebar strip appears and content starts at the top as before.

**Plan calls.** Standard pass after a single-variant `/design`. Plan the `titleBarStyle` on both `BrowserWindow`s, the web strip component gated on `window.__HYPERIDLE__`, the drag/no-drag regions, and the content inset. macOS-first; Windows/Linux `titleBarOverlay` may be a follow-up. Verify against a real launched desktop window (painted proof), not just the browser.

**Contracts / constraints.**
- Gate the strip strictly on the desktop context; zero effect on the browser build.
- Keep the OS window controls functional — correct drag/no-drag regions.
- Warm-tint background per AQ-018; no new color tokens off-scale.

**Out of scope.**
- Custom min/max/close buttons drawn by the app (use the OS traffic-lights via hidden-inset).
- Windows/Linux window-control overlay parity (macOS-first; possible follow-up).
- Any non-titlebar shell/layout change.

**Effort.** M (~1–2d)
