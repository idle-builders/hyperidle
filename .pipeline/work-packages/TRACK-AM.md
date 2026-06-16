# Track AM: Conversation Experience

Source: the t3code study of 2026-06-16 (`plans/chat-redesign/` — annotated t3code + GitHub Copilot screenshots; `plans/chat-redesign/t3code-reference.md`; t3code source read at `/tmp/t3code-explore`). The founder's takeaway is about **style, not model**: agent chat tools have a calm, embedding-rich way of rendering a conversation that is genuinely a nice new style, and HyperIdle should adopt that **style** for its **normal conversations**. The thing to learn is *how a conversation with agents reads and embeds*, applied to HyperIdle's deliberate, threaded messaging.

**The load-bearing distinction (do not blur it).** A **conversation** in HyperIdle is a *deliberate, threaded exchange of messages* between people and agents — participants choose to send messages. A **session** is an agent's actual work execution (its tool calls, edits, diffs, reasoning). **We are not building t3:** the session work-log is **not** the conversation, and session activity is **not** a first-class conversation part. The session **dial-in** — configuring a session and seeing what happened in it — is a separate, **lower-level surface entered when needed**. It **reuses the conversation's rendering structure** so that inspecting a session looks uniform with the conversation. The conversation **defines** the rendering structure; the session view **reuses** it.

**Why a separate track.** This is the conversation interaction layer (foremost) plus the lower-level session/harness layer that reuses its structure — broader than Track AL (review-comment polish) and orthogonal to it. AL adds reviewer interactions on artifacts; AM improves how the conversation itself reads and embeds, then reuses that for the session view. They share the thread/harness data model but no UI seam, so they proceed in parallel.

