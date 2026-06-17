# AI-Chat Surface — Critical Inventory (ChatGPT · Claude.ai · Gemini · Perplexity)

**For:** AM1 conversation-surface redesign. **Date:** 2026-06-17.
**Lens:** HyperIdle rejects transcript-as-conversation. A Conversation = deliberate, threaded messages; the agent's work-log is NOT the conversation. Artifacts/sessions are *referenced/embedded* (the Part/Embed model), never the chat itself. So for each item I judge: **essential vs skippable for a multi-agent teammate product**, and **embedded "Part" vs separate surface**.

**Confidence convention:** [H] high (official docs / direct product knowledge, cross-checked), [M] medium (consistent secondary sources), [L] low (single/SEO-spam source, treat as directional). The web is noisy — many hits were SEO content farms; I leaned on the official help centers (support.claude.com, help.openai.com, support.google.com, openai.com/index) and cross-checked the spammy ones against my own product knowledge.

---

## 1. Artifacts / Canvas — the "artifacts like AI" core

The single most load-bearing pattern for AM1. All three majors converged on the **same shape**: substantial generated content gets evicted from the chat scroll into a **persistent side pane** that is versioned, directly editable, and re-runnable — while the chat remains a stream of short messages that *drive* it. This convergence is itself the strongest signal: the industry independently decided that generated documents/code/apps do **not** belong inline in the message stream. That is exactly HyperIdle's Part/Embed thesis, arrived at from the other direction.

### Claude Artifacts [H]
- **What:** A dedicated window to the right of the chat where standalone content renders: Markdown/text docs, code, single-page HTML sites, SVG, diagrams, **interactive React components** (live-runnable, can call the Claude API + use a small allow-listed lib set).
- **Job:** Give a long/reusable output a home you can edit, iterate, keep, and share — separate from the throwaway conversation.
- **Invocation:** *Automatic heuristic* — Claude creates one when content is "significant and self-contained" (rule of thumb ~15+ lines), likely to be edited/reused, stands alone without conversation context. Not an explicit user mode (contrast ChatGPT/Gemini, which expose a Canvas *button*). User can also ask explicitly.
- **Relation to the producing message:** The message stays in the scroll but is *reduced to a clickable card/chip* ("Created `tax-calculator.tsx`") that opens the pane. The artifact is a first-class object referenced **by** the message, not rendered **as** the message body. Switch between multiple artifacts in a chat via a slider/control (upper-right).
- **Versioning:** Every edit is a new **non-destructive version** (snapshot). A **version selector** browses iterations; "your edits won't change Claude's memory of the original." Editing an *earlier chat message* **forks** the version history at that point (a branch in the timeline), letting you explore directions without losing prior work. [H]
- **Editing:** Side-by-side. **Preview ⇄ Code** toggle (top). For Markdown, **highlight text → "Edit with Claude" → type request** (targeted, not full regen). For multi-file artifacts you can queue multiple edit requests across files before submitting (the file list shows pending counts). Copy-to-clipboard and download.
- **Sharing / remix / publish:** **Publish** → public link viewable without a Claude account; account-holders can **Remix** (own copy, original untouched). A **community catalog** of published artifacts to browse/remix. [H]
- **Newer (2026):** **Live Artifacts** — persistent dashboards in "Claude Cowork" (Claude Desktop, mac/Win) that re-pull fresh data on open. Artifacts can call **MCP servers** (Drive, Gmail, Slack, Linear, etc.). [M]
- **Error loop:** "Try fixing with Claude" copies the error into a new message — a structured feedback edge from artifact → conversation.

