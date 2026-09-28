# Audit A: docs/product + docs/guides/user + website copy

Base: origin/main 92178fb93. Every claim below checked against code, not neighbouring docs.
Paths are repo-relative. "UI" = layers/core-ui/src.

Key code facts that most pages get wrong (cited once here, referenced below):

- **F1: a task runs only when it is `accepted` and has an owner agent.** `layers/core-api/task/src/task-actions.ts:740-770`: dispatch happens only if `resolvedState === "accepted" && next.ownerAgentId`. Nothing picks up unowned work; no agent "adds subtasks" by itself.
- **F2: a fresh install has one person, one team named after the folder or "My Team", and one assistant** (`role:"assistant"`, `agentCategory:"individual"`, subscribed to all 9 object events, no prompt). `UI/pages/SetupFlow.tsx:320-352`. No team type, no presets, no roles.
- **F3: no API keys anywhere.** Setup asks for none (`SetupFlow.tsx:28-31`, `:103-105`); there is no Credentials section (`UI/pages/SettingsPage.tsx` sections list); harnesses use their own login (`layers/agent-execution/harness-registry/src/adapter-pool.ts:499-504`).
- **F4: harnesses are exactly claude-code, codex, opencode, cursor-agent** (`framework/domain-model/src/types.ts:118`). No built-in harness, no model catalog: model options come from each harness's discovered list (`UI/settings/model-options-for-harness.ts`).
- **F5: handoff = setting `ownerAgentId`** (`framework/domain-model/src/actions/task.ts:193`). No `toAgent/toRole/toHuman` anywhere in code.
- **F6: dependency auto-unblock moves the task to `accepted`, not `in_progress`, via `editTask`** (`layers/core-api/task/src/dependency-watcher.ts:73`), which emits `task.changed` (`task-actions.ts:819-822`) — so subscribers DO get an inbox row. Path is `layers/core-api/task/`, not `.../work/` (that folder no longer exists).
- **F7: trust gates nothing.** Approval rate is shown on the agent profile (`UI/pages/AgentProfile.tsx:531-540`) and used nowhere else; no risk tier exists in live code.
- **F8: no budgets, cost caps, WIP limits on teams, communities of practice, attention scores, knowledge merge/split/conflicts.** (truth sheet; confirmed: `UI/pages/DocumentList.tsx:14-15,57-61` only recency sort survives; `utils/scope-labels.ts:8-11` practice gone.)
- **F9: reviews = "agent asks, human clears".** The agent sends a review message and its session ends; the verdict resumes it. The UI never executes an action on approve. There are no "Executed"/"Execution failed" bands (no hits in UI).

---

## docs/product/index.md (9 lines)
**Verdict: FIX** (tiny)
- False: "trust gating" (:7) — see F7. "Product Decisions" entry (:9) goes if that page is deleted.
- Trim: "narrative funnel" wording; list one line per page.

## docs/product/what-is-hyperidle.md (55 lines)
**Verdict: FIX**
False/stale:
- "teams, budgets, knowledge" (:3), "spending $400" (:11), "budget enforcement" (:15) — no budgets (F8).
- "review gated by earned trust rather than blanket gates" (:25) — trust gates nothing (F7).
- "shared through communities of practice" (:27), "Documents organized by practice and scope" (:37) — practice is gone (`UI/utils/scope-labels.ts:8-11`).
- "one team per product, persistent" (:23) — a team is only a name (`teams` = id, name, createdAt); nothing ties it to a product.
- "Founders prune stale practices" (:37) — no practices.
Trim: the CrewAI/LangGraph comparison paragraph (:15) is fine once, but it is repeated in how-work-flows.md:20. Keep it here only.
Missing: bring your own harness **and your own login** (F3/F4) stated as a headline property; plugins as the way to get opinionated agents (role-personas, document-management); fresh install = you + one assistant (F2); runs as desktop app or self-hosted web.

