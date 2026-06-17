# Agentic Coding / Agent-Work Chat — Critical Inventory

**Scope:** How agentic coding tools render an agent doing work and a human steering it. Products: Cursor, Claude Code, GitHub Copilot (Chat/Agent Mode + cloud agent), t3code, Devin, Windsurf/Cline.
**Lens:** HyperIdle's locked split — a **conversation** = deliberate threaded messages; a **session** = the agent's actual work execution (tool calls, edits, diffs), a SEPARATE lower-level surface *referenced* from the conversation, never inlined as the conversation.
**Verdict tags per item:** `[CONV]` belongs inline in a deliberate conversation · `[SESSION]` belongs in the lower-level session/execution view · `[SKIP]` not worth porting.
**Confidence:** High = primary docs / direct product behavior; Med = secondary write-ups, cross-referenced; Low = single source or inferred.

A critical caveat up front: **every product surveyed collapses conversation and execution into ONE scrolling transcript.** None of them honor HyperIdle's conversation-vs-session split. The chat IS the log. That is precisely the design decision HyperIdle is rejecting — so the inventory below is as much a catalog of *what to NOT inline* as it is of patterns to adopt. Read the verdicts adversarially: most "great" coding-chat affordances are great *because* coding-chat is a solo IDE side-panel, not a multi-party deliberate conversation.

---

## 1. Tool-call / activity rendering

### 1a. Compact tool-call status rows (Read / Edit / Bash / Search)
- **What:** Each tool invocation renders as a one-line row: an icon/marker + verb + target + result stat. Claude Code: a colored bullet (`●`) + `Read(file)`, `Update(file)`, `Bash(cmd)`, `Search(...)`, with the tool output collapsed beneath and truncated. Cursor/Copilot/Windsurf/Cline: equivalent "Read file X", "Edited X", "Ran command" rows in the chat stream. (High — Claude Code docs + JetBrains/transcript renderers; Cursor/Copilot/Cline secondary.)
- **User job:** Glance-level "what is it touching right now?" without reading raw output; trust through observability; spot a wrong turn early.
- **Rendered/interacted:** Foldable. Collapsed = status + stat; expand = full I/O (syntax-highlighted file content, command stdout, search hits). Claude Code truncates long output with an expand affordance. Status icon conveys pending / running / success / error.
- **Verdict:** `[SESSION]` for the raw rows. A deliberate conversation must NOT stream 40 "Read file" rows — that is the execution trace, the definition of a session. **BUT** one rolled-up line ("Read 12 files, edited 4, ran tests") `[CONV]` as a summary chip linking into the session. The atomic rows are the session's content; the count is the conversation's.

### 1b. The work-fold ("Worked for Xs" / "Thought for Xs")
- **What:** After a burst of activity, tools collapse the whole run into a single summary disclosure: "Worked for 34s", "Thought for 8s", expandable to reveal the steps. Claude Code shows a live spinner with whimsical verbs ("Flibbertigibbeting…") while running, then settles. (High — widely documented; Cursor/Copilot analogous.)
- **User job:** Compress noise; signal "I did a chunk of work, here's the receipt"; reduce cognitive load by defaulting to collapsed.
- **Rendered/interacted:** Single clickable summary line; expands to the ordered tool rows (1a). Duration + sometimes token/step count.
- **Verdict:** **`[CONV]` — this is the single most important pattern to steal.** The work-fold IS the bridge: a deliberate conversation message can carry a one-line "Worked 4m · 7 files · tests green" receipt that *expands into / links to* the full session view. It models exactly HyperIdle's split: summary in conversation, detail in session. Adopt the disclosure metaphor, point it at the session surface instead of inlining.