### ChatGPT Canvas [H/M]
- **What:** A split view — chat left, an editable **document/code workspace** right — for writing & coding tasks needing revision.
- **Invocation:** *Explicit* — "Canvas" is one entry in the composer **Tools** menu (also opens automatically for suitable tasks). Distinct from Claude's purely-automatic model.
- **Editing:** Direct in-place edit of text/code; **highlight a region → ask for a targeted edit or a question**. Quick **shortcut buttons**: writing → suggest edits (inline), adjust length, change **reading level** (Kindergarten→Grad), final polish, add emoji; coding → review code, add logs, add comments, fix bugs, **port to another language**. Can **run Python** in canvas (code execution). [M]
- **Versioning:** A **back button** restores previous versions (lighter than Claude's explicit version-selector + fork model). [M]
- **Relation to message:** Same shape — the canvas is a side surface the chat drives; the chat turn that created it is a short message.

### Gemini Canvas [H/M]
- **What:** Interactive side-panel workspace: docs (rich text + LaTeX), code with **live Preview tab + console**, and *derivative* generators — web pages, infographics, quizzes, **Audio Overviews**, slides.
- **Invocation:** *Explicit* — "Canvas" button below the input at gemini.google.com.
- **Editing:** Live updates as you keep chatting; **Select & ask** for targeted section edits; quick **Change length / Change tone** buttons (no selection needed). **Code** view for direct edits, **Show console** for errors/logs, **Show recent changes** (diff). Auto-saved.
- **Export / share:** **Export to Google Docs** (docs), **Google Colab** (Python), **Google Slides** (presentations); public **share link** (`g.co/gemini/share`). Version-history navigation (prev/next iteration).

### Cross-product synthesis (the artifact model in one frame)
| Axis | Claude | ChatGPT | Gemini |
|---|---|---|---|
| Invoke | Auto-heuristic | Tools button + auto | Canvas button |
| Pane | Right side | Right split | Right side panel |
| Code/preview toggle | Yes | Yes (+run py) | Yes (+console) |
| Targeted edit | Highlight→Edit | Highlight→edit + shortcuts | Select & ask + tone/length |
| Versioning | Snapshot list + **fork on message-edit** | Back/restore | Prev/next nav |
| Share | Publish + **Remix** + catalog | (link) | Share link + export to Docs/Slides/Colab |
| Run external data | MCP / Live Artifacts | Connectors/agent | — |

**Verdict for HyperIdle:** **Essential, and the centerpiece.** This *is* the founder's "artifacts like AI." The decisive design choices to steal: (a) substantial output lives in a **separate pane**, not inline; (b) the producing message carries only a **compact Embed card** that opens it; (c) **versioning is first-class** and message-edit **forks** the artifact lineage; (d) **targeted highlight-edit** beats full regeneration. Maps cleanly onto AM1's `ArtifactEmbed` Part + a separate artifact surface.

---

## 2. Message rendering

Per item: what · job · render/interaction · verdict.

- **Markdown** [H] — headings, lists, bold/italic, blockquotes, links. Job: structure prose. Rendered as styled HTML in the message body. **Essential. → core Part content.**
- **Code blocks** [H] — fenced, **syntax-highlighted**, with a **language label** + **copy button**; sometimes **run** (canvas/interpreter). Job: legible, reusable code. **Essential as a rendered Part;** "run" belongs to the artifact/session surface, not the calm conversation.
- **Tables** [H] — Markdown tables; ChatGPT data-analysis produces **interactive/expandable** tables. Job: tabular data. **Essential (static); interactive table → Embed/artifact, not inline.**
- **Math** [M] — LaTeX/KaTeX inline + block (Gemini Canvas explicitly LaTeX; ChatGPT/Claude render `$…$`). Job: equations. **Skippable for v1** unless the team writes math; cheap to add as a Part renderer.
- **Citations / sources (Perplexity-style)** [H] — **inline numbered chips** `[1]` bound to specific claims + a **source list / Sources tab** (typically 3–10 sources); hover/click → title, domain, snippet. Job: verifiable provenance. **HIGH-VALUE for a teammate product** — agents must show where claims came from. **→ inline citation chips as an in-Part element + a foldable source list.** This is the single most-underrated borrow: trust comes from provenance, and a multi-agent product lives or dies on "never act in the dark."
- **Images** [H] — generated or uploaded images render inline with a lightbox/expand; download. Job: visual content. **Essential as a Part;** generated-image *editing* → separate surface.
- **File / inline previews** [H] — uploaded PDFs/CSVs/docs show a **chip with filename + type + size**, expandable. Job: confirm what was attached/referenced. **Essential — maps directly to an Embed (file/block ref).**
- **Streaming / typing** [H] — tokens stream live; stop button. Job: perceived responsiveness, interruptibility. **Essential**, but note: in a *deliberate* conversation the streamed thing is a posted message, not a live activity feed — keep the stream scoped to message generation, not work-log events.
- **"Thinking" / reasoning disclosure** [H] — a **collapsible "Thinking" block above the answer** (Claude extended thinking; ChatGPT "Thinking"; Gemini). Streams reasoning, collapses to a summary. API separates `thinking` vs `text` content blocks — the app *chooses* to surface it. Job: show work / build trust without cluttering. **This is literally the Fold device.** **Essential pattern, but reframe:** reasoning is **session/work-log content**, not a deliberate message. In HyperIdle it belongs to the session view (AM3) behind a **Fold**, surfaced in the conversation only as a one-line summary on the Session-reference Embed — *not* as first-class conversation Parts. This is the cleanest example of the line AM1 must hold.

---

## 3. Message actions

- **Copy** [H] — copy message text/code. **Essential. → Part action.**
- **Regenerate / Retry** [H] — replay last turn for a new response; ChatGPT lets you pick a different model/effort on retry. Job: reroll a bad answer. **Essential for agent messages** (re-ask the agent), but in a *deliberate* model a regenerate produces a *new* message/branch, not a silent overwrite.
- **Edit-your-message + branch/versions** [H] — edit a prior user message; **everything after is forked into a new branch**, prior branch reachable via ◀ ▶ arrows; the original stays in history. ChatGPT + Claude both do this; Claude also has **/rewind**-style checkpoint restore (conversation/code/both). Job: explore alternatives without losing the thread. **Powerful but tension-heavy for HyperIdle:** branching a *multi-party* deliberate conversation (humans + multiple agents) is semantically harder than a 1:1 chat. **Likely skip full branch-trees for v1;** edit-then-resend as a new message is enough. Flag as a deliberate non-goal.
- **Thumbs up/down + feedback** [H] — rate a response; thumbs-down opens a flag/comment form; feeds model training. Job: quality signal. **Skippable for the conversation surface** (HyperIdle has a real `verdict` message type that is far richer — use that, not a training-thumbs).
- **"Continue"** [M] — extend a truncated/cut-off response. **Skippable** with modern context windows; trivial to add.
- **Read-aloud / TTS** [H] — speaker icon plays the message (37 langs, ChatGPT). Job: accessibility / hands-free. **Skippable for v1; accessibility-nice-to-have.**
- **Share-this-message** [M] — deep-link or copy a single message. **Skippable;** conversation-level share is enough.
- **Fork conversation** [H] — branch the *whole* chat from a point into a new chat (ChatGPT "Branch"). Job: spin a tangent without polluting the main thread. **Maybe** — HyperIdle threads are host-attached; a "branch" is closer to spawning a new Thread. Out of scope for AM1 rendering.

---

## 4. Conversation-level

- **Conversation list / history** [H] — left sidebar, reverse-chron, grouped by recency. **Essential** (Conversations view already exists).
- **Rename** [H] — pencil/inline edit of title (auto-titled by the model on first turn). **Essential.**
- **Pin / Archive** [H] — pin to top; archive hides but keeps searchable; restore. **Essential-ish** (low cost, high tidiness payoff).
- **Search history** [H] — keyword search over titles + content. **Essential** at scale.
- **Projects (ChatGPT) / Projects (Claude)** [H] — a **workspace grouping multiple chats** + **shared files/knowledge** + **project instructions (system prompt)** + project-scoped memory. Claude keeps continuous cross-chat context within a project; ChatGPT shows a chronological chat list + per-project custom-instruction override on top of global ones. **Perplexity = "Spaces"** (shared files, custom instructions, collaborators). Job: persistent shared context so you don't re-brief every chat. **HIGH RELEVANCE:** HyperIdle's **Team/Bet** already *is* this grouping (shared context + participants + instructions). Don't rebuild "Projects" — map the pattern onto the existing primitives. The borrow is the *idea* (a conversation inherits a container's shared context/instructions), not a new noun.
- **Share link** [H] — public read-only snapshot URL of a conversation; continued messages after sharing aren't included; revocable. Job: show someone the chat. **Skippable for v1** (internal-team product; sharing is implicit within the team).
- **Memory / custom-instructions / system prompt** [H] — three distinct layers: (1) **global custom instructions** (about-you + how-to-respond, always injected), (2) **saved memory** (auto-extracted facts/preferences across chats, user-editable, can reference past chats), (3) **project/space instructions** (scoped system prompt). Job: don't repeat yourself; personalization. **Relevant but lives in the agent/harness + knowledge-fabric layers, not the conversation render.** AM1 only needs to *reflect* that an agent acts under instructions — not own memory UI.