## docs/product/how-work-flows.md (107 lines)
**Verdict: REWRITE** (the topic is needed; most specifics are wrong)
False/stale:
- "Team | Agents bound to a product | Life of the product" (:7), "The Acme team works on Acme…" (:18-22) — team is a name, no product binding.
- "A typical team: a Product Manager (team lead)… The roster flexes with the product's lifecycle phase" (:24) — no lead, no phase (BC5 removed them); fresh install has no team agents at all (F2).
- "An agent needed on a new product must finish its current work and transfer cleanly" (:24) — no such rule in code.
- "The founder moves it to accepted and the team begins" (:36) — only if an owner is set (F1).
- "See WIP limits" (:38) — team WIP gone; only per-agent `maxConcurrentSessions` remains.
- "An optional discussion thread" (:54) — every task has a thread (`threadId` NOT NULL, `framework/domain-model/src/actions/task.ts:80-83`).
- "Dependency Watcher (`layers/core-api/work/src/dependency-watcher.ts`)" (:63) — wrong path (F6).
- "When the context window is about to compact, the session ends. The agent writes session notes." (:69) — no compaction trigger; a session ends when the agent returns status / sends a review (return gate). Notes are an append field on the task, not an automatic step.
- "its practice's knowledge folder" (:73) — no practices.
- Whole "Handoffs" section (:77-83): `toAgent`/`toRole`/`toHuman`, "task moves to blocked" — false (F5). Asking a human is a review message (F9).
- "Helena (the Facilitator for Growth)… practice benchmarks" (:96-98) — fiction built on removed concepts.
Trim: all code-path citations (`framework/db/src/schema.ts`, etc.) — a published concept page does not need them; "Depth:" links into internal process-layer docs (several of those are stale: wip-and-cost-limits.md, handoff-and-lifecycle-propagation.md).
Missing: owner-based dispatch (F1); reviews as the one way an agent asks a human (move from human-ai-collaboration); outcome verdict (met / met_with_rework / partially_met / not_met) on a task; subscriptions fire for agents AND people (it has this — keep).

## docs/product/human-ai-collaboration.md (69 lines)
**Verdict: MERGE→ how-work-flows.md** (reviews section) + what-is-hyperidle.md (one "agents execute, humans validate" paragraph)
False/stale:
- "She hands the task to the founder — `edit_task({ id, ownerAgentId: founder.id })`" (:17) — owner must be a runnable agent; dispatch to a person fails `requireRunnableAgent` (`layers/core-api/task/src/task-run-resolver.ts`). Asking a human = review message (F9).
- "Individual agents — the Assistant (… created at registration…) or a plugin-provided agent" (:28) — assistant is created by setup (F2); there is no registration.
- "transitions from 'founder in every loop' on day one to 'founder only in loops that matter' by month six" (:38) and "Trust… grows as approvals accumulate and never becomes exemption" (:65) — nothing changes with approval rate (F7). The page contradicts itself at :36.
- Role table row "Curation subscriptions (any role, plugin-provided)" (:9) is fine but belongs in knowledge page.
Trim: `AGENT_CATEGORIES`, `users.agent_category` citations (:25); canvas internals `ToolLogo`/`CanvasSourceHeader`, "right detail pane" layout (:54-56) — internal UI detail; "Two agent categories" section entirely (an enum, not a concept users need).
Keep (move): five verdicts; one verdict resolves the whole review; nine canvas kinds as one sentence.

## docs/product/how-knowledge-compounds.md (43 lines)
**Verdict: FIX + trim**
False/stale:
- "What one agent learns on one product becomes available to every agent working in the same team" (:3) — "product" is not a concept; say team.
- "Rich cards … scope filters" (:15) — list is a tree + Triage tab with recency sort only (`UI/pages/DocumentList.tsx:2,14-15,28`).
- Links to `sync-and-conflict-resolution.md`, `the-knowledge-fabric-how-knowledge-moves.md`, `the-canonical-store.md` (:18,24,25) — published readers are sent to internal docs built around removed concepts (fabric, conflicts). Verify or drop.
Trim: table column dump of `documents` (:11), file-watcher/writeback paths (:18), `SCOPE_KINDS` citation (:35). "TOON packs" (:16) is internal format detail (true: `layers/agent-orchestration/run-orchestration/src/context.ts:99-190`) — cut.
Keep: one store, humans + agents read/write the same documents; agents see them as a `knowledge/` folder that saves back (true: `context.ts:353`, `file-watcher.ts:39`); scope = who sees it; statuses; document-management plugin triage/decay/retro (true: `plugins/document-management/plugin.json` — note it installs factory-wide, weekly Sunday schedule).
Missing: curation only happens if you install the document-management plugin — out of the box nothing triages or decays.