### 1c. Live terminal / command output
- **What:** Real-time stdout/stderr from `Bash`/run-command tools, streamed in-line. Devin gives a dedicated **Shell** tab with full command history + outputs, copy-command-and-output, jump-to-moment-in-timeline. (High — Devin session-tools doc; others render inline collapsed.)
- **User job:** Watch a build/test run; debug failures; copy a command; verify a real execution happened (not a hallucinated success).
- **Rendered/interacted:** Inline collapsed block in chat tools; Devin promotes it to a first-class workspace tab with timeline scrubbing.
- **Verdict:** `[SESSION]`. Raw terminal is the canonical execution artifact — it belongs in the session view (Devin's instinct to give it its own tab is correct). A conversation message references it ("CI run #3 — log") rather than dumping scrollback.

### 1d. Todo / task / plan checklist (live)
- **What:** Claude Code's `TodoWrite`/Tasks renders a live-updating checklist (done / in-progress with spinner / pending) in the terminal UI; Devin's **Planner** tab is a to-do list tracking progress; Copilot generates a markdown implementation plan. (High — Claude Code Tasks v2.1.16; Devin Planner.)
- **User job:** See the decomposition, current focus, and remaining work; catch a plan that misunderstands intent before code lands.
- **Rendered/interacted:** Checklist that mutates in place (NOT append-only log spam). In-progress item gets a spinner; Claude Code's Tasks also signal cross-session that work is active.
- **Verdict:** `[CONV]` for the plan-as-proposed and final state; `[SESSION]` for the second-by-second mutation. The plan is a *deliberate* artifact worth a conversation message (it's an intent-preview / approval point — see §3). The live thrashing of checkmarks is execution telemetry → session.

### 1e. Thinking / reasoning trace
- **What:** Collapsed "Thought for Xs" reasoning blocks; Devin exposes reasoning per session step under its Progress tab; t3code surfaces "full reasoning and tool call visibility" as a selling point. (Med-High.)
- **User job:** Explainability — understand *why* before trusting *what*.
- **Verdict:** `[SESSION]` raw; `[CONV]` only a distilled rationale ("Chose approach B because the schema is shared — see session"). Streaming chain-of-thought is the antithesis of a deliberate message.

---

## 2. Diffs & change review

### 2a. Inline red/green diff per edit
- **What:** Each file edit renders as a syntax-highlighted red/green diff. Claude Code shows before/after inline; Cursor shows it inline in-editor as changes happen; t3code has a dedicated diff viewer (unified + split) reviewable "turn by turn". (High.)
- **User job:** See exactly what changed at the line level; the primary trust gate for code.
- **Rendered/interacted:** Inline in chat (small edits) and/or in the editor gutter; split vs unified toggle (t3code).
- **Verdict:** `[SESSION]` for the full multi-hunk diff; `[CONV]` for an **embedded diff preview** — a compact, foldable diff card on the agent's message (a few hunks + "+128 −34 across 4 files", click to open full review in session). This is the embedded-artifact pattern HyperIdle wants: the message *shows a diff*, the session *owns the diff*.

### 2b. Per-file +/− stat rows + Changed Files list
- **What:** A list of touched files each with `+N −M`, often with a per-file diff-stat. Copilot: a **Changes** panel / changed-files list in the Chat view AND a dedicated Changes panel in the Agents window; Cursor: Source Control "Agent Review" comparing against main; VS Code marks pending-edit files with a dot in Explorer + tabs. (High — VS Code review-code-edits doc.)
- **User job:** Scope the blast radius; navigate file-by-file; decide what to keep.
- **Verdict:** `[CONV]` as a **summary manifest** on the message (the file list + stats is a perfect deliberate-message payload — scannable, scoped). `[SESSION]` for the actual per-file diff content behind each row.

### 2c. Accept/reject (Keep/Undo) edits — per-hunk, per-file, all
- **What:** Copilot: **Keep** / **Undo** per edit, navigate edits with overlay up/down, **Keep All / Undo All** across files from the Chat view, auto-reveal next file. Cursor historically: red/green inline with **Keep / Undo** (Accept/Reject) — *and a 2026 regression where agent mode wrote directly to disk with no diff/approval, which users loudly rejected* (signal: people WANT the review gate). Cline: each edit requires approval in Act mode. (High — VS Code doc, Cursor forum threads.)
- **User job:** Granular control over what lands; reject the bad hunk, keep the good.
- **Rendered/interacted:** Inline overlay buttons; batch buttons in chat; configurable auto-accept-after-delay (VS Code `chat.editing.autoAccept`) and glob auto-approve (`chat.tools.edits.autoApprove`).
- **Verdict:** **Reframe for HyperIdle.** Per-hunk Keep/Undo is an IDE-editing affordance → `[SESSION]`. In a deliberate conversation, acceptance is coarser and *social*: the human approves the change *as a message verdict* (approve / request-changes / reject), not by clicking 200 individual hunks. The session view is where you can still drill to per-file accept if needed, but the conversation's unit of approval is the whole proposed change, attached to a review message. **The Cursor regression backlash is the key evidence: removing the review gate broke trust — but the gate belongs at the deliberate decision boundary, not on every keystroke.**

### 2d. Commit / push / open-PR from the surface
- **What:** t3code: one button generates commit message → commits → pushes branch → opens the GitHub PR page. Cursor background agents: open a PR with an auto-summary of every change. Devin: review-from-code-review loop, jump back into session from PR. (High.)
- **User job:** Close the loop without leaving the agent surface; turn a run into a reviewable PR.
- **Verdict:** `[CONV]`/`[SESSION]` boundary artifact — the PR/commit is the *output* the session produces and the conversation references. HyperIdle analog: a session yields an artifact (diff/PR-like change-set) that an agent's conversation message links to and a human verdicts on.

---

## 3. Approvals / steering / permissions

### 3a. Plan mode vs Act/Build/Write mode
- **What:** Cline: **Plan** (read/search/discuss, cannot modify files or run commands) → **Act** (executes, retains plan context). Windsurf Cascade: **Chat** (read/Q&A, ~50% automated) vs **Write** (creates/edits files, runs scripts, ~90% automated). Copilot: Ask / Edit / Agent modes; "Start Implementation" flips a plan into agent execution. t3code: Chat vs Plan mode selector. Claude Code: Plan mode (read-only, proposes plan) toggled before acting. (High.)
- **User job:** Separate thinking from doing; align on strategy before any mutation; bound autonomy by intent.
- **Rendered/interacted:** A mode pill/toggle on the composer; mode constrains the toolset (Plan = read-only). Shift between modes mid-conversation, carrying context.
- **Verdict:** **`[CONV]` — strongly aligned with HyperIdle.** Plan mode = produce a deliberate proposal message (no side effects); Act mode = open a session to execute it. This maps cleanly: planning is conversation, acting is session. The mode toggle is the conversational gear-shift from "let's agree" to "go do it (in a session)".

### 3b. Approve-before-run / per-tool permission prompts
- **What:** Claude Code: every tool call surfaces a card (file diff / exact bash command) → approve or reject single-click, or batch-approve safe ops; Allow/Ask/Deny rules per tool; read-only by default, asks before mutating. Cline: file edits + terminal commands each require approval in Act mode; auto-approve toggle for "autopilot". Copilot: applies edits automatically but surfaces *risky* commands for confirmation; sensitive files (`.env`) force an approval-with-diff prompt. (High.)
- **User job:** Consent gate on dangerous actions; tune friction vs speed.
- **Rendered/interacted:** Modal/inline confirmation card with the exact action; allow-once / allow-always / deny; glob/auto-approve allowlists.
- **Verdict:** `[SESSION]`. Per-tool consent is execution-loop machinery — it belongs to the session's runtime, not the deliberate conversation. A conversation shouldn't be interrupted by "allow `rm`?" prompts. Exception `[CONV]`: a *blocking escalation* ("I need permission to deploy / touch billing") becomes a deliberate question message requiring a human verdict — that's the escalation-pathway pattern, and it IS deliberate.

### 3c. Permission levels / autonomy dial (full access vs supervised)
- **What:** t3code: "full automatic execution" vs "supervised mode requiring approval". Claude Code: Normal vs auto-accept-edits (Shift+Tab) vs broader auto modes. Devin: spectrum from watch-and-steer to autonomous parallel runs. Design literature ("Autonomy Dial"): per-task-type autonomy from "Observe & Suggest" → "Act Autonomously". (High; design-pattern Med.)
- **User job:** Set risk tolerance per task; trust earned incrementally.
- **Verdict:** `[CONV]`-adjacent config, `[SESSION]` enforcement. The *level* is a property of the work/relationship (set on the bet/task or the agent), enforced inside the session. A trusted teammate-agent might run sessions autonomously and only surface deliberate messages at decision points; a new agent runs supervised. HyperIdle's three agent levels (kernel/strategy/individual) already encode this — autonomy is a relationship property, not a per-message toggle.

### 3d. Interrupt / stop / steer mid-run
- **What:** Cursor: **Stop** button / Cmd+Shift+Backspace to cancel and redirect; Devin: "intervene early", take over the IDE, stop Devin, resume by telling it what you changed. Universal: type a new message to redirect. (High.)
- **User job:** Course-correct without aborting everything; the agent is heading wrong.
- **Verdict:** `[SESSION]` controls the running execution (stop/take-over). `[CONV]` is where redirection-as-message lives — "actually, use the existing helper" is a deliberate steering message that the active session picks up. **Key insight: in coding tools, steering is mashed into the same scroll as execution; HyperIdle can make steering a clean deliberate message that the session subscribes to.**

---

## 4. Context & input (the composer)

### 4a. @-mentions (file / folder / symbol / docs / web / branch / git)
- **What:** Cursor: `@file`, `@folder`, `@symbol`, `@codebase`, `@Docs`, `@web`, `@Branch` (full branch diff), `@git`. Windsurf/Cline/Copilot have equivalents. Mentions inject scoped context. (High — Cursor mentions doc.)
- **User job:** Hand the agent precise context; control what it sees; cheaper/faster than letting it search.
- **Rendered/interacted:** `@` triggers a typeahead picker; chosen mentions render as removable pills/chips in the composer; some resolve to live content at send time.
- **Verdict:** **`[CONV]` — adopt wholesale.** @-mention of HyperIdle primitives (a Bet, a Task, a knowledge Block, a file, a Session, another agent/person) is exactly how you ground a deliberate message and address teammates. This is the composer pattern that translates best to a multi-party agentic conversation. Mentioning *another agent* = addressing a teammate.

### 4b. Slash commands & skills
- **What:** Reusable commands invoked with `/` (Cline `/deep-planning`, Cursor custom commands, Claude Code skills/commands). (High.)
- **User job:** Invoke a packaged workflow/skill without re-prompting.
- **Verdict:** `[CONV]`. A `/` command in a deliberate message = invoke a skill/routine — already native to HyperIdle's model. Keep them in the composer.

### 4c. Rules / AGENTS.md / .cursorrules / custom instructions
- **What:** Persistent project ground-rules files (`.cursorrules`, `AGENTS.md`, Copilot custom instructions, Cline rules) auto-injected; glob-scoped team rules; `@mention` a rule to apply manually. (High.)
- **User job:** Standing guidance the agent always follows; encode conventions once.
- **Verdict:** `[SKIP]` from the conversation surface itself — but `[CONV]`-adjacent: rules are the *agent's standing config / system prompt* (HyperIdle: harness AGENTS.md, knowledge layer). They shape behavior silently; they're not messages. Surface only as "configured rules" affordance, never as inline chat.

### 4d. Model + reasoning-effort + mode pills on the composer
- **What:** Composer footer carries: model picker (Cursor Cmd+/ to cycle; t3code provider selector), reasoning/thinking-effort level (t3code "planning depth vs speed"), mode pill (Plan/Act/Chat/Write), access level (full/supervised). (High.)
- **User job:** Tune the run's cost/quality/autonomy before sending.
- **Rendered/interacted:** Small dropdowns/pills inline in the composer chrome.
- **Verdict:** Mixed. Mode pill → `[CONV]` (plan vs act is a deliberate choice, §3a). Model + reasoning-effort + access-level → `[SESSION]` config / agent property — these are *how the agent executes*, not part of the deliberate message's meaning. A teammate-agent shouldn't expose "reasoning effort" in a human-readable conversation any more than a colleague announces their IQ setting. Keep them out of the message; if anywhere, on the session/agent.

### 4e. Attached context chips (selections, images, errors, terminal)
- **What:** Drag/paste files, screenshots, lint errors, terminal selections into the composer as attached context. (Med-High.)
- **User job:** Ground the request in concrete current state.
- **Verdict:** `[CONV]`. Attachments on a deliberate message are normal and valuable (an image, a referenced artifact). Adopt.

---

## 5. Session / run framing

### 5a. What bounds a "run"
- **What:** Coding tools blur this — a "run" is one agent loop until it stops/asks; Cursor/Devin background agents run a whole task → PR. Devin: a **session** is the unit; multiple parallel sessions. T3code: a **thread** per task, worktree-isolated. (High.)
- **User job:** Know where one unit of work starts/ends; reason about cost and review per-unit.
- **Verdict:** This is the crux. HyperIdle has already named it correctly: **the session is the bounded execution; the conversation is the durable thread of deliberate messages that may spawn many sessions.** Coding tools conflate them (one thread = one run = one log). HyperIdle's edge is keeping the conversation as the stable spine and sessions as referenceable, disposable execution units beneath it. `[SESSION]` owns run boundaries; `[CONV]` references "Session #4 (done)".

### 5b. Cost / tokens / ACU
- **What:** Devin bills/shows ACUs (compute units) per session; Cursor token/cost tracking is famously *weak* in-UI (users build third-party trackers; forum requests for per-request/per-session $ unmet). Cline surfaces per-message tokens + session summary (the bar others fall short of). (High.)
- **User job:** Budget; know what a run cost; decide whether to continue.
- **Verdict:** `[SESSION]`. Cost is a property of the execution. Surface a per-session cost summary in the session view; optionally a tiny cost chip on the work-fold receipt in conversation. Not inline noise. (HyperIdle's "bets" framing already wants cost attached to work, not chatter.)

### 5c. Checkpoints / restore / branches / worktrees
- **What:** Cursor: auto-checkpoint before significant changes; click any checkpoint in the chat timeline to preview + restore files (local, separate from git) — *users report the UX as confusing/unintuitive*. Cline: shadow-git checkpoint after each tool use; three restore modes (Files / Task / Files+Task). t3code + Devin: git worktree isolation, one branch per task/agent for parallelism. (High.)
- **User job:** Undo a wrong turn without losing everything; run agents in parallel without collision; recover.
- **Rendered/interacted:** Checkpoint markers in the timeline; restore button; worktree = invisible isolation.
- **Verdict:** `[SESSION]`. Checkpoint/restore is execution-state machinery → session view's timeline. Worktree isolation is infra (HyperIdle already mandates worktree-per-task). `[CONV]` reference only: "restored to checkpoint before the migration" as a logged event. The confusing-checkpoint-UX lesson: don't expose raw restore in the deliberate conversation; keep it in the session's own timeline where the mental model is "this run's states".

### 5d. History of runs / multi-agent command center
- **What:** Devin **Agent Command Center**: a Kanban of every agent (local + cloud) by status (in progress / blocked / ready for review); **Spaces** group sessions+PRs+files+context per project. Cursor background-agent list. (High.)
- **User job:** Direct a fleet — see who's working on what, what's blocked, what's ready for review.
- **Verdict:** **`[CONV]`-adjacent / org-level, very relevant.** This is the "manager of agents" surface — maps to HyperIdle's Work view (team list / bets / status). The status taxonomy (in-progress / blocked / **ready for review**) is gold: "ready for review" is precisely the moment a session produces a deliberate review message + verdict request in the conversation. Adopt the status vocabulary; render the fleet in Work, the per-item dialogue in the conversation, the execution in the session.

---

## 6. Citations / grounding

### 6a. Which files/sources the agent used
- **What:** Read-file rows double as citations (the agent shows it read X before editing X). Cursor `@Docs`/`@web` cite external sources. Devin's Progress steps tie reasoning to the files/commands touched. Generally weaker than chat-LLM citation UIs — coding tools rely on the tool-call trace AS the citation. (Med.)
- **User job:** Trust grounding; verify the agent looked at the right things; audit.
- **Verdict:** `[SESSION]` for the full read-trace; `[CONV]` for a distilled "grounded in: schema.ts, the auth Bet, KB:billing-policy" citation line on the message. A teammate citing its sources is deliberate and valuable; the raw 40-file read-trace is session detail. HyperIdle's knowledge fabric makes this richer than coding tools — cite Blocks/Bets/Sessions, not just files.

---

## For a deliberate-message conversation where agents are teammates (opinionated)

**Thesis:** Every tool surveyed builds a *solo IDE side-panel transcript* where conversation = execution log. HyperIdle is building a *multi-party deliberate conversation* where agents are teammates. So **invert the default: the conversation shows the receipt, the session holds the work.** The work-fold (§1b) is the proof this is natural — even the coding tools collapse execution by default; HyperIdle just moves the collapsed body into a separate addressable surface instead of an expand-in-place fold.

**What an agent's message SHOULD show inline (`[CONV]`):**
1. **A human-readable summary** — what it set out to do, what it did, what it concluded. One paragraph, the way a teammate posts "Done — refactored auth to share the session helper; 4 files."
2. **A work-fold receipt chip** — "Worked 6m · read 14 · edited 4 · tests green · Session #7" — the §1b pattern, but the chip *opens the session view*, not an inline fold.
3. **An embedded change-set artifact** — a compact, foldable diff/manifest card: changed-files list with `+/−` stats (§2b), 1–3 representative hunks, "review full change →" into the session. The message *displays* the artifact; the session *owns* it.
4. **A grounding/citation line** — sources it used: Blocks, Bets, files, prior Sessions (§6).
5. **An explicit ask, when it needs one** — a plan to approve (§3a), an escalation/permission it can't self-grant (§3b exception), or a "ready for review" verdict request (§5d). This is where the message becomes a *review message* carrying HyperIdle's verdict actions.

**What stays in the lower-level session view (`[SESSION]`):**
- The atomic tool-call rows and their raw I/O (§1a, §1c, §1e).
- Per-hunk red/green diffs and per-file Keep/Undo granularity (§2a, §2c).
- Live terminal scrollback, the mutating todo checklist's frame-by-frame state (§1c, §1d).
- Per-tool permission prompts, checkpoints/restore timeline, cost/token accounting, model/reasoning-effort config (§3b, §5b, §5c, §4d).
- The full read-trace behind a citation (§6).

**How a human approves / steers via deliberate messages (mapping to HyperIdle verdict actions):**
- **approve** = the human's deliberate verdict on a review message that carries the agent's change-set artifact. This replaces the coding-tools' 200-hunk Keep-clicking — the unit of acceptance is the *proposed change as a whole*, decided socially in the conversation. (Drill-into-session for per-file accept stays available but is the exception, not the workflow.)
- **request-changes** = a deliberate steering message (§3d): specific, addressable, the agent opens a new/continued session to act on it. This is the §3a Plan→Act loop made conversational and multi-turn.
- **reject** = decline the change-set; the session's work is discarded/checkpoint-reverted (§5c) — but the *decision* is a clean deliberate message, not a silent Undo.
- **Plan-first as default for high-stakes work:** the agent posts a plan message (no side effects, §3a Plan mode), the human approves/edits it as a verdict, *then* the agent opens a session to execute. Intent-preview before action (the strongest pattern in the design literature) becomes a deliberate approve-gate.

**Biggest insight for agents-as-teammates:** The coding tools prove the work-fold/summary-over-detail instinct is right but stop short — they fold execution *in place* inside a solo log. HyperIdle's conversation/session split is the correct next move: an agent teammate **posts the way a human colleague posts** — a deliberate summary message with an attached, reviewable artifact and an explicit ask — while the messy execution trace lives in a referenceable session anyone can drill into but nobody has to scroll through. Approval stops being keystroke-level Keep/Undo and becomes a deliberate verdict on a proposed change. The Cursor "no-diff-on-disk" backlash proves humans demand the review gate; HyperIdle's win is putting that gate at the *deliberate decision boundary* (one verdict on a whole change-set) instead of on every hunk.

---

## Sources & confidence notes
- **Cursor** — review/diff/checkpoints/mentions/background-agents: docs (cursor.com/docs/agent/review, /checkpoints, /context/mentions) + community-forum regression threads (High for behavior, the disk-write-without-diff regression is forum-sourced = Med but multiply-reported and load-bearing).
- **Claude Code** — tool-call cards, permissions (Allow/Ask/Deny, auto-accept Shift+Tab), Plan mode, Tasks/TodoWrite, work-fold spinner: platform/code docs + transcript-renderer write-ups (High).
- **GitHub Copilot** — Agent mode, Keep/Undo, Keep-All, Changed Files, auto-approve globs, sensitive-file prompts, plan→Start Implementation, cloud coding agent: code.visualstudio.com review-code-edits doc + Microsoft Learn + GitHub blog (High).
- **Devin** — session tools (Shell/Editor/Browser/Planner tabs), Progress/reasoning, Use Devin's Machine, structured output, ACUs, Agent Command Center, Spaces: docs.devin.ai + cognition.ai blog + devin.ai/Windsurf-2.0 (High for UI structure; ACU specifics Med).
- **t3code** — three-panel layout, Chat/Plan mode, model+reasoning+access selectors, turn-by-turn diff viewer, one-click commit/push/PR, worktree parallelism; plus the maintainers' own design discussion (issue #511) on what agent UIs should optimize for (observability→explainability→parallelism→reviewability→recoverability→drill-down, and explicit "execution view vs human review view" + "summaries preceding raw logs"): BetterStack guide + GitHub issue #511 (High — #511 is primary-source design intent that directly endorses HyperIdle's split).
- **Windsurf/Cline** — Cascade Chat vs Write modes + Flows; Cline Plan/Act, per-tool approval, shadow-git checkpoints (3 restore modes), per-message token accounting, MCP: docs.windsurf.com + docs.cline.bot + deepwiki (High).
- **Agentic-UX design literature** — Smashing Magazine practical patterns (Intent Preview, Autonomy Dial, Explainable Rationale, Confidence Signal, Action Audit & Undo, Escalation Pathway; foreground intent-preview vs on-demand audit log) + Eleken/UX Magazine/Microsoft Design (Med-High; cross-referenced, used to pressure-test verdicts not as product behavior).

**Critical caveats applied:** Treated all secondary blog/marketing claims skeptically; the load-bearing claims (Cursor regression backlash, Copilot Keep/Undo, Devin tab structure, t3code maintainer design intent, Cline checkpoints) are corroborated by primary docs or the maintainers' own words. The single most important framing — that coding tools conflate conversation and execution into one log — is an observation across ALL six products, high confidence, and is exactly the assumption HyperIdle is right to break.