---

## 5. Input / attachments (enumerated; deep composer work is a sibling task)

AI-specific composer affordances:
- **File & image upload** [H] — drag/drop, picker, **paste**; chips preview attachments. ChatGPT data-analysis: ≤10 files, ≤512MB each (~50MB CSV). **Essential.**
- **Paste** [H] — paste images/text/screenshots inline. **Essential.**
- **@-tools / connectors / mentions** [H] — `@` to pull in connectors, files, or (HyperIdle) people/agents/entities. **Essential — already `MentionRef`/`EntityRef`.**
- **Model picker** [H] — choose model (GPT-5 / GPT-5 Thinking; Claude model + **Extended Thinking** toggle; Gemini Flash/Pro). Job: cost/quality/speed tradeoff. **Relevant** — in a multi-agent product this is partly *which agent*, partly that agent's effort dial. Likely a per-agent setting, not a per-message dropdown in the conversation.
- **Mode toggles** [H] — **reasoning-effort** (thinking on/off/effort), **web-search** toggle, **deep-research** mode, **agent mode**, **study mode**, **create-image** mode. ChatGPT consolidates these into a single composer **Tools** menu (six modes). Job: pick the *kind* of work. **AI-specific and worth noting** — but in HyperIdle these are *agent capabilities/tools*, configured on the agent, not chat-mode buttons. The conversation should *show the result*, not expose every dial.
- **Voice** [H] — voice input + voice mode (real-time). **Skippable for v1.**