## docs/product/product-decisions.md (64 lines)
**Verdict: DELETE from the website** (move to docs/archive or keep out of nav)
- It is a founder decision journal: dated ("June 2026 feature audits"), full of work-item ids (BC4 :11, U1 :15, AD9 :17, AD7 :57, AD6 :58), "decided, not yet executed" lists, "never re-report as missing" (:51) — every one of these breaks .claude/rules/docs.md (history, ids, not "what is true now"). Audience is agents doing audits, not users.
- False: `layers/core-api/work/src/dependency-watcher.ts` and `app.ts:493` (:59) — path gone, line wrong (now `layers/core-api/src/app.ts:8,592`, package `@hyperidle/task`). "Org-chart settings page removal … pending" (:26) — still shipped; either remove the page or drop the claim.
- Caveat: a migration comment cites this file (truth sheet). If deleted, update that comment or leave the file in archive.
- Anything durable (no merge/split, no per-skill autonomy, no pause state) is a design rule, not user docs; it can live in docs/architecture decisions.

---

## docs/guides/user/index.md (24 lines)
**Verdict: FIX**
- "the three agent categories" (:12) — two (`types.ts:97`).
- "Settings — … Models, … trust configuration" (:14) — no Models section, no trust config.
- "WIP limits — how concurrency is bounded" (:24) — points to a stale internal doc; drop.
- "Deployment" entry (:16) — goes if deployment.md is merged.
- Intro "Every session, decision, and pattern is captured and reused" (:3) — overclaims; capture needs the plugin.
Trim "Deeper reference" block: all 5 links go to internal docs rendered on GitHub; keep at most one.

## docs/guides/user/getting-started.md (210 lines)
**Verdict: REWRITE** — this is the website's Installation entry point and it is the worst page.
False/stale:
- Prerequisites "A way for your agents to think — either a model provider API key… Anthropic… OpenRouter… Any OpenAI-compatible provider" (:13-19) — no key path exists (F3). Contradicts its own :98.
- "Step 4 … What are you building? — pick a team type. The default preset is software…" (:100) — removed (`SetupFlow.tsx:63`). Setup is: name, harness, optional folder.
- "A user record and Team are created" (:102) — plus the assistant (F2); it lands on `/work?onboarding=true` and opens the assistant overlay (`SetupFlow.tsx:358`).
- "The other backends become useful when you want to route specific agents through a locally-authenticated CLI" (:110) — every backend is a local CLI now (F4).
- Whole "API key via environment variable" section, "Settings → Credentials" (:116-125) — no Credentials section; server does not read `ANTHROPIC_API_KEY` for agents.
- "A Task is a time-boxed chunk of work" (:146) — no time box anywhere; product docs say "no deadlines".
- Option B form: "Description editor (required)… Title preview auto-derived" (:161-162) — form is Title (required), Description, Goal, Team (`UI/pages/WorkTaskCreate.tsx:62-65,166-209`).
- "To start agents, open the Task and accept it… Agents on your team will begin adding subtasks" (:168), and step 7 "the agents on your Team pick up its subtasks" (:178) — false (F1). A fresh install has no team agents; you must set an owner (assistant or a plugin agent) and accept.
- Troubleshooting "Confirm your API key is set (Settings → Credentials or ANTHROPIC_API_KEY)… `no API key` or `401`" (:181-182) — F3.
- "Re-running setup … all inserts use `onConflictDoNothing`" (:63) — internal detail; cut.
- "Knowledge layer → Three Core Views" row (:206) fine; "Connect backends and credentials → Connections" (:208) — credentials gone.
Trim: "Time: 10 minutes" (:5) — docs rule: no estimates. Expected-output blocks can stay but shorter.
Missing: desktop app install as the first path (DMG/Homebrew — currently only in deployment.md); "install a plugin" step (Settings → Plugins → role-personas for a team, document-management for curation); set an owner on your first task; subscriptions/inbox basics.