**Scope rules.** The conversation experience (primary) and the lower-level session-dial-in / harness layer that reuses its structure. **No color work** — the Hearth palette and all `AESTHETICS.md` tokens stay exactly as-is; this track is structure, information architecture, and rendering style (the founder's explicit instruction: "we find our own colors"). Reuse the existing Thread/Message primitives (`plain | review | questionnaire | verdict`) and verdict semantics unchanged — AM renders *within* the Thread model, it does not reshape it. The `BlockKind` prose vocabulary (`docs/blocks/`) is untouched and unrelated; any new conversation-rendering name must avoid "Block" and "blocked". `npm run verify` must pass after each workpackage merges.

**Reference docs:** `plans/chat-redesign/t3code-reference.md` (distilled t3code style/IA learnings — read for *style*, not model), `plans/chat-redesign/` (screenshots), `docs/human-interface-layer/thread-primitive.md`, `docs/information-architecture/conversations-view.md`, `docs/information-architecture/app-shell-always-present.md`, `docs/agent-layer/index.md`, `packages/shared/src/harness/harness-events.ts`, `packages/shared/src/thread.ts`, `packages/web/src/components/SessionActivityPanel.tsx`, `packages/design-system/src/ThreadShell.tsx`, `.claude/rules/aesthetic-quality.md`.

---

## Design-exploration axes (carried, NOT pre-resolved)

The hard direction forks the founder decides by **seeing rendered variants** in `/design` + `/human-design-review` — left open in the specs below. Each WP names the axis it carries.

1. **Conversation style reach** (AM1) — how far the calm, embedding-rich agent-chat *style* (rich embeds, quiet rendering, threading affordances) reshapes the deliberate-message conversation, *while it stays deliberate messages within Threads*. **Explicitly out of bounds: transcript-as-conversation** (turning the conversation into a live work-log) — that is the t3 model HyperIdle rejects.
2. **Embedding model** (AM1) — what a deliberate message can embed and how it reads (artifacts, refs/blocks, diffs, a session reference) without becoming a work-log.
3. **Session dial-in surface** (AM3) — how you enter the lower-level session view (from a session reference in the conversation? a panel? a route?), and how the controls + the "what happened" activity render while reusing the conversation structure.
4. **Harness scope** (AM2) — *native-only* vs *native + external BYO* (detect/normalize Claude Code, Codex, OpenCode… the user has) vs *external-adapter*. A **strategic concept fork** resolved in AM2's `/concept` because it changes scope, not just form.

---

### AM1 — Conversation experience

**Workpackage.** As a founder talking with my agents and team, I want the conversation — deliberate, threaded messages between people and agents — to read with the calm, embedding-rich style that makes agent chat so legible: messages that can beautifully embed the things they refer to (an artifact, a referenced block, a diff, a link to a session) and that lay out quietly within the Thread model rather than as a wall of text. This is the foremost focus of the track and the thing that establishes the rendering structure the session view later reuses. It is **not** a work-log: it stays deliberate messages within Threads.

**Why this matters.** The conversation is where the founder spends ~90% of their time, and "a nice new style of conversation" is exactly what agent chat tools have shown is possible — calm, embedding-rich, easy to follow. The founder is the direct beneficiary every time a message can show what it refers to inline instead of as a bare link. The cost of not building it: HyperIdle's conversation stays a plain message list while the field has moved to a richer, calmer reading experience — and we have no shared rendering structure for the session view to reuse.

**What exists today.** Conversations render through `ThreadShell` → `CommentRow` / `RichMessageCard` (`packages/design-system/src`), with a minimal `Composer` (textarea + send). Messages can already carry references, and `BlockRefEmbed` (`packages/web/src/components`) renders a referenced block inline. Threads are a real primitive (`packages/shared/src/thread.ts`; host kinds, participants, message types `plain | review | questionnaire | verdict`). So we have threaded messages and a basic embed — but no calm, uniform rendering *style*, no rich embedding vocabulary, and no shared structure factored for reuse.

**What's genuinely missing.** A deliberate-message conversation experience with a calm, embedding-rich rendering style — messages that embed artifacts/refs/diffs/session-links legibly, laid out within the Thread model — and the **shared rendering structure** (the layout/embedding/fold vocabulary) factored so the lower-level session view (AM3) can reuse it for uniformity.

**Depends on.** None — builds on the existing Thread/Message/ThreadShell surface.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — run /concept AM1 first.` It reshapes how a *conversation* reads and defines the **shared rendering structure** (the embedding + layout + fold vocabulary) that AM3 reuses. The concept must (a) lock the rejection list — **a conversation is deliberate messages within Threads, NOT a session work-log; session activity is not a conversation part**; (b) define the embedding model (what a message embeds); (c) name the shared structure with a term that avoids "Block"/"blocked"; (d) reconcile with the Thread primitive (`docs/human-interface-layer/thread-primitive.md`).
- **Design:** `Required — novel conversation style; /design multi-variant + human review.` Carries the **conversation-style-reach** and **embedding-model** axes. The look (how messages, embeds, and threading read; density; calm rhythm) is decided by rendered variants.

**Human design review.** Yes — a redesign of the most-used surface; the rendering style is the decision.

**Acceptance criteria.**
- A reader can follow a threaded conversation of deliberate messages between people and agents that reads calmly and is easy to scan.
- A deliberate message can embed the things it refers to (at minimum: a referenced block/artifact and a link to a session) so they read inline rather than as bare references.
- The conversation honors the Thread model — host attachment, participants, and the existing message types all render correctly within the new style.
- Session work-activity does NOT appear as first-class conversation content; a session is referenced from the conversation, not inlined as a work-log.
- The rendering structure (layout, embedding, fold vocabulary) is factored so another surface can reuse it without reimplementing it.

**Validation scenarios.**
- Given a thread with messages from a person and an agent that reference an artifact and a session, when it renders, then the artifact embeds inline and the session shows as a reference (not an inlined work-log), within a calm threaded layout.
- Given the existing message types (plain/review/questionnaire/verdict), when each renders in the new style, then all remain correct and reachable, and verdict flow is unaffected.
- Given the shared rendering structure, when AM3 reuses it for the session view, then no conversation-rendering logic is duplicated.

**Plan calls.** Concept-introducing — run `/concept AM1` first (lock the conversation/structure and the rejection list at `plans/AM1/concept.md`) before `/architecture`. Then `/design` for the conversation style (multi-variant, carrying the style-reach and embedding axes) → `/human-design-review`. Reuse `ThreadShell`, `CommentRow`, `RichMessageCard`, `BlockRefEmbed`; do not invent a parallel conversation renderer.

**Contracts / constraints.**
- Reuse Thread/Message primitives and verdict semantics unchanged; render within them.
- A conversation is deliberate messages within Threads — never a session work-log; session activity is not a first-class conversation part.
- The shared rendering structure's name must NOT be "Block" or "blocked".
- No color/token changes — Hearth palette and `AESTHETICS.md` tokens unchanged; structure and style only.

**Out of scope.** The session dial-in and "what happened" activity view (AM3). The harness capability/normalization substrate (AM2). Reviewer anchored comments (Track AL2). Any change to verdict/review semantics.

**Effort.** L (~5d)

---

### AM2 — Harness capability descriptor & normalization

**Workpackage.** As the lower-level layer beneath the session dial-in, I want each harness to declare what it can do — its available models, the per-model options (reasoning effort, mode, permission) — through one normalized descriptor, and backend-native runtime events normalized into one model, so that the session dial-in's controls render generically from declared capabilities and the "what happened" view renders uniformly regardless of which backend ran the session. This is substrate for the dial-in (AM3) and onboarding (AM4), not a conversation surface.

**Why this matters.** The session dial-in's controls and its uniform cross-backend activity view both need one normalized description of each backend; without it, backend differences leak into the UI. This is also where the **strategic harness-scope decision** is made — native-only, native + external BYO (the t3code detection the founder admired), or external-adapter. The founder benefits because this decision shapes the whole lower-level surface; leaving it implicit is expensive to unwind. Cost of not building it: capability differences hard-coded into UI and the BYO question decided by accident.

**What exists today.** A harness abstraction exists: agents carry `harnessType` and `modelTierPreference` (`packages/db/src/schema.ts`); `HarnessEvent` (`packages/shared/src/harness/harness-events.ts`) normalizes a runtime event stream (`tool_call`, `completion`, `error`, `cost_update`, `token_usage`, `pre_compaction`); `model-gateway.ts` / `strategy-port.ts` mediate model access. So there is runtime-event normalization and a model-tier notion — but **no capability descriptor** (no declared per-harness models, per-model option descriptors, modes/permissions) and no detection of external backends.

**What's genuinely missing.** A normalized **capability descriptor** per harness/model (models, option descriptors, modes, permissions) and the normalization boundary that maps any backend into it — plus the locked answer to the harness-scope fork that determines whether the descriptor must also represent external backends.

**Depends on.** None — it is the substrate. (Its concept gates AM3 and AM4.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — run /concept AM2 first.` It reshapes the "harness" noun, introduces the capability-descriptor concept, and **resolves the harness-scope strategic fork** (native-only vs native + external BYO vs external-adapter) — a founder decision that changes scope, not just form. Reconcile with the locked harness vocabulary (`docs/agent-layer/`) and `model-gateway`/`strategy-port`.
- **Design:** `Not required — backend/contract substrate; no rendered surface.` (The dial-in surface is AM3; onboarding is AM4.)

**Human design review.** No — backend contract; no rendered component.

**Acceptance criteria.**
- Each harness exposes a normalized descriptor declaring its available models and per-model options (e.g. reasoning effort, mode, permission), queryable by the UI.
- A model option is described generically enough that a UI control can be rendered from it without backend-specific code (e.g. a select with choices, a boolean toggle).
- Backend-native runtime events normalize into one model such that two backends performing the same kind of action are indistinguishable to downstream consumers.
- The harness-scope decision is documented in the concept (`plans/AM2/concept.md`) and the descriptor's shape reflects it (external backends representable iff the locked scope includes them).

**Validation scenarios.**
- Given a harness with two models offering different reasoning-effort options, when the UI queries capabilities, then it receives a generic descriptor it can render controls from without naming the backend.
- Given the same logical action from two backends, when each emits native events, then both normalize to the same downstream representation.
- Given the locked harness scope, when the descriptor is constructed, then its shape matches that scope.

**Plan calls.** Concept-introducing and strategically load-bearing — run `/concept AM2` first; the harness-scope fork is a founder decision resolved there (`plans/AM2/concept.md`), not deferred to architecture. Skip `/design`. Then `/architecture` → `/write-tests` → `/write-code`. Reuse `HarnessEvent`, `model-gateway`, `strategy-port`; extend, don't replace.

**Contracts / constraints.**
- Reuse and extend the existing harness/event abstraction; no parallel harness model.
- Honor the locked harness vocabulary (keep "harness"/"session"; no purged terms).
- Capability descriptor is declarative — consumers render from it; no per-backend branching in UI code.

**Out of scope.** The dial-in UI that consumes the descriptor (AM3). The detection/onboarding UI (AM4). The conversation (AM1). Executing agents on external backends if the scope decision excludes it.

**Effort.** L (~5d)

---

### AM3 — Session dial-in & activity view

**Workpackage.** As a founder who occasionally needs to look beneath a conversation, I want a lower-level session surface — entered when needed, not in my face by default — where I can configure a session (model, reasoning effort, mode, permission) and see what an agent actually did in it (its tool calls, edits, diffs, reasoning) rendered with the **same structure as the conversation** so it reads uniformly. This is the "dial-in" — deliberately lower-level — and it reuses AM1's rendering structure rather than inventing its own.

**Why this matters.** Session dial-in is the third thing the founder wanted from t3code, but as a *lower-level* capability: steering a session and inspecting what happened, when it matters, without it cluttering the conversation. The founder benefits when the default model/effort for a task differs, or when they need to audit an agent's work. Reusing the conversation structure means a session reads like the rest of the product instead of a foreign panel. Cost of not building it: dial-in stays buried, and inspecting agent work looks nothing like the conversation.

**What exists today.** `SessionActivityPanel` (`packages/web/src/components/SessionActivityPanel.tsx`) already renders a session's tool-calls / reasoning / cost as a companion pane with filter tabs and auto-scroll, backed by `useSessionActivity`. Sessions are a process-layer primitive; agents carry `modelTierPreference`/`reasoning`. So a first-cut activity view and per-agent defaults exist — but the view does not reuse the conversation's structure, there is no in-the-moment session-config control surface, and dial-in placement is undecided.

**What's genuinely missing.** A lower-level session surface that (a) lets the user configure a session from the AM2 capability descriptor and (b) renders "what happened" reusing AM1's shared rendering structure for uniformity — plus the decision of **how dial-in is entered and placed** (carried as a design axis).

**Depends on.** AM1 — it reuses AM1's shared rendering structure (building it before that structure exists would churn). AM2 — its controls and uniform cross-backend activity render from the capability descriptor.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — reuses AM1's shared rendering structure, the Session primitive (docs/process-layer/), and AM2's capability descriptor.` No new noun; the dial-in *placement* is a design decision, not a concept one.
- **Design:** `Required — new lower-level surface; /design multi-variant + human review.` Carries the **session-dial-in-surface** axis (how it is entered, where controls + activity sit), reusing AM1's structure.

**Human design review.** Yes — a new surface with an open interaction direction (how dial-in is entered and laid out).

**Acceptance criteria.**
- A user can enter a lower-level session view from a session reference without it being part of the default conversation flow.
- In that view, the user can configure the session (model, and the options the harness declares — effort, mode, permission) from capabilities, not hard-coded per backend.
- The "what happened" activity (tool calls, edits, diffs, reasoning) renders reusing the conversation's shared rendering structure, so it reads uniformly with the conversation.
- The same session renders uniformly regardless of which backend produced its activity.

**Validation scenarios.**
- Given a session referenced from a conversation, when the user dials in, then the lower-level session view opens (not inlined into the conversation flow) showing controls and activity.
- Given a harness that declares model + effort options, when the user opens the dial-in, then those controls render from capabilities; an option the harness does not declare is absent.
- Given a session's activity, when it renders, then it uses AM1's shared rendering structure (no duplicated renderer) and reads uniformly with the conversation.

**Plan calls.** `/design` for the dial-in surface — entry, controls, and the activity view that reuses AM1's structure (multi-variant, carrying the dial-in-surface axis) → `/human-design-review`. Reuse `SessionActivityPanel`/`useSessionActivity` data path, AM1's rendering structure, and AM2's descriptor. Standard `/architecture` after the design locks.

**Contracts / constraints.**
- Reuse AM1's shared rendering structure for the activity view — do not fork a second renderer.
- Render controls/activity from AM2's descriptor; no per-backend branching.
- The dial-in is lower-level — it must not promote session activity into first-class conversation content.
- No color/token changes — Hearth tokens unchanged.

**Out of scope.** The conversation experience itself (AM1). The capability descriptor (AM2). Detection/onboarding (AM4).

**Effort.** L (~5d)

---

### AM4 — Harness detection & onboarding

**Workpackage.** As a founder setting up HyperIdle, I want it to detect which agent backends are available and authenticated and walk me through enabling and configuring them — showing each one's status, version, auth, and capabilities the way t3code's Providers settings do — so that getting from install to a working agent is guided and obvious instead of a manual config hunt. The reach (native agents only, or also external backends the user has) follows the harness-scope decision locked in AM2.

**Why this matters.** Onboarding is the second thing the founder called out from t3code, and detection-driven setup is the difference between "it just works" and a config wall — at first run, the highest-stakes moment, for exactly our audience (solo founders, small teams, agencies). Cost of not building it: setup stays manual and the polished, capability-aware onboarding the founder admired is absent. (If AM2 locks native-only scope, this WP shrinks to surfacing native-agent status/capabilities and may re-size to M.)

**What exists today.** Settings exist (`docs/ui-design/settings-consistency.md`; Settings overlay with Profile/Org Chart/Credentials/Notifications/Appearance/Products/Backend). Agents carry `harnessType`; AM2 introduces the capability descriptor with status/auth/version fields. There is no detection of installed/authenticated backends and no guided harness onboarding flow.

**What's genuinely missing.** A detection step reporting which backends are present/authenticated, and a guided onboarding/settings surface that surfaces each harness's status, auth, version, and capabilities and lets the user enable/configure it — scoped to whatever AM2 locked.

**Depends on.** AM2 — detection and the settings surface render the capability descriptor (status/auth/version/capabilities); the scope locked in AM2 determines whether external backends are in scope at all.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — inherits the harness/capability-descriptor concept and the scope decision locked in /concept AM2.` No new noun.
- **Design:** `Required — new onboarding/settings surface; /design multi-variant + human review.` The detection results, status presentation, and enable/configure flow are an open design surface.

**Human design review.** Yes — a new onboarding surface at a high-stakes first-run moment.

**Acceptance criteria.**
- On setup (and on demand), HyperIdle reports which in-scope agent backends are present and whether each is authenticated, with each one's status, version, and auth shown.
- A user can enable, disable, and configure an in-scope backend from a guided surface, and a backend's declared capabilities (models, options) are visible there.
- A backend that is present but not authenticated is shown with a clear, actionable next step rather than a silent failure.
- The flow respects the AM2 scope decision (external backends appear iff scope includes them).

**Validation scenarios.**
- Given an environment with an authenticated in-scope backend, when the user opens onboarding/settings, then it shows that backend as available with its status, version, and capabilities.
- Given a present-but-unauthenticated backend, when the user views it, then it shows an actionable next step (not a silent or cryptic failure).
- Given the locked AM2 scope, when detection runs, then only in-scope backend kinds are surfaced.

**Plan calls.** `/design` for the detection-results and onboarding/settings surface (multi-variant) → `/human-design-review`. Reuse the existing Settings shell and AM2's descriptor. Standard `/architecture` after the design locks. Re-size to M if AM2 locks native-only scope.

**Contracts / constraints.**
- Render from AM2's descriptor; no per-backend hard-coding in the settings surface.
- No color/token changes — Hearth tokens unchanged.
- Reuse the existing Settings shell; do not fork a parallel settings surface.

**Out of scope.** The capability descriptor itself (AM2). The dial-in surface (AM3). The conversation (AM1). Credential storage mechanics beyond surfacing auth status (reuse existing Credentials handling).

**Effort.** L (~4d)