**Note for the composer sibling task:** the AI-specific items above (model/effort/web-search/deep-research/tools-menu, attachment chips, @-connectors) are the ones a generic chat-composer survey would miss.

---

## 6. Tool / connector surface

- **Web search** [H] — real-time browsing; returns **rich previews + inline citations** (see §2). **Essential capability;** its *visible output* in the conversation is the citation chips + source list, not the search process.
- **Code interpreter / analysis** [H] — sandboxed Python: runs code, makes **matplotlib charts (PNG)**, transforms data, emits **downloadable files** (xlsx/csv/png); ChatGPT shows **"View Analysis"** to expand the actual code/steps; interactive charts/tables in an expandable view. Job: real computation + data viz. **The render lesson is gold:** the *result* (chart, file, table) is shown; the *process* (every import, transform, plot param) is **folded behind "View Analysis."** **That is exactly AM1's Fold + Session-reference split** — result inline as an Embed, process behind a Fold/dial-in. **Essential pattern.**
- **Image generation** [H] — generate/edit images in chat; render inline + download. **Skippable for v1** (not core to a work-coordination teammate).
- **Connectors (Drive/Gmail/Slack/Notion/Linear/Jira/Salesforce/HubSpot/Stripe/calendar…)** [H] — OAuth integrations the agent can read/act on; Claude exposes a default connector set. Job: bring external context/actions in. **Strategically essential** for a teammate product, but it's an **agent/harness** concern; in the conversation it surfaces as Embeds (a referenced Drive doc, a created Linear issue) — again Part/Embed, not raw tool chatter.
- **MCP** [H] — Model Context Protocol servers as the standard plug for tools/data; Claude artifacts + connectors run on it. **Architecturally essential** (HyperIdle harness already speaks this vocabulary), invisible in the conversation render.
- **"Deep research" multi-step** [H] — agent runs **dozens of searches over 5–30 min**, plans → searches → reads → finds gaps → **compiles a cited report**. Job: thorough autonomous research. Job-render: a **progress indicator while running** (a live work-log!) then a **final report artifact**. **This is the perfect HyperIdle test case:** the multi-step process is a **Session** (work-log, AM3, behind the Session-reference Embed); the **report is an Artifact Embed** in a deliberate message. Do NOT inline the research steps as conversation Parts — that would be building t3.

---

## What a multi-agent teammate product MUST take vs can skip