## docs/guides/user/the-interface.md (94 lines)
**Verdict: FIX + trim**
True: two columns; ⌘K, ⌘[ ⌘], ⌘1/2/3 (`UI/hooks/useNavShortcuts.ts:64-80`); Search/Assistant in the sidebar top row; Notifications popover with unseen dot, mark-seen on open, dismiss.
False/stale:
- J/K "exists only on the Knowledge list" (:35) — only on the Triage tab (`DocumentList.tsx:234-264`); `v` accepts, `x` archives.
- Search "Work — tasks (description, done condition)" (:44) — only root tasks (`layers/core-api/src/routes/search.ts:278-283`). "Conversations — thread titles and the latest message's text" (:43) — matches any message in threads you're in; title = first message.
- "Rows older than 30 days are cleared automatically" (:77) — only READ rows older than 30 days (`layers/core-api/src/service-bootstrap.ts:307-309`).
- "Auto-unblock is silent … moves it to `in_progress` without adding an inbox row" (:78) — both halves false (F6).
- Setup-notice table (:88-92): "No API key yet → Settings → Connections to add your key" — no server code emits any of these notices (`missing_key|missing_harness|provider_error` appear only in the schema and `UI/shell/AssistantOverlay.tsx:95-111`); the card itself points to a non-existent "Settings → Credentials". Remove the table.
Trim: the "Dialogs and Overlays" section (:49-58) — overlay z-order and dirty-guard focus rules are design-system internals; one sentence ("Esc closes; unsaved text asks first") is enough. ASCII diagram (:3-8) adds nothing.
Missing: inbox rows only come from your own subscriptions — a fresh person has none, so the inbox is empty until they toggle events on (true: `SettingsNotifications.tsx:1-6`; setup subscribes only the assistant).

## docs/guides/user/three-core-views.md (118 lines)
**Verdict: REWRITE** (keep structure, replace most specifics)
False/stale:
- "Sending mid-session… Your message queues ('Queued · sends when the agent finishes')" (:25) — the session view's send is a no-op (`UI/pages/Conversations.tsx:207-210`).
- "After approving an action … approving triggers it immediately … Green Executed / Red Execution failed" (:51-54) — no such UI; approval resumes the agent (F9).
- "Request changes | Blocks the agent until it revises"; "Approve | Agent proceeds" (:41-45) — the agent is already stopped; every verdict resumes it with the verdict.
- "Quick questions … answering is not yet wired to the backend" (:58) — it is wired: an answer posts as a plain message (`UI/components/ConversationSurface.tsx:232`, `components/PartList.tsx:52-53`).
- "The composer … '+' opens a tools menu — Insert block, Attach file, Mention, Reference item, Format, Emoji" (:62) — ConversationSurface renders a plain DS Composer with no leading slot (`ConversationSurface.tsx:248-256`); none of those menu items exist.
- "Work overview … status chip (healthy / behind / blocked)… blocked first, then behind" (:74) — only `blocked` or `healthy` (`UI/hooks/useTeams.ts:80-81`).
- "No subtasks yet + Add an agent" state (:87) — the tree shows only "No subtasks yet." (`UI/pages/WorkTaskPage.tsx:183`); no Add-an-agent button there.
- "Accepting … 'No subtasks yet' until agents on the team begin adding work" (:92) — F1.
- Knowledge "Two tabs: Triage … and Curated (items grouped by topic). Sort pills: relevance (default), recency, frequency. Topic health indicators" (:111) — Curated is a nestable tree; only recency sort; no topic health (`DocumentList.tsx:14-15,28,57-61`).
- "Shared — company-wide and cross-team knowledge" (:105) — Shared = factory scope only (`utils/scope-labels.ts:52`).
- "Merge and split exist as API operations but have no UI yet" (:118) — deleted.
- Link to `process-layer/artifact-primitive.md` (:49) — artifacts table is gone; derived `as` on read.
Trim: visual-style prose ("No bubbles, no badge soup", green avatar, caret) (:9,19) — design-system detail; SessionView fold mechanics (:18-23) → one sentence.
Missing: Work page lets you set an owner and state on a task (`WorkTaskPage.tsx:517-526`); outcome section; the Knowledge tree (nest/move/parent picker, `pages/document/MoveDialog.tsx`, `ParentPicker.tsx`); Promote to task lives here, not in running-your-team.

