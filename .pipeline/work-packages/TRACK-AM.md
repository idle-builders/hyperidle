# Track AM: Conversation Experience

Source: the t3code study of 2026-06-16 (`plans/chat-redesign/` — annotated t3code + GitHub Copilot screenshots; `plans/chat-redesign/t3code-reference.md`; t3code source read at `/tmp/t3code-explore`). The founder's observation: t3code "nails" three things HyperIdle should learn from — (1) it auto-detects whichever agent backend is installed (Claude, Codex, OpenCode, Cursor, Grok) and renders **every** one through one beautiful, uniform chat; (2) the onboarding/settings flow for those backends; (3) the in-composer session dial-in. The chat experience itself — the way agent activity, diffs, plans, and commits embed inline as a calm, foldable grammar — is what we want as HyperIdle's **normal** conversation style.

**Why a separate track.** This is the conversation *rendering* layer and the *harness integration* layer — broader than Track AL (review-experience polish) and orthogonal to it. AL adds reviewer interactions (anchored comments) on top of artifacts; AM defines how agent **activity** renders in the conversation in the first place, the capability-driven composer, and the harness normalization/onboarding underneath. AM provides the rendering substrate AL's review interactions sit within; the two share the thread/harness data model but no UI seam, so they proceed in parallel.

**Scope rules.** The conversation interaction layer and the harness-integration layer only. **No color work** — the Hearth palette and all `AESTHETICS.md` tokens stay exactly as-is; this track is structure, information architecture, and the rendering grammar (the founder's explicit instruction: "we find our own colors"). Reuse the existing Thread/Message primitives (`plain | review | questionnaire | verdict`) and the verdict semantics unchanged — AM renders *within* them, it does not reshape them. The `BlockKind` prose vocabulary (`docs/blocks/`) is untouched and unrelated — it is markdown-body content storage, NOT conversation rendering; the new conversation grammar must take a **different** canonical name (see AM1). `npm run verify` must pass after each workpackage merges.

**Reference docs:** `plans/chat-redesign/t3code-reference.md` (distilled t3code structure/IA/aesthetic learnings), `plans/chat-redesign/` (screenshots), `docs/human-interface-layer/thread-primitive.md`, `docs/information-architecture/conversations-view.md`, `docs/information-architecture/app-shell-always-present.md`, `docs/agent-layer/index.md`, `packages/shared/src/harness/harness-events.ts`, `packages/shared/src/thread.ts`, `packages/web/src/components/SessionActivityPanel.tsx`, `packages/design-system/src/ThreadShell.tsx`, `.claude/rules/aesthetic-quality.md`.

---

## Design-exploration axes (carried, NOT pre-resolved)

These are the hard direction forks the founder will decide by **seeing rendered variants** in `/design` + `/human-design-review` — they are deliberately left open in the specs below (per the Pre-build gates discipline). Each WP names the axis it carries.

1. **Adoption model** (AM1/AM2) — *additive grammar* (review/decision spine stays; activity folds in) vs *transcript-first* (the conversation becomes a live work-log; reviews are one part within it) vs *mode-split* (chat threads get the transcript; review threads keep today's decision layout). This decides how far t3code's style replaces HyperIdle's review-centric conversation.
2. **Pane structure** (AM2) — *3-pane with a tabbed contextual panel* (Diff/Artifact/Files/Preview) vs *2-pane inline* (artifacts render in the stream) vs *single companion* (one untabbed artifact slot, today's companion layout made persistent).
3. **Session dial-in placement** (AM4) — *composer pills per-thread* vs *per-message turn* vs *agent-config only*.
4. **Harness scope** (AM3) — *native-only* (capability-descriptor pattern for HyperIdle's own agents) vs *native + external BYO* (also detect/normalize Claude Code, Codex, OpenCode… the user has) vs *external-adapter* (agents run on BYO backends). This one is a **strategic concept fork**, resolved in AM3's `/concept`, because it changes scope — not just form.

---

### AM1 — Conversation activity grammar

**Workpackage.** As a founder watching an agent work in a thread, I want everything the agent does — tool calls, file reads and edits, diffs, reasoning, plans, shell commands, commits, and errors — to render inline in the conversation as one calm, uniform, scannable grammar that collapses to a single "Worked for Xs" summary once the turn settles, so that I can follow or skim an agent's work at a glance and it looks identically clean no matter which agent or backend produced it. Today that activity is either invisible or siloed in a separate side panel; this makes it a first-class, foldable part of the conversation itself, the way t3code renders it.

**Why this matters.** This is the core of what the founder admired in t3code and the thing that makes an agent conversation legible instead of a wall of text or an opaque spinner. The founder is the direct beneficiary: following agent work is the daily act, and "never act in the dark" (the Conversations-view principle) only holds if the agent's actions are actually shown — calmly, foldably, uniformly. The cost of not building it is that HyperIdle's conversation stays a plain message list while every serious agent tool renders rich, foldable activity; our headline surface looks dated next to the field.

**What exists today.** The normalized event substrate is already built: `HarnessEvent` (`packages/shared/src/harness/harness-events.ts`) unions `tool_call`, `completion`, `error`, `cost_update`, `token_usage`, `pre_compaction`; `CapturedToolCall` (name/input/output/status) is attached to plain reply payloads by the chat-turn loop. `SessionActivityPanel` (`packages/web/src/components/SessionActivityPanel.tsx`) already renders tool-calls / reasoning / cost as a **separate companion pane** with filter tabs and auto-scroll, backed by `useSessionActivity` (`ActivityEntry`). Messages render through `ThreadShell` → `CommentRow` / `RichMessageCard`; `AssistantOverlay` renders a `ToolCallRow`. So we have events, an entry type, and a side-pane renderer.

**What's genuinely missing.** A single, named, **closed rendering grammar** for agent activity woven *into the conversation stream* (not a side pane) — with consistent collapsed/expanded states, per-part status (running / ok / failed), turn-level folding ("Worked for Xs"), and one visual treatment that is producer-agnostic. The existing `ActivityEntry` is panel-shaped and ad-hoc; there is no conversation-level vocabulary or fold model.

**Depends on.** None — builds on the existing `HarnessEvent` substrate.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — run /concept AM1 first.` It introduces/reshapes a load-bearing noun: the conversation activity grammar (working name "activity part" / "trace"). The concept must lock the closed vocabulary, the collapsed/fold/status contract, and the producer-agnostic mapping from `HarnessEvent` — and it must **reconcile names with the existing `ActivityEntry`** and **avoid the `Block`/`blocked` collision** (`docs/blocks/`, `docs/human-interface-layer/block-primitive.md`).
- **Design:** `Required — novel rendering grammar; /design multi-variant + human review.` Carries the **adoption-model** axis. The look of the grammar (chip vs row vs card, density, fold affordance, how reasoning/diffs/plans/commits each read) is decided by rendered variants, not prose.

**Human design review.** Yes — a new base conversation primitive whose visual grammar is the whole point; novel surface.

**Acceptance criteria.**
- A reader can follow an agent's tool calls, file edits, diffs, reasoning, plans, shell commands, commits, and errors inline in the conversation, each visually distinguishable at a glance.
- Each activity part shows its run state (in-progress, succeeded, failed) and expands to reveal detail and collapses to a one-line summary.
- A completed agent turn folds to a single summary line (e.g. "Worked for Xs") that re-expands on demand; an interrupted turn reads as interrupted, not completed.
- The same grammar renders identically regardless of which agent or backend produced the activity (no producer-specific layout).
- The grammar is a closed, documented vocabulary — an activity kind the renderer doesn't recognise degrades to a safe generic part, never throws or drops content.
- The conversation remains readable and calm at high activity volume (a long turn does not overwhelm the reading column).

**Validation scenarios.**
- Given an agent running a multi-step turn, when it reads files, edits files, and runs commands, then each renders as a distinct activity part with live status, and the turn folds to a summary when it settles.
- Given a settled turn folded to its summary, when the reader expands it, then every intermediate activity part is shown in order; when re-collapsed, only the summary remains.
- Given an activity of an unrecognised kind, when it renders, then it shows a safe generic part and the conversation does not error.
- Given two different backends producing the same kind of activity, when both render, then they use the same visual treatment.

**Plan calls.** Concept-introducing — name the noun and lock the vocabulary in `/concept AM1` (point at `plans/AM1/concept.md`) **before** `/architecture`. Then `/design` for the grammar (multi-variant, carrying the adoption-model axis) → `/human-design-review`. Reuse the `HarnessEvent` substrate and the `useSessionActivity` data path; do not invent a new event stream. Map, don't duplicate, `ActivityEntry`.

**Contracts / constraints.**
- Reuse existing Thread/Message primitives and `HarnessEvent`; no new on-disk format, no new event stream.
- The activity grammar's canonical name must NOT be "Block" (collides with the content primitive) nor "blocked" (workflow state).
- No color/token changes — Hearth palette and `AESTHETICS.md` tokens unchanged; structure and grammar only.
- Closed vocabulary: an unrecognised kind degrades safely; never throws, never silently drops content.

**Out of scope.** The shell/pane structure that hosts the grammar (AM2). The composer (AM4). Reviewer anchored comments (Track AL2). Any change to verdict/review semantics.

**Effort.** L (~5d)

---

### AM2 — Conversation shell & contextual panel

**Workpackage.** As a founder working in a thread, I want the conversation laid out so that the activity grammar reads in a calm central column and the things an agent produces — a diff, an artifact, a file tree, a live preview — open in a contextual surface beside the conversation rather than cramming the stream, so that I can read the discussion and inspect the work side by side, the way t3code's three-pane layout does. Today the conversation is a two-pane list/detail with a one-off "companion layout" toggle for complex artifacts; this resolves the layout into a coherent, reusable shell.

**Why this matters.** The grammar (AM1) needs a home, and where heavy artifacts (diffs, previews) live decides whether the conversation stays readable. The founder benefits directly: review and follow-along both improve when the artifact has a dependable place to open instead of fighting the message stream. Not building it means AM1's rich activity has nowhere coherent to expand into, and the "companion layout" stays a special case instead of a system.

**What exists today.** The app shell is built (`SidebarV2`, three views Conversations/Work/Knowledge; `docs/information-architecture/app-shell-always-present.md`). Conversations is two-pane: `ThreadSections` (list) | detail (`Conversations.tsx` → `ThreadShell`). A "companion layout" already splits conversation and a complex `ArtifactView`; `SessionActivityPanel` already opens as a companion pane. So a right-hand companion surface exists in one-off form.

**What's genuinely missing.** A generalized, addressable **contextual panel** (the candidates: diff, artifact, files, preview) and a resolved pane structure that hosts the AM1 grammar — instead of the current single-purpose companion toggle. The pane structure itself (how many panes, tabbed vs inline) is an open design fork.

**Depends on.** AM1 — the shell exists to host the activity grammar; designing the layout before the grammar's shape is known would churn.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — reuses Thread (docs/human-interface-layer/thread-primitive.md) and the app shell (docs/information-architecture/app-shell-always-present.md).` No new load-bearing noun; the contextual-panel surface is an IA decision for `/design`, not a new primitive. (If `/design` surfaces a genuine new noun — e.g. a persistent addressable "panel surface" with its own state contract — it parks for a quick `/concept AM2` then; flagged, not pre-resolved.)
- **Design:** `Required — IA redesign; /design multi-variant + human review.` Carries the **pane-structure** axis and the spatial half of the **adoption-model** axis. Decided by rendered variants.

**Human design review.** Yes — a shell/IA redesign of the most-used surface; novel layout direction.

**Acceptance criteria.**
- A reader can follow the conversation in a calm central reading column while a diff, artifact, file view, or preview is open beside it without the stream becoming cramped.
- The contextual surface can be opened from an activity part or artifact in the conversation and dismissed, and its state is scoped to the thread.
- The layout adapts coherently across the supported form factors (it does not break to an unusable state on a narrow viewport).
- Existing conversation capabilities (thread list, sectioning, verdict flow, composer) remain reachable and unbroken within the new shell.

**Validation scenarios.**
- Given a conversation with a diff produced by an agent, when the reader opens it, then it appears in the contextual surface beside the stream and the conversation remains readable.
- Given the contextual surface is open, when the reader switches threads, then the surface reflects the new thread's state (scoped per thread).
- Given a narrow viewport, when the contextual surface is invoked, then the layout adapts to a usable single-focus presentation rather than breaking.

**Plan calls.** `/design` for the shell and contextual-panel structure (multi-variant, carrying the pane-structure axis and the spatial adoption-model fork) → `/human-design-review`. Reuse the existing app shell and `ArtifactView`; generalize the companion layout rather than inventing a parallel one. Standard `/architecture` after the layout locks.

**Contracts / constraints.**
- No color/token changes — Hearth tokens unchanged; structure/IA only.
- Reuse the existing shell, `Conversations` routing, and `ArtifactView`; do not fork a second artifact renderer.
- Thread/verdict semantics and the composer remain functional and reachable.

**Out of scope.** The activity grammar itself (AM1). The composer redesign (AM4). Harness detection/onboarding (AM5). New artifact *kinds* beyond what `ArtifactView` supports.

**Effort.** L (~5d)

---

### AM3 — Harness capability descriptor & normalization

**Workpackage.** As the system rendering one uniform conversation over potentially several agent backends, I want each harness to declare what it can do — its available models, the per-model options (reasoning effort, modes, permissions), and its slash-commands and skills — through one normalized descriptor, and I want backend-native runtime events normalized into one model, so that the composer and the activity grammar can render generically from declared capabilities instead of hard-coding per-backend logic. This is the substrate that lets "no matter which harness, it looks the same" be true.

**Why this matters.** Both the capability-driven composer (AM4) and the producer-agnostic grammar (AM1) depend on a single normalized description of each backend; without it, every backend difference leaks into the UI. This is also where the **strategic harness-scope decision** is made — whether HyperIdle stays native-only, also adopts external backends the user has (BYO, the t3code capability the founder admired), or runs agents on external adapters. The founder benefits because this decision shapes the whole product surface; getting it wrong (or leaving it implicit) is expensive to unwind. The cost of not building it: capability differences hard-coded into UI, and the BYO question decided by accident.

**What exists today.** A harness abstraction exists: agents carry `harnessType` and `modelTierPreference` (`packages/db/src/schema.ts`); `HarnessEvent` normalizes a runtime event stream; `model-gateway.ts` and `strategy-port.ts` (`packages/shared/src`) mediate model access. So there is a runtime-event normalization and a model-tier notion — but **no capability descriptor**: no declared per-harness model list, per-model option descriptors (effort/mode/permission), or surfaced slash-commands/skills, and no detection of external backends.

**What's genuinely missing.** A normalized **capability descriptor** per harness/model (models, option descriptors, modes, permissions, slash-commands, skills) and the normalization boundary that maps any backend into it — plus the locked answer to the harness-scope fork that determines whether the descriptor must also represent external backends.

**Depends on.** None — it is the substrate. (Its concept gates AM4 and AM5.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — run /concept AM3 first.` It reshapes the load-bearing "harness" noun and introduces the capability-descriptor concept, and it **resolves the harness-scope strategic fork** (native-only vs native + external BYO vs external-adapter) — a founder decision that changes scope, not just form. Reconcile with the locked harness vocabulary (`docs/agent-layer/`, harness-vocab memory) and `model-gateway`/`strategy-port`.
- **Design:** `Not required — backend/contract substrate, no rendered surface.` (The settings/onboarding surface is AM5; the composer surface is AM4.)

**Human design review.** No — backend contract; no rendered component.

**Acceptance criteria.**
- Each harness exposes a normalized descriptor declaring its available models, per-model options (e.g. reasoning effort, mode, permission), and its slash-commands and skills, queryable by the UI.
- A model option is described generically enough that a UI control can be rendered from it without backend-specific code (e.g. a select with choices, a boolean toggle).
- Backend-native runtime events normalize into one model such that two different backends performing the same kind of action are indistinguishable to consumers downstream.
- The harness-scope decision is documented in the concept (`plans/AM3/concept.md`) and the descriptor's shape reflects it (e.g. it can or cannot represent an external backend, per the locked scope).

**Validation scenarios.**
- Given a harness with two models offering different reasoning-effort options, when the UI queries capabilities, then it receives a generic descriptor it can render controls from without naming the backend.
- Given the same logical action from two backends, when each emits its native events, then both normalize to the same downstream representation.
- Given the locked harness scope, when the descriptor is constructed, then its shape matches that scope (external backends representable iff the scope includes them).

**Plan calls.** Concept-introducing and strategically load-bearing — run `/concept AM3` first; the harness-scope fork is a founder decision and must be resolved there (`plans/AM3/concept.md`), not deferred to architecture. Skip `/design`. Then `/architecture` → `/write-tests` → `/write-code`. Reuse `HarnessEvent`, `model-gateway`, `strategy-port`; extend, don't replace.

**Contracts / constraints.**
- Reuse and extend the existing harness/event abstraction; no parallel harness model.
- Honor the locked harness vocabulary (keep "harness"/"session"; no reintroduction of purged terms).
- Capability descriptor is declarative — consumers render from it; no per-backend branching in UI code.

**Out of scope.** The composer UI that consumes the descriptor (AM4). The detection/onboarding UI (AM5). The activity grammar (AM1). Actually executing agents on external backends if the scope decision excludes it.

**Effort.** L (~5d)

---

### AM4 — Capability-driven session composer

**Workpackage.** As a founder about to send a turn, I want the composer to offer the session controls that actually apply — model, reasoning effort, mode, permission level — derived from the active agent's harness capabilities, presented as calm inline controls the way t3code's composer pills are, so that I can dial in a session in the moment without leaving the conversation or hunting through settings. Today the composer is a plain text box with a send button; this gives it capability-aware session dial-in.

**Why this matters.** Session dial-in (choosing model/effort/mode/permission per piece of work) is one of the three things the founder explicitly wanted to learn from t3code, and it is the difference between an agent you configure once and an agent you steer continuously. The founder benefits every time the right model or effort for a task differs from the default. The cost of not building it: dial-in stays buried in agent config, and the in-the-moment control t3code makes effortless is missing.

**What exists today.** The composer (`packages/design-system/src/Composer.tsx`) is a textarea + send button (Cmd/Ctrl+Enter), with an unresolved-review link and optional refs — no model/effort/mode/permission controls. Agents carry `modelTierPreference` and a `reasoning` field; `harnessType` exists. So defaults live on the agent, but there is no in-composer, per-session control surface.

**What's genuinely missing.** A composer that renders session controls generically from the AM3 capability descriptor, and a decision on **where dial-in lives** (per-thread on the composer vs per-message vs agent-config only) — carried as a design axis.

**Depends on.** AM3 — the composer renders controls from the normalized capability descriptor; without it the controls have nothing to derive from and would be hard-coded.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — consumes the capability-descriptor concept locked in /concept AM3.` No new noun of its own; it reuses AM3's descriptor and the existing agent model/reasoning config. (The dial-in *placement* is a design decision, not a concept one.)
- **Design:** `Required — composer redesign; /design multi-variant + human review.` Carries the **session-dial-in-placement** axis (per-thread vs per-message vs agent-config). Decided by rendered variants.

**Human design review.** Yes — the composer is a base, ubiquitous component; redesign with an open interaction direction.

**Acceptance criteria.**
- The composer presents session controls (model, and the options the active harness declares — e.g. effort, mode, permission) derived from capabilities, not hard-coded per backend.
- Choosing a control changes the session configuration for the turn(s) it governs, and the chosen configuration is visible before sending.
- When the active agent/harness declares no option of a given kind, that control is absent rather than shown disabled-and-empty.
- The composer's existing behavior (compose, send, Cmd/Ctrl+Enter, refs, unresolved-review link) remains intact.

**Validation scenarios.**
- Given an agent whose harness declares model + effort options, when the founder opens the composer, then those controls appear and reflect the current/default selection.
- Given a harness that declares no effort option, when the composer renders, then no effort control is shown.
- Given a changed model/effort selection, when the founder sends a turn, then the turn runs under the chosen configuration and the selection was visible beforehand.

**Plan calls.** `/design` for the composer and its controls (multi-variant, carrying the dial-in-placement axis) → `/human-design-review`. Consume AM3's descriptor; reuse the existing `Composer` component and agent config defaults. Standard `/architecture` after the design locks.

**Contracts / constraints.**
- Render controls generically from the AM3 descriptor; no per-backend branching in the composer.
- No color/token changes — Hearth tokens unchanged.
- Preserve all existing composer behavior and keyboard semantics.

**Out of scope.** The capability descriptor itself (AM3). Detection/onboarding of backends (AM5). The activity grammar (AM1).

**Effort.** L (~4d)

---

### AM5 — Harness detection & onboarding

**Workpackage.** As a founder setting up HyperIdle, I want it to detect which agent backends are available and authenticated and walk me through enabling and configuring them — showing each one's status, version, auth, and capabilities the way t3code's Providers settings do — so that getting from install to a working agent is guided and obvious instead of a manual config hunt. The exact reach of this (native agents only, or also external backends the user has) follows the harness-scope decision locked in AM3.

**Why this matters.** Onboarding is the second thing the founder called out from t3code, and detection-driven setup is the difference between "it just works" and a config wall. The founder (and every new user — recall the positioning: solo founders, small teams, agencies) benefits at the highest-stakes moment, first run. The cost of not building it: setup stays manual and the polished, capability-aware onboarding the founder admired is absent. (If AM3 locks native-only scope, this WP shrinks to surfacing native-agent status/capabilities and may re-size to M.)

**What exists today.** Settings exist (`docs/ui-design/settings-consistency.md`; Settings overlay with Profile/Org Chart/Credentials/Notifications/Appearance/Products/Backend). Agents carry `harnessType`; AM3 (dependency) introduces the capability descriptor with status/auth/version fields. There is no detection of installed/authenticated backends and no guided harness onboarding flow.

**What's genuinely missing.** A detection step that reports which backends are present/authenticated and a guided onboarding/settings surface that surfaces each harness's status, auth, version, and capabilities and lets the user enable/configure it — scoped to whatever AM3 locked.

**Depends on.** AM3 — detection and the settings surface render the capability descriptor (status/auth/version/capabilities); the scope locked in AM3 also determines whether external backends are in scope at all.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — inherits the harness/capability-descriptor concept and the scope decision locked in /concept AM3.` No new noun.
- **Design:** `Required — new onboarding/settings surface; /design multi-variant + human review.` The detection results, status presentation, and the enable/configure flow are an open design surface.

**Human design review.** Yes — a new onboarding surface at a high-stakes first-run moment.

**Acceptance criteria.**
- On setup (and on demand), HyperIdle reports which in-scope agent backends are present and whether each is authenticated, with each one's status, version, and auth shown.
- A user can enable, disable, and configure an in-scope backend from a guided surface, and a backend's declared capabilities (models, options, commands, skills) are visible there.
- A backend that is present but not authenticated is shown with a clear, actionable next step rather than a silent failure.
- The flow respects the AM3 scope decision (external backends appear iff scope includes them).

**Validation scenarios.**
- Given an environment with an authenticated in-scope backend, when the user opens onboarding/settings, then it shows that backend as available with its status, version, and capabilities.
- Given a present-but-unauthenticated backend, when the user views it, then it shows an actionable next step (not a silent or cryptic failure).
- Given the locked AM3 scope, when the detection runs, then only in-scope backend kinds are surfaced.

**Plan calls.** `/design` for the detection-results and onboarding/settings surface (multi-variant) → `/human-design-review`. Reuse the existing Settings shell and AM3's descriptor (status/auth/version/capabilities). Standard `/architecture` after the design locks. Re-size to M if AM3 locks native-only scope.

**Contracts / constraints.**
- Render from AM3's descriptor; no per-backend hard-coding in the settings surface.
- No color/token changes — Hearth tokens unchanged.
- Reuse the existing Settings shell; do not fork a parallel settings surface.

**Out of scope.** The capability descriptor itself (AM3). The composer (AM4). The activity grammar (AM1). Credential storage mechanics beyond surfacing auth status (reuse existing Credentials handling).

**Effort.** L (~4d)