**MUST take (and how it maps to the Part/Embed model):**
1. **Artifact-in-a-separate-pane** with versioning + targeted highlight-edit + a compact **Embed card** in the producing message. *This is the whole ballgame.* → `ArtifactEmbed` Part + separate artifact surface; message-edit **forks** artifact lineage.
2. **Inline citation chips + foldable source list.** Provenance = trust; non-negotiable for agents that make claims. → in-Part citation element + Fold.
3. **Rich-but-calm message rendering:** markdown, highlighted code w/ copy + language label, static tables, images, **file-preview chips**, streaming. → core Part content + Embeds.
4. **The Fold / "View Analysis" discipline:** show the *result*, hide the *process*. Code-interpreter's "View Analysis" and the collapsible "Thinking" block are the industry's own admission that work-log ≠ answer. → **Fold device + Session-reference Embed**; this is AM1's central thesis, externally validated.
5. **Conversation management:** list, rename, search, pin/archive. → already largely present.
6. **Container-scoped shared context** (the *Projects/Spaces idea*). → map onto **Team/Bet**, don't add a "Projects" noun.
7. **Core message actions:** copy, regenerate (as a new message), edit-and-resend.

**Can skip / defer:** read-aloud/TTS, voice, image generation, share-this-single-message, "continue", thumbs-up/down training feedback (HyperIdle's `verdict` is richer), public share links (internal team), full conversation **branch-trees** (multi-party deliberate threads make branching semantically fraught — explicit non-goal for v1), math rendering (add when needed), composer mode-toggle buttons (model/effort/web-search/deep-research live on the **agent**, not as chat-mode chips).

**Embedded "Part" vs separate surface — the opinionated cut:**
- **Embed as a Part (inline, compact):** artifact card, referenced block, **diff** (`+N/−M` chip), **session reference**, file-preview chip, entity/mention refs, **citation chips + source list**. These are *references to a thing*, rendered legibly, opening fuller detail elsewhere.
- **Separate surface (open from an Embed):** the artifact itself (versioned, editable, runnable), the **session work-log** (tool calls, reasoning steps, edits, deep-research progress — AM3), the full diff/file view, image-edit canvas. None of these are conversation Parts.
- **Behind a Fold (one-line summary in the conversation):** "Worked for 17s", long reasoning, code-interpreter's "View Analysis", deep-research step list. The summary is conversation-grade; the expansion is session-grade.

**The biggest insight for embedding AI output into a deliberate conversation:** *Every major AI chat product has already split "the answer you keep" from "the work that produced it" — artifacts/canvas evict durable output to a side pane; "Thinking" blocks and "View Analysis" fold the process away; deep-research shows a progress feed then a final report.* They did it for clutter and trust. HyperIdle's Part/Embed/Fold/Session-reference model is **the same split made principled and load-bearing**: the deliberate message carries a *reference* (Embed) to the durable thing and a *Fold* over the process, while the artifact and the work-log live on their own surfaces. The industry validates the line AM1 is drawing — HyperIdle's job is to make it a clean, source-agnostic rendering grammar (one Part model serving both the conversation and the session dial-in) instead of four bespoke side-pane features bolted onto a transcript.

---

### Sources (cross-checked; official help centers weighted highest)
- Claude Artifacts: support.claude.com/en/articles/9487310 ; publish/share: support.claude.com/en/articles/9547008 [H]
- ChatGPT Canvas: openai.com/index/introducing-canvas ; help.openai.com/en/articles/9930697 (403 to fetch; corroborated via DataCamp/OpenAI announce) [H/M]
- Gemini Canvas: support.google.com/gemini/answer/16047321 [H]
- Perplexity citations/answer surface: docs.perplexity.ai/guides/image-guide + multiple secondary [H/M]
- ChatGPT memory/instructions: openai.com/index/memory-and-new-controls ; help.openai.com/en/articles/11146739 [H]
- ChatGPT Tools/Deep Research/Agent: openai.com/index/introducing-deep-research ; datastudios.org Tools-interface [H/M]
- Code interpreter: help.openai.com/en/articles/8437071 [H]
- Conversation mgmt (archive/share/search): help.openai.com articles 8809935 / 7925741 / 10056348 [H]
- Extended thinking: docs.claude.com/en/docs/build-with-claude/extended-thinking [H]
- *Caveat:* several discovery hits were SEO content farms (treated as [L], used only to confirm consensus). Anthropic "Live Artifacts/Cowork" details [M] from secondary coverage.