## docs/guides/user/agents.md (36 lines)
**Verdict: REWRITE** (short page, but core claims wrong and key things missing)
False/stale:
- "created for you at registration" (:7) — created by setup (F2); no registration flow exists.
- "the Assistant never changes task state on your behalf without your confirmation" (:13) — nothing enforces that; it has the same `edit_task` as any agent and wakes on every object event (F2). Say what is true: it can, and you see every change.
- "A new team starts with one agent and nothing decided about it" (:19) — the one agent is your individual assistant, not a team agent. Team agents come from you or the role-personas plugin.
- Session steps "Creates review items… Finishes and captures learnings back into the knowledge layer" (:33-34) — review = review message; learning capture is not automatic (only the plugin's post-task-retro).
- "Agents pick up work from accepted tasks" (:36) — only tasks they own (F1).
Missing: what wakes an agent (owned task accepted, mention/message in its thread, a subscription on an event or cron schedule); how to add an agent (Work → team page "Add agent", or Settings → Agents, or install role-personas); per-agent harness + model + max concurrent sessions; agent profile page (subscriptions, approval rate); stopping a session.

## docs/guides/user/running-your-team.md (112 lines)
**Verdict: FIX, heavy trim** (or MERGE→ three-core-views.md; the "situations" are mostly view how-tos)
False/stale:
- Rhythm timings "~3 / ~15 / ~20 / ~30 minutes" (:7,13,22,28) — docs rule: no estimates.
- "Triage tab — it is sorted by attention score … resolve conflicts" (:25) — attention score and conflicts removed (F8).
- "Switch the sort to recency" (:26) — recency is the only sort.
- "Open the assistant pinned thread" (:30) — the assistant is an overlay, not a pinned thread (three-core-views.md:66 says so itself).
- Promote to task: "The task header shows 'From knowledge: <title>' with a link back" (:48) — no such header (`sourceDocumentId` is stored but WorkTaskPage never reads it). Rest of promote flow is true (`UI/pages/DocumentDetail.tsx:520-547`).
- "No subtasks … confirm there is at least one agent with an appropriate role (builder, product manager, etc.)… click Add an agent (visible in the 'No subtasks yet' state)" (:58-59) — no such button; real fix is set an owner (F1).
- "Killing a task" (:73-82): overflow "Kill", confirmation dialog, "Enter a reason (required)", "Running agents finish their current step first" — none exist. Kill = pick `killed` in the state select (`WorkTaskPage.tsx:114-123`); subtree killed and runs stopped (`task-actions.ts:736-737,805-806`); stop kills the process.
- "The agent revises and resubmits" (:104) — it resumes with your verdict; fine but same as F9 wording.
- "At the limit, new work queues or moves to a teammate" (:110) — it queues/retries; no reassignment (`layers/core-api/src/services/agent-run-admission-reactions.ts:1-14`).
- Link to WIP Limits (:112) — stale internal doc.
Keep: sessions list on the task page (true, `WorkTaskPage.tsx:896-933`, states active/done/stopped/crashed); stale-save refused (last-writer conflict rule, version check).
Missing: pausing/adding subscriptions for an agent (agent profile); installing plugins.

## docs/guides/user/settings.md (120 lines)
**Verdict: REWRITE** (section list right, contents wrong)
False/stale:
- "Profile | Your name and email" (:7,22) — no email (`UI/settings/SettingsProfile.tsx:5-6`).
- "Worker" listed as its own section (:17) — it is a sub-area under Backend (`UI/pages/SettingsPage.tsx:150-165`).
- Add Agent "Team — defaults to the first … Model — from the model catalog" (:42,49) — add dialog is on the team page with a fixed team; fields: name, role, system prompt, harness, max sessions — no model (`UI/pages/AgentAddDialog.tsx:152-224`).
- "Model — one of the closed model catalog: Opus 4.8, Sonnet 4.6 (default), Haiku 4.5, or Fable 5" (:56) — no catalog; options are the harness's discovered models + "System default" (F4).
- "Harness … (e.g. Built-in, Claude Code) … Defaults to Built-in" (:57) — no built-in (F4).
- "An amber warning chip appears … not registered on any available worker" (:59) — no such chip found in SettingsAgents/AgentEditor.
- "approval rate crossed with the risk tier of the action" (:61) — no risk tier, no gating (F7).
- Filesystems "Register a filesystem once here with + Add filesystem" (:73) — the section is a read-only list (`UI/settings/SettingsFilesystems.tsx`); folders are added in setup or via `edit_user` (agent/assistant).
- Agent backends "Enabling and disabling backends … switch … The built-in backend cannot be disabled" (:96) — no toggle, no built-in. "Click Models … confirmed capabilities … 'Capabilities confirmed after first run'" (:98) — detail pane shows Models list + Login command only (`UI/settings/SettingsHarnesses.tsx:110-152`).
- Cursor row "Sign in to Cursor; HyperIdle inherits that login" (:86) — discovery shows `cursor-agent login` (`layers/agent-execution/harness-registry/src/harness-discovery.ts:675`).
Keep: Org chart (still shipped), Plugins paragraph (accurate: `UI/settings/SettingsPlugins.tsx:1-19`), Notifications, Backend modes.
Missing: Skills & rules section has no description; agent subscriptions live on the agent profile, not Settings; per-agent model options (effort etc.) live on the agent editor (mentioned in three-core-views :27 — move here).

## docs/guides/user/connections.md (83 lines)
**Verdict: KEEP (minor FIX)**
Verified: three groups, add token / MCP flow, labels (`UI/settings/SettingsConnections.tsx:164-165,426-457`), AES-256-GCM (`layers/agent-orchestration/connections/src/index.ts:28`), inherited detection (`connections/src/inherited-reach.ts`).
Fix/trim:
- "There is currently no Validate action … will stay until a validate UI is surfaced in a future release" (:32) — docs rule: no future plans. Say "the chip stays amber; it is informational".
- "Where to get your token" vendor click-paths (:34-38) — third-party UI, will drift; cut to one line.
- Link to internal `architecture/connection-model.md` (:5) — fine if that doc is current; otherwise drop.

## docs/guides/user/deployment.md (19 lines)
**Verdict: MERGE→ docs/deployment/index.md** (then DELETE)
- Duplicates the Installation nav section, which already renders docs/deployment/* (`applications/website/src/lib/docs-nav.ts:31-41`).
- False: "(`framework/host-process/src/profiles.ts`)" (:5) — folder doesn't exist; it's `applications/remote-server/src/profiles.ts` / `tools/setup/src/setup-cli.ts`. "`npm run setup -- --profile …` … applies migrations itself" (:13) — only for laptop; vps prints compose instructions, runs nothing (`tools/setup/src/setup-cli.ts:255-270`).
- Move its one useful line (desktop app = signed DMG / Homebrew) to getting-started.

---

## Website marketing copy (applications/website/src/**/*.astro)

