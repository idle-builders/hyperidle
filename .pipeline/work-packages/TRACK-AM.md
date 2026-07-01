# Track AM: Conversation Experience

Source: the t3code study of 2026-06-16 (`plans/chat-redesign/` — annotated t3code + GitHub Copilot screenshots; `plans/chat-redesign/t3code-reference.md`; t3code source read at `/tmp/t3code-explore`). The founder's takeaway is about **style, not model**: agent chat tools have a calm, embedding-rich way of rendering a conversation that is genuinely a nice new style, and HyperIdle should adopt that **style** for its **normal conversations**. The thing to learn is *how a conversation with agents reads and embeds*, applied to HyperIdle's deliberate, threaded messaging.

**The load-bearing distinction (do not blur it).** A **conversation** in HyperIdle is a *deliberate, threaded exchange of messages* between people and agents — participants choose to send messages. A **session** is an agent's actual work execution (its tool calls, edits, diffs, reasoning). **We are not building t3:** the session work-log is **not** the conversation, and session activity is **not** a first-class conversation part. The session **dial-in** — configuring a session and seeing what happened in it — is a separate, **lower-level surface entered when needed**. It **reuses the conversation's rendering structure** so that inspecting a session looks uniform with the conversation. The conversation **defines** the rendering structure; the session view **reuses** it.

**Why a separate track.** This is the conversation interaction layer (foremost) plus the lower-level session/harness layer that reuses its structure — broader than Track AL (review-comment polish) and orthogonal to it. AL adds reviewer interactions on artifacts; AM improves how the conversation itself reads and embeds, then reuses that for the session view. They share the thread/harness data model but no UI seam, so they proceed in parallel.

