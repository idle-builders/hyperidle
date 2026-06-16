# t3code reference — distilled learnings for the Conversation Experience redesign

Study date 2026-06-16. Source: t3code (pingdotgg/t3code, open source) read at `/tmp/t3code-explore`; running app at `/Applications/T3 Code (Alpha).app` with provider caches at `~/.t3/caches/`; screenshots in this folder. This is **design-session input for Track AM** — structure, information architecture, and aesthetics only. **Colors are explicitly out of scope** ("we find our own colors").

**Read this for *style*, not model.** t3code is a single-user coding tool where the agent's work-log **is** the conversation. HyperIdle is **not** that. In HyperIdle a **conversation** is a *deliberate, threaded exchange of messages* between people and agents; a **session** (an agent's actual work execution) is a separate, lower-level thing you dial into when needed. We take t3code's *calm, embedding-rich rendering style* and apply it to our deliberate conversations — and **reuse that same structure** for the lower-level session view. We do **not** turn the conversation into a work-log.

What t3code is: a desktop GUI that auto-detects whichever coding-agent CLI you have (Claude Code, Codex, Cursor, OpenCode, Grok) and drives all of them through one uniform, calm chat.

---

## 1. The one idea worth stealing: a normalization boundary

Every backend's native runtime events are pulled into the server and converted into **one canonical model** (`ProviderRuntimeIngestion` → `OrchestrationEvent`); the UI only ever renders that canonical model, so a Codex action and a Claude action render the same. Capabilities (models, options, slash-commands, skills) are declared per backend as a **capability descriptor** (`ServerProvider` snapshot), and the UI renders controls generically from the declaration.

For HyperIdle (the lower-level layer): we already have the substrate (`HarnessEvent`, `CapturedToolCall`). The work is to formalize the **capability descriptor** (AM2) and render the session dial-in controls + the uniform "what happened" view from it (AM3/AM4).

---

## 2. The rendering *style* — what we take (→ AM1 defines it; AM3 reuses it)

t3code renders its stream as **typed parts** with a consistent, calm visual treatment. The structural devices worth taking:

- **Rich embedding** — a reference (a file, a diff, a plan) reads *inline* as a compact card/chip, not as a bare link. This is the "embed things beautifully" the founder liked → apply to **deliberate messages** (AM1): a message embeds the artifact/ref/diff/session it refers to.
- **Compact icon + label + status row** — e.g. "Read setup.md", "Ran 3 commands ✓" — collapsed by default, expandable to detail.
- **Foldability** — a completed unit collapses to a one-line summary ("Worked for 15s" / "You stopped after 2m 30s") and re-expands. The single most important calm-making device.
- **Diff / changed-files** as a subtle card with per-file `+N / −M` stats; opens fuller detail in a side surface.
- **Calm single reading column** (~768px), generous-but-dense rhythm, status by a small icon vocabulary, hover-revealed metadata, safe fallback for unknown kinds (closed vocabulary + `unknown` sentinel).

**Where each lands in HyperIdle:** the *message + embedding* devices are the **conversation** (AM1) — deliberate messages within Threads. The *activity* devices (tool-call rows, diffs, the work-fold) are the **session view** (AM3), which **reuses** AM1's structure. The agent activity log does **not** go inline in the conversation. Today this content is siloed in `SessionActivityPanel` (a side pane) and ad-hoc `ActivityEntry`; AM3 reframes it to reuse the conversation structure. New rendering names must avoid "Block"/"blocked".

---

## 3. Information architecture (→ AM1 conversation; AM3 session view)

Three-pane shell: **left nav** (projects → nested threads, search, "New") | **center conversation** | **right contextual panel** (tabbed, addressable: Diff / Files / Preview / Terminal), scoped per thread, collapsing on narrow viewports. A diff/artifact referenced in the stream opens in the panel instead of cramming the column. Also: command palette (⌘K) jump/action hub; settings as sidebar-nav + content-pane.

For HyperIdle: the conversation's layout (threaded reading column + where embeds open) is part of **AM1**; the lower-level session view's layout is **AM3**. We are 2-pane today (list | detail) with a one-off companion toggle. **Fork (decided by rendered variants):** how the conversation lays out and where embeds/artifacts open (inline vs side surface) — kept within deliberate-messages-in-Threads, never a work-log.

---

## 4. Session dial-in — *lower-level*, when needed (→ AM3, controls from AM2)

t3code puts **capability-derived pills** on its composer: model ("Claude Opus 4.8"), reasoning/effort + context ("High · Normal · 200k"), mode ("Build"/"Plan"), permissions ("Full access"/"Supervised") — rendered generically from declared option descriptors (a `select` of choices, a `boolean` toggle). `@` mentions files, `/` opens slash-commands/skills.

For HyperIdle this is **session dial-in, and it is lower-level** — it belongs to the session view (AM3), entered when needed, **not** as first-class pills on the everyday conversation composer. The conversation composer (AM1) is for *deliberate messages* (with embedding affordances), not model/effort config. Our composer today is a textarea + send; agent defaults live in config (`modelTierPreference`, `reasoning`, `harnessType`). **Fork:** how dial-in is entered and where its controls + activity sit (AM3).

---

## 5. Harness detection & onboarding (→ AM2 descriptor; AM4 onboarding)

On startup t3code probes each backend and shows a **Providers** settings page: per backend — name, badge ("Early Access"/"Coming Soon"), installed/enabled toggle, version, auth status ("Authenticated as … · Claude Max Subscription"), update advisory. Same pattern for Source Control providers. The normalized per-provider descriptor (live in `~/.t3/caches/<provider>.json`) carries: `displayName, badgeLabel, enabled, installed, version, status, auth{status,email,type,label}, models[]{slug,name,capabilities.optionDescriptors[]}, slashCommands[], skills[], continuation.groupKey, versionAdvisory`.

For HyperIdle: we have `harnessType` but no capability descriptor (AM2), no detection, no guided onboarding (AM4). **Strategic fork (concept-level, AM2):** native-only vs native + external BYO (detect Claude/Codex/OpenCode the user has) vs external-adapter. Changes scope → decided in `/concept`, not `/design`.

---

## 6. What to take vs what we reject

**Take (the style):** rich inline embedding, the compact status row, foldability ("Worked for Xs"), the diff card, the calm single reading column, the capability-descriptor → generic-control pattern, detection-driven onboarding.

**Reject (the model):** **transcript-as-conversation.** t3code makes the session work-log the conversation; HyperIdle does not. Our conversation stays *deliberate, threaded messages* between people and agents (host kinds, participants, `plain | review | questionnaire | verdict`, verdict semantics, "never act in the dark"). Session activity is **not** a first-class conversation part — it lives in the lower-level **session dial-in** (AM3), which **reuses** the conversation's rendering structure so it reads uniformly. Colors, fonts, and tokens stay Hearth.