Stale concepts to fix (all are copy, not code):
- `components/Hero.astro:13-14` — "Work ships as time-boxed bets … the next bet starts with". Bets gone (root task); no time box.
- `components/Capabilities.astro:23` — "Rosters derive from your team's functions — Builder, Designer, Product Manager, QA, Growth" — function presets removed; these roles now come only from the role-personas plugin.
- `Capabilities.astro:30-32` — "Work ships as bets … draft → active → completed or killed" — no bets; task states are proposed/accepted/hold/in_progress/blocked/review/done/killed.
- `Capabilities.astro:41` — "the tenth bet is faster".
- `Capabilities.astro:59` — "Committing a bet is always your action … trust is earned from your verdicts" — trust gates nothing (F7); accepting is not human-only (any agent can `edit_task`).
- `components/Audience.astro:14` — "on the bets". `:18` — "One product, one team, its own roster" — team is only a name, not product-bound.
- `components/FinalCta.astro:13` — "Your first bet, running today." `:3,15` — "ten minutes" (estimate, sourced from getting-started).
- `components/VideoSlot.astro:14` — "See a bet run".
- `pages/index.astro:13` — meta description "Work ships as time-boxed bets".
- `pages/docs/index.astro:13` — "your agents, team rhythms" (fine if running-your-team kept).
- Missing on the site: bring-your-own harness (claude-code, codex, opencode, cursor-agent) — the single most concrete differentiator; plugins; subscriptions.
- `docs-nav.ts` must drop product-decisions and guides/user/deployment if those go.