**Scope rules.** The conversation experience (primary) and the lower-level session-dial-in / harness layer that reuses its structure. **No color work** — the Hearth palette and all `AESTHETICS.md` tokens stay exactly as-is; this track is structure, information architecture, and rendering style (the founder's explicit instruction: "we find our own colors"). The existing Thread/Message primitives (`plain | review | questionnaire | verdict`) and verdict semantics stay unchanged — AM renders *within* the Thread model, it does not reshape it. The `BlockKind` prose vocabulary (`docs/blocks/`) is untouched and unrelated; any new conversation-rendering name must avoid "Block" and "blocked". `npm run verify` must pass after each workpackage merges.

**Reference docs:** `plans/chat-redesign/t3code-reference.md` (distilled t3code style/IA learnings — read for *style*, not model), `docs/human-interface-layer/thread-primitive.md`, `docs/information-architecture/conversations-view.md`, `docs/information-architecture/app-shell-always-present.md`, `docs/agent-layer/index.md`, `packages/shared/src/harness/harness-events.ts`, `packages/shared/src/thread.ts`, `packages/web/src/components/SessionActivityPanel.tsx`, `packages/design-system/src/ThreadShell.tsx`, `.claude/rules/aesthetic-quality.md`.

**Reference images** (`plans/AM1/`, founder-provided t3code screenshots — read for *style*, not model; colors out of scope):
- `Screenshot 2026-06-16 at 22.15.49.png` — t3code chat, main conversation view: left projects/threads nav, center conversation with inline-embedded file refs, composer with capability pills (model/effort/mode/permission), branch indicator. → **AM1** (conversation style + embedding); composer-pill style informs **AM3** dial-in.
- `Bild (5).png` — t3code chat, activity-heavy view: Read/Edit/"Ran N commands" activity chips with status, a commit diff-stat, a right-side diff/changes panel, "Accept edits" composer. → the *activity* style for **AM3** (session view reusing AM1's structure), NOT inlined into our conversation.
- `Screenshot 2026-06-16 at 22.15.42.png` — t3code Settings → Providers: per-backend (Codex/Claude/Cursor/Grok/OpenCode) auth status, version, enable toggles, badges. → **AM4** onboarding / **AM2** capability descriptor.
- `Screenshot 2026-06-16 at 22.15.35.png` — t3code Settings → Source Control providers (Git/GitHub/GitLab/…), same status/toggle pattern. → **AM4** onboarding pattern (secondary).

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

**Plan calls.** Concept-introducing — run `/concept AM1` first (lock the conversation/structure and the rejection list at `plans/AM1/concept.md`) before `/architecture`. Read the founder-provided reference images in `plans/AM1/` and `plans/chat-redesign/t3code-reference.md` for the *style* to adopt (not the model). Then `/design` for the conversation style (multi-variant, carrying the style-reach and embedding axes) → `/human-design-review`.

**Contracts / constraints.**
- Thread/Message primitives and verdict semantics stay unchanged — AM renders within the Thread model.
- A conversation is deliberate messages within Threads — never a session work-log; session activity is not a first-class conversation part.
- The shared rendering structure's name must NOT be "Block" or "blocked".
- No color/token changes — Hearth palette and `AESTHETICS.md` tokens unchanged; structure and style only.

**Out of scope.** The session dial-in and "what happened" activity view (AM3). The harness capability/normalization substrate (AM2). Reviewer anchored comments (Track AL4). Any change to verdict/review semantics.

**Effort.** L (~5d)

---

### AM2 — Real harness research, capability descriptor & proof

**Human review status.** Failed — the first AM2 attempt is incomplete and must not merge. It defined a plausible descriptor but did not prove the descriptor against the real harnesses, did not deeply study the `t3code` harness integration code, and did not prove that HyperIdle's own existing harness interaction code works against real installed harnesses. AM2 is sent back to concept and architecture.

**Workpackage.** As the lower-level layer beneath the session dial-in, I want HyperIdle to understand real harnesses from evidence, not guesses: study how `t3code` integrates Codex, Claude, Cursor, and OpenCode; study the documented and locally installed Codex CLI, Claude Code, and OpenCode surfaces; then define and implement a capability descriptor and event normalization model that is based on those real interaction surfaces. The descriptor must describe what each harness can actually do, how it is discovered, how login/readiness works, how sessions are launched, which options are real, and which runtime events can be observed. This work is only complete when integration tests prove real interactions against installed harness binaries and HyperIdle's own harness path, not stubs.

**Why this matters.** The founder wants the t3.codes-style "common harnesses just appear and work" experience, but a descriptor invented from product intuition is dangerous: it makes the UI look truthful while the runtime may not work. The direct beneficiaries are the founder and future users who need setup and session launch to be honest: installed/authenticated harnesses should be detected correctly, unauthenticated harnesses should show real next steps, and supported harnesses should actually run. The cost of not doing this is severe: AM3/AM4 would build controls and onboarding on fake capability claims, and users would hit silent failures at the exact moment they try to run an agent.

**What exists today.** A harness abstraction exists: agents carry `harnessType` and `modelTierPreference` (`packages/db/src/schema.ts`); `HarnessEvent` (`packages/shared/src/harness/harness-events.ts`) defines a downstream event union; `model-gateway.ts` / `strategy-port.ts` mediate model access; `AdapterPool` registers `claude-code`, `builtin`, and some on-PATH CLI adapters; the first AM2 attempt added a descriptor contract and `/api/harnesses` descriptors. Human review found that this is not enough: the external harness descriptors were not based on real CLI/source research, the login commands/readiness states were not verified, real binary probing was not implemented, and the existing HyperIdle harness paths have not been proven against real installed harnesses.

**What's genuinely missing.** A research-backed and test-proven harness contract. The architect must study the actual `t3code` source code for harness/provider discovery, auth, launch, event handling, status/version detection, and UI-facing capability shape; study the Codex CLI, Claude Code, and OpenCode documentation and locally installed binaries; then design the descriptor and implementation from those facts. The builder must prove real discovery, readiness/login status, session launch, event normalization, and HyperIdle builtin/API-gateway behavior through integration tests that invoke real harness binaries or explicitly skip only when a binary or credential is absent.

**Depends on.** None — it is the substrate. (Its concept gates AM3 and AM4.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — rerun /concept AM2 first.` The previous concept failed human review because it did not require real harness research or real-harness proof. The revised concept must make "real harness capability" distinct from "declared descriptor"; lock the research obligations; lock which harnesses must be proven (`builtin`, `codex`, `claude-code`, `opencode`; Cursor is studied via t3code and documented if no local executable/API surface is usable); and reconcile with the locked harness vocabulary (`docs/agent-layer/`) and `model-gateway`/`strategy-port`.
- **Design:** `Not required — backend/contract substrate; no rendered surface.` (The dial-in surface is AM3; onboarding is AM4.)

**Human design review.** No — backend contract; no rendered component.

**Acceptance criteria.**
- The architecture includes a dated research dossier proving the architect studied the relevant `t3code` source paths for harness/provider discovery, auth, launch, status/version detection, event handling, and UI-facing provider capability shape. The dossier names files/functions, summarizes observed behavior, and records what HyperIdle adopts or rejects.
- The architecture includes a dated real-CLI research dossier for Codex CLI, Claude Code, and OpenCode based on official/local documentation plus commands run against the installed binaries on this computer. It records binary names, version commands, login/readiness commands, non-interactive launch feasibility, event/output formats, model/option surfaces, and known limitations. Cursor must be researched through `t3code` and available documentation; if no usable local CLI surface exists, the dossier must say so explicitly.
- HyperIdle's own `builtin` / API-gateway harness is proven against a real configured gateway path, not only a stub. If no real key is available in the environment, the integration test must be present and skipped with a precise missing-credential reason; it must not be replaced by a fake proof.
- Each supported real harness exposes a descriptor whose fields are traceable to the research dossier: discovery state, auth action, version/readiness, launch options, model/options, runtime capabilities, and event normalization commitments. Unsupported or unproven fields must be omitted or marked unknown/unavailable; no guessed capability may be reported as ready.
- Integration tests exercise real installed harness binaries for discovery/version/readiness and at least one harmless real session/probe per supported harness where credentials/auth allow it. Stub-only tests do not satisfy AM2. Tests may skip when a binary or credential is absent, but the skip reason must identify the exact missing prerequisite.
- Backend-native runtime outputs from real harness executions normalize into one downstream model such that two harnesses performing the same kind of action are indistinguishable to consumers. The normalization tests must include captured real output fixtures from the researched harnesses.
- The reviewer can verify the evidence chain from source research -> architecture decisions -> implementation -> real integration tests. If any of those links is missing for a claimed harness, AM2 fails review.

**Validation scenarios.**
- Given the `t3code` repository, when the architect researches AM2, then the research dossier identifies the concrete source files/functions responsible for provider/harness discovery, auth/readiness, launch, and event/status handling, and the architecture cites those findings.
- Given this computer has `codex`, `claude`, or `opencode` installed, when AM2 integration tests run, then they execute the real binary for version/discovery/readiness and either run a harmless real probe or skip with a precise auth/credential prerequisite.
- Given a real API-gateway credential is configured for HyperIdle's own harness, when AM2 integration tests run, then the builtin harness performs a real provider call through the gateway path and emits normalized events/cost/token observations. If the key is absent, the test is skipped with a precise missing-key reason.
- Given captured real outputs from two harnesses, when normalization runs, then equivalent actions become the same downstream event shape and unsupported native events become explicit unavailable/error observations rather than silent success.
- Given `/api/harnesses`, when the UI queries descriptors, then every ready claim is backed by a passing real-harness proof, and every unproven harness is marked missing/unauthenticated/unavailable/unknown rather than ready.

**Plan calls.** Concept-introducing and strategically load-bearing — rerun `/concept AM2` first and mark the previous AM2 concept as failed. Then `/architecture` must begin with research, not types: use appropriate research/explore agents for `t3code` source, Codex CLI, Claude Code, OpenCode, and existing HyperIdle harness code. The reviewer must audit the research dossier before accepting the architecture and must reject any implementation whose descriptors or tests are not traceable to real harness behavior. Skip `/design`. Then `/architecture` → `/architecture-critique` → `/write-tests` real integration tests first → `/write-code` → `/review`.

**Contracts / constraints.**
- Honor the locked harness vocabulary (keep "harness"/"session"; no purged terms).
- Capability descriptor is declarative — consumers render from it; no per-backend branching in UI code.
- Real behavior beats desired shape. A descriptor field may only claim a capability when source research or a real harness test proves it.
- Stub-only validation is forbidden for AM2's core claims. Stubs may supplement edge cases, but real binary/gateway integration tests are required for supported harnesses.
- Tests must never harvest or copy provider subscription tokens from CLI config. CLI auth/readiness may be observed, and native login may be invoked explicitly by the user-facing flow, but provider secrets remain owned by the CLI.
- Existing HyperIdle harness interaction code is presumed unproven until AM2 tests it against real installed harnesses or real gateway credentials.
- The reviewer must check that the research was actually done and that architecture/implementation decisions cite it. Missing research is a blocking review failure.

**Follow-on architecture note.** AM2's live proof boundary should be the agent runtime boundary, not every consumer journey: session request/provisioning, adapter selection, harness start/stream/stop, tool/MCP invocation, session lifecycle persistence, writeback/capture, and emitted session events. Work, Conversation, Knowledge, and Routine flows should be able to test that they create the correct session request and react to session events without rerunning a real harness journey each time. The current implementation still treats `taskId` as required for provisioning (`sessions.taskId` is non-null), so assistant and routine sessions use stub tasks and bet decomposition has a direct `adapter.startSession` path. A future agent-session split should make session requests task-optional and event/message based (`SessionRequested` -> provisioner -> session events), which also enables remote provisioners without coupling Work/Conversation/Knowledge domains to a local `provisionSession` function.

**Out of scope.** The dial-in UI that consumes the descriptor (AM3). The detection/onboarding UI (AM4). The conversation (AM1). Arbitrary third-party marketplace/plugin loading. Full Cursor implementation if no usable documented/local CLI surface exists; Cursor still must be researched via `t3code` and documented.

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

**Plan calls.** `/design` for the dial-in surface — entry, controls, and the activity view that reuses AM1's structure (multi-variant, carrying the dial-in-surface axis) → `/human-design-review`. Builds on AM1's shared rendering structure (the uniformity requirement) and AM2's capability descriptor. Standard `/architecture` after the design locks.

**Contracts / constraints.**
- The session activity view reads uniformly with the conversation by sharing AM1's rendering structure (the AM1↔AM3 uniformity requirement).
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

**Plan calls.** `/design` for the detection-results and onboarding/settings surface (multi-variant) → `/human-design-review`. Builds on AM2's capability descriptor (status/auth/version/capabilities). Standard `/architecture` after the design locks. Re-size to M if AM2 locks native-only scope.

**Contracts / constraints.**
- Render from AM2's descriptor; no per-backend hard-coding in the settings surface.
- No color/token changes — Hearth tokens unchanged.
**Out of scope.** The capability descriptor itself (AM2). The dial-in surface (AM3). The conversation (AM1). Credential storage mechanics beyond surfacing auth status.

**Effort.** L (~4d)

---

### AM5 — Standardized artifact-view family & open/routing contract

**Workpackage.** As a person working anywhere in HyperIdle — a conversation, a bet, a knowledge doc, a review — I want every reference to an artifact, a block, or a review to open the *same recognizable view, reached the same way*, so that "open this" always lands me somewhere consistent and I never meet a one-off viewer or wonder where a chip will take me. Today the same artifact can render through several unrelated surfaces; this unifies them into one standardized artifact-view family and one contract that resolves any reference (artifact / block / review), from any surface, to its correct destination view.

**Why this matters.** The founder hit this directly while designing AM1: a referenced block opened a bespoke panel instead of the Knowledge view, and "we don't have standardized artifact views figured out." Right now the same artifact/block can render through the L3 `ArtifactView`, the `ArtifactPermalink` page, the review proof-canvases, and the Knowledge body — several surfaces with no shared contract for *which view opens for which reference, from where*. The founder and every user who opens an artifact/block/review from any surface get one consistent experience instead of several, and every workstream that links to an artifact stops hand-rolling its own viewer and routing (as AM1 just had to). Cost of not building it: each surface keeps reinventing viewers and routing, the experience drifts per surface, and "open" stays unpredictable.

**What exists today.** The L3 Artifact primitive (`docs/process-layer/artifact-primitive.md`) defines a closed view family (`gallery_card`, `stack_item`, `single_full_preview`, `review_message_embed`) and a kind set (`text/code/image/data/html/url`). `packages/web/src/shell/ArtifactView.tsx` and `packages/web/src/pages/ArtifactPermalink.tsx` render artifacts. The review experience (AL2) added a parallel proof-canvas family in `packages/web/src/pages/review/` (`ReviewCodeDiff`, `ReviewVisualDiff`, `ReviewMetricsMoved`, `ReviewRenderedInContext`, … via `canvas-registry.ts` / `review-canvas.tsx`), oriented around diffs/comparison. Knowledge bodies render blocks via `packages/web/src/pages/KnowledgeDetail.tsx` + `pages/knowledge/KnowledgeBody.tsx`; the Block primitive (`docs/blocks/`) defines those markdown regions. These surfaces overlap but share no single contract for which view a reference opens, or from where.

**What's genuinely missing.** One standardized artifact-view family that every surface renders through, and one open/routing contract that resolves a reference — artifact, block, or review — to the right destination view from any caller, so a chip in a conversation, a bet, a knowledge doc, or a review all open the same view the same way.

**Depends on.** None — the surfaces it consolidates (the L3 `ArtifactView`, `ArtifactPermalink`, the review proof-canvases, the Knowledge view) are already shipped on `main`. AM1 surfaced the need and will consume the contract (its chips are already written as hooks awaiting it), but does not block this WP.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — run /concept AM5 first.` It reconciles the artifact-view-family vocabulary (the L3 closed family vs the review proof-canvas family) and introduces the **open/routing contract** (which view opens for which reference, from any surface) — load-bearing nouns that must be locked before architecture. Reconcile with `docs/process-layer/artifact-primitive.md` and `docs/blocks/`.
- **Design:** `Required — standardized viewing surface whose form is genuinely open ("what do artifact views look like"); /design multi-variant + human review.` Carries the design-exploration axes below (do NOT pre-resolve them).

**Human design review.** Yes — decides the shape of a base/primitive viewing family used across the whole app.

Design-exploration axes (carried, decided by rendered variants):
1. How a standardized artifact view renders per kind, and how the review/diff canvases relate to it (one family with review-context variants vs separate-but-consistent families).
2. How a reference opens — full-page navigation vs a side/right surface vs both-per-context (quick-look vs full).

**Acceptance criteria.**
- Opening an artifact reference from any surface (conversation, bet, knowledge, review) lands the user in the same recognizable view appropriate to that artifact's kind.
- Opening a block reference lands the user in the Knowledge view, positioned at that block — not a one-off viewer.
- Opening a review reference lands the user in the review experience for that review.
- An artifact reads consistently between its inline reference and its opened view (same identity, kind, and content).
- A reference whose target kind/view is unknown opens a clear fallback rather than a blank or a crash.
- The same artifact/block/review opens identically regardless of which surface the reference appeared on.

**Validation scenarios.**
- Given an artifact referenced in a conversation and the same artifact referenced on its bet, when each is opened, then both land in the same view showing identical kind/identity/content.
- Given a block referenced in a conversation, when opened, then the Knowledge view opens positioned at that block.
- Given a review referenced in a conversation, when opened, then the review experience opens for that review.
- Given a reference whose kind has no registered view, when opened, then a fallback view renders (no blank, no crash).

**Plan calls.** Concept-introducing and consolidation-heavy — run `/concept AM5` first (lock the unified artifact-view family + the open/routing contract). Then `/design` (multi-variant, carrying the view-family-shape and open-affordance axes) → `/human-design-review`. Standard `/architecture` after the design locks. Likely splits during `/architecture` into a routing/contract layer and the standardized view-family surface — that's expected.

**Contracts / constraints.**
- Honor the L3 Artifact primitive invariants: kind determines the renderer; labels never affect rendering; unregistered kinds render a fallback (never crash, never blank).
- A block is a derived region of a markdown body — opening a block resolves to the Knowledge view; blocks are derived, never stored, so there is no standalone block-viewer surface.
- One open/routing contract resolves a reference to its destination view; no surface defines its own artifact/block/review viewer.
- No change to the Artifact or Block primitives' data shapes; no new on-disk format.
- No color/token changes — Hearth tokens unchanged.

**Out of scope.** The AM1 conversation rendering (consumes the contract via its chips; does not define the views). The review decision flow and verdict semantics (owned by the review experience / AL). New artifact kinds (the L3 primitive's concern). Backend/credential/auth changes.

**Effort.** L (~5d)
