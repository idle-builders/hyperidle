# t3code reference — distilled learnings for the Conversation Experience redesign

Study date 2026-06-16. Source: t3code (pingdotgg/t3code, open source) read at `/tmp/t3code-explore`; running app at `/Applications/T3 Code (Alpha).app` with provider caches at `~/.t3/caches/`; screenshots in this folder. This is **design-session input for Track AM** — structure, information architecture, and aesthetics only. **Colors are explicitly out of scope** ("we find our own colors"); ignore every theme value below and read for structure.

What t3code is: a desktop GUI that auto-detects whichever coding-agent CLI you have (Claude Code, Codex, Cursor, OpenCode, Grok) and drives **all of them through one uniform, calm chat**. Three things to learn from it: the chat rendering grammar, the harness normalization/onboarding, the in-composer session dial-in.

---

## 1. The one idea that makes it work: a normalization boundary

Every backend's native runtime events are pulled into the server and converted into **one canonical orchestration event/part model** (`ProviderRuntimeIngestion` → `OrchestrationEvent`). The UI only ever renders that canonical model — so a Codex action and a Claude action become the *same* rendered part. Capabilities (models, options, slash-commands, skills) are declared per backend as a **capability descriptor** (`ServerProvider` snapshot), and the UI renders controls generically from the declaration.

The lesson for HyperIdle: we already have the substrate (`HarnessEvent`, `CapturedToolCall`). The redesign is to (a) give the conversation a uniform rendering **grammar** over it (AM1), (b) formalize the **capability descriptor** (AM3), and render the composer/onboarding from it (AM4/AM5).

---

## 2. Chat rendering grammar (→ AM1)

t3code's conversation is a virtualized stream of **typed parts**, each with a consistent visual treatment. The taxonomy:

- **User message** — right-aligned, soft card, max ~80% width; collapses if very long.
- **Assistant text** — left-aligned, full reading-column prose (markdown: lists, code spans, fenced blocks, tables, links). No avatars; role read from alignment + treatment.
- **Work / tool activity** — the heart of it. Each step is a compact **icon + label + preview + status** row (e.g. "Read setup.md", "Edited isomorph", "Ran 3 commands ✓"), collapsed by default, expandable to raw detail. Grouped; shows last N with a "+X previous" expander.
- **Diff / changed-files** — a subtle card with a file tree, per-file `+N / −M` stats (green/red, tabular nums), collapse/expand all, and a "View diff" affordance into a side panel.
- **Plan** — a bordered card with a "Plan" badge, collapsible body, save/copy actions.
- **Reasoning** — distinct muted tone.
- **Turn fold** — a completed turn collapses its intermediate parts behind a one-line separator: **"Worked for 15s"** (or "You stopped after 2m 30s" when interrupted). Re-expands on click. This is the single most important calm-making device.
- **Working indicator** — pulsing dots + self-ticking "Working for Xs" (updates DOM directly, no React churn).
- **Safe fallback** — unknown part kinds degrade to a generic row; never throws, never drops content (closed vocabulary with an `unknown` sentinel).

Layout grammar: one centered **reading column** (~768px max), generous but dense vertical rhythm, status conveyed by a small icon vocabulary + tone, hover-revealed metadata/timestamps, copy affordances. Streaming parts show live; failed status persists after the turn settles.

**HyperIdle deltas:** we have this content but siloed in `SessionActivityPanel` (a side pane) and as ad-hoc `ActivityEntry`. AM1 makes it an in-stream, named, foldable grammar — and must pick a canonical name that is NOT "Block" (taken) and reconcile with `ActivityEntry`.

---

## 3. Information architecture (→ AM2)

Three-pane shell: **left nav** (projects → nested sessions/threads, search, "New session") | **center conversation** | **right contextual panel**. The right panel is **tabbed and addressable** — Diff / Files / Preview / Terminal — opens beside the conversation, state scoped per thread, collapses on narrow viewports. A diff or artifact referenced in the stream opens there instead of cramming the column.

Other IA notes: command palette (⌘K) as a global jump/action hub; settings as a sidebar-nav + content-pane surface (General / Keybindings / Providers / Source Control / Connections / Archive); per-thread persistence of panel state.

**HyperIdle deltas:** we are 2-pane (list | detail) with a one-off "companion layout" toggle and `SessionActivityPanel` as a companion. AM2 generalizes the companion into a real contextual panel and resolves the pane structure. **Fork to decide by rendered variants:** 3-pane tabbed vs 2-pane inline vs single companion.

---

## 4. Capability-driven composer / session dial-in (→ AM4)

The composer is a rich input with a row of **pills derived from the active backend's capabilities**: model ("Claude Opus 4.8"), reasoning/effort + context ("High · Normal · 200k"), mode ("Build" / "Plan"), permissions ("Full access" / "Supervised"). Crucially these are **rendered from declared option descriptors** (a `select` with options, a `boolean` toggle) — the UI knows nothing about "effort" specifically; it renders whatever the model declares. `@` mentions files, `/` opens slash-commands/skills. Send/Stop/Submit adapts to turn state.

**HyperIdle deltas:** our composer is a textarea + send button; agent defaults live in config (`modelTierPreference`, `reasoning`, `harnessType`). AM4 adds capability-driven in-composer dial-in. **Fork:** per-thread composer pills vs per-message vs agent-config-only.

---

## 5. Harness detection & onboarding (→ AM3/AM5)

On startup t3code probes each known backend and shows a **Providers** settings page: per backend — name, badge ("Early Access"/"Coming Soon"), installed/enabled toggle, version, auth status (e.g. "Authenticated as … · Claude Max Subscription"), and an update advisory. Same pattern for Source Control providers (git/GitHub/GitLab/…). The normalized per-provider descriptor (captured live in `~/.t3/caches/<provider>.json`) carries: `displayName, badgeLabel, enabled, installed, version, status, auth{status,email,type,label}, models[]{slug,name,capabilities.optionDescriptors[]}, slashCommands[], skills[], continuation.groupKey, versionAdvisory`.

**HyperIdle deltas:** we have `harnessType` but no capability descriptor, no detection, no guided onboarding. **Strategic fork (concept-level, AM3):** native-only vs native + external BYO (detect Claude/Codex/OpenCode the user has) vs external-adapter. This changes scope, so it's decided in `/concept`, not `/design`.

---

## 6. What to take vs leave

**Take:** the foldable turn grammar ("Worked for Xs"), the compact icon+label+status activity row, the addressable tabbed contextual panel, the capability-descriptor → generic-control pattern, the detection-driven onboarding, the calm single reading column.

**Leave / adapt:** t3code is a single-user coding transcript; HyperIdle is a multi-participant review/decision surface ("never act in the dark", verdicts, three agent levels). Do **not** discard the review/verdict spine wholesale — the **adoption-model fork** (additive grammar vs transcript-first vs mode-split) is exactly how much of the transcript style to adopt, and is decided by rendered variants in `/design` + `/human-design-review`. Colors, fonts, and tokens stay Hearth.