Out-of-scope code copy seen while verifying (stale UI strings, not docs — flag to owner):
- `UI/pages/SetupFlow.tsx:127` hint "Bets & tasks".
- `UI/pages/WorkTaskCreate.tsx:88` "Team is at its concurrent task limit." for `capacity_exceeded` — team capacity is deleted.
- `UI/shell/AssistantOverlay.tsx:95-101` "No API key yet … Settings → Credentials" — notice never emitted and target doesn't exist.
- `UI/settings/SettingsHarnesses.tsx:100` comment mentions a "Provider keys" section that no longer exists.
- `UI/pages/WorkOverview.tsx:4` comment "active-bet count".

---

## Proposed target structure

Concepts (docs/product) — 278 lines → ~150
- `index.md` (~6) — list of the three pages.
- `what-is-hyperidle.md` (~40) — what it is, who for, bring your own harness + login, plugins bring opinions, humans validate / agents execute (absorbs the trust paragraph from human-ai-collaboration, stated truthfully).
- `how-work-flows.md` (~70) — task tree, owner + accept = run, dependencies, sessions, reviews and the five verdicts ("agent asks, human clears"), outcome verdict, subscriptions for agents and people. Absorbs human-ai-collaboration.md.
- `how-knowledge-compounds.md` (~35) — one document store, tree + scope, statuses, agents' `knowledge/` folder saves back, curation via the document-management plugin.
- DELETE `human-ai-collaboration.md` (merged), `product-decisions.md` (archive; fix the migration comment that cites it).

User guide (docs/guides/user) — 885 lines → ~480
- `index.md` (~12) — page list, no internal "deeper reference".
- `getting-started.md` (~110) — desktop app or repo install; setup (name, harness, optional folder); what you get (you + assistant); install a plugin; create a task, set an owner, accept; answer a review.
- `the-interface.md` (~50) — sidebar, shortcuts, search, inbox, assistant overlay.
- `three-core-views.md` (~80) — Conversations (threads, session view, reviews), Work (overview, team, task page: owner/state/deps/outcome/sessions/kill), Knowledge (tree, Triage, scope pills, promote to task).
- `agents.md` (~50) — assistant, team agents, what wakes an agent, subscriptions, harness/model per agent, plugins.
- `running-your-team.md` (~40) — a short playbook: blocked agent, disagree with an approach, stale-save refusal, nothing is running (check owner + harness). No timings.
- `settings.md` (~70) — one short paragraph per real section.
- `connections.md` (~65) — as is, minus future-release line and vendor click-paths.
- DELETE `deployment.md` (merge into docs/deployment/index.md).

Total in scope: 1163 → ~630 lines.
