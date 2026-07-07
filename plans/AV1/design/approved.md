# AV1 — Design brief (light, single variant) — post human-concept-review

## DESIGN-CLASS: **routine**
Extends `packages/web/src/pages/SetupFlow.tsx` with two new steps that reuse the
established Settings harness-row pattern (`SettingsHarnesses.tsx` +
`HarnessCard.tsx`) and the existing SetupFlow field/label/pill patterns. No new
component family, no new list/detail/empty primitive. Single variant, populated
real state only (no skeleton/loading/error variants — those are build concerns).

## User story
A first-run user on the `/setup` card, after entering name + API key, sees which
harnesses are installed on their machine (and which they *could* install), picks one
as primary (or keeps built-in), picks a project folder, and sees it confirmed as a
connected repo with its branch. Then "Start HyperIdle" creates a correctly-configured
team whose chosen harness is the **default for every agent**, and lands on a `/work`
view whose auto-opened Assistant is **ready to talk** — not a burst of error cards.

## Where it lives
Inline in the existing single-scroll `SetupFlow` card (max-width 520px,
`--surface-elevated`, `p-[48px]`). Two new field groups inserted into the existing
`<form>`, using the same `mb-[18px]` group rhythm as the current fields. NOT a new
multi-page wizard — one scroll, consistent with the current R2/AE2 layout.

### Step A — Harness picker + primary choice
Placed after the API-key field, before the project-folder field.

- Label row: `"Agent harness"` + secondary `"(the default engine for every agent on
  your team)"` — same label treatment as the "What are you building?" group
  (SetupFlow.tsx:339). The secondary copy reflects the re-pinned noun: the choice is a
  persisted **team default**, not a one-time stamp.
- A single bordered container with hairline-divided rows — visually the same container
  the Settings harness list uses (`SettingsHarnesses.tsx:153` — `border ...
  rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]
  overflow-hidden`, rows divided by `h-px bg-[var(--border-subtle)]`).
- Each row: harness name + a small state hint, and a selected affordance (radio-style —
  exactly one primary among the choosable rows).
- **Built-in gateway** is always present and default-selected (the key path collected
  above).

#### Installed vs non-installed rows (RE-SPEC after founder review — GREYED, not omitted)
The founder overrode the prior "omit non-installed harnesses" decision. Show
claude/codex/opencode **even when not on PATH**, rendered greyed/disabled with an
install hint — so users discover harnesses they could add.

- **Choosable rows** (`descriptor.discovery.state === "ready"`, plus built-in which is
  always choosable): full-opacity, radio-selectable, state hint "Ready". Exactly one
  may be the selected primary.
- **Greyed rows** (`state === "missing"` or `"unavailable"`): rendered at reduced
  opacity, `aria-disabled`, NOT radio-selectable (a click does not set primary). State
  hint + an **install affordance** derived from `descriptor.authAction`
  (`harness-capability-descriptor.ts:16-24`): e.g. a quiet "Install to use" hint with
  the harness name (e.g. "Claude Code — install to use", "Codex — install to use").
  No red/error treatment — greyed is discovery/opportunity, not failure.
- **Installed-but-unauthenticated rows** (`state === "installed"` /
  `"unauthenticated"`, non-builtin): rendered as a distinct "installed — sign in to
  use" affordance; not choosable-as-primary in AV1 (surfaced so the user knows it
  exists). AV2's Settings list owns the full auth-and-enable flow.
- The greyed rows must be visually clearly non-primary (dimmed name, no radio dot,
  cursor not pointer) so the "you cannot pick this yet" contract is unambiguous — the
  reviewer's earlier "greying invites a click that does nothing" concern is answered by
  an explicit install affordance that IS the actionable thing on a greyed row (it
  tells the user how to make it choosable), not a dead radio.
- Selection state: `radiogroup` over the **choosable** rows; greyed rows are
  presentational + carry their install affordance. Arrow-key navigation moves between
  choosable rows only.
- Graceful degrade: if `GET /api/harnesses` fails or returns nothing, the container
  collapses to just the built-in row (selectable) — the step never blocks "Start
  HyperIdle".

#### First-run DEFAULT render state (the most common real state — MUST be specified)
On a brand-new machine `probeBuiltinGateway` returns `state:"unauthenticated"` until a
gateway key is stored (`harness-discovery.ts:329-381`), and every CLI harness returns
`state:"missing"`. So for a first-time user with no external harness installed and no
key yet entered, **the picker renders: the built-in gateway row (choosable,
default-selected) PLUS greyed rows for the known external harnesses (claude-code,
codex, opencode) each with an "install to use" affordance.** This is the populated
default state the builder hits on line one:

- The **built-in row is always present, always selectable, default-selected**,
  regardless of auth state. Its hint reads **"Built-in gateway"** with a quiet
  secondary **"add your API key below"** when the key field is empty — NOT a red
  "missing key" affordance (that notice-card treatment is exactly the post-setup burst
  AV1 fixes). Calm: the key is collected in the same form.
- The **greyed external rows are always shown** so a fresh-machine user discovers that
  Claude Code / Codex / OpenCode are options — the founder's explicit intent. They are
  not choosable until installed; each shows "install to use".
- The built-in row does not live-flip to "Ready" as the user types the key (key isn't
  persisted until submit; re-probing mid-form is out of scope). Copy reads correctly in
  the unauthenticated state.

### Step B — Project folder → filesystem confirm
Reuses the existing project-folder input (SetupFlow.tsx:281-334) unchanged, then adds
a small confirmation line **below** it once a folder is picked:

- After `selectFolder()` returns a path, the flow probes it (see architecture) and
  renders a single dense confirmation row: the folder basename in mono
  (`font-[family-name:var(--font-mono)] text-[13px]`), and — when it's a git repo with
  a resolvable branch — a mono `@branch` chip (`text-[11px]
  text-[var(--text-tertiary)]`), mirroring the Settings filesystem row
  (`SettingsFilesystems.tsx:156-163`).
- Non-git folder (or a git repo with no commits / no resolvable branch): same row, no
  branch chip, a quieter `"folder"` tag — registers as a `doc_set`. Never an error
  state; just a different confirmation.
- Confirmation only — `POST /api/filesystems` fires on submit (`writeback:"none"`).

## Post-setup: Assistant opens READY (design intent — no burst)
After "Start HyperIdle", the flow navigates to `/work?onboarding=true` and the
Assistant overlay **auto-opens (kept)**. The design intent the founder mandated: the
auto-opened Assistant shows a **ready, talkable** assistant — the pinned welcome
message and an enabled composer — NOT a stack of `missing_key`/`missing_harness`
notice cards. This readiness is delivered by architecture (the Assistant gets the
persisted primary harness + the entered key is live before open); there is no new UI
surface here, but the design bar is: the first thing the user sees in `/work` is a
working assistant, not error chrome.

## Component mapping
| Element | Reused component / pattern | Anchor |
|---|---|---|
| Card shell, headings, field groups | existing SetupFlow markup | SetupFlow.tsx:221-426 |
| Harness rows container | Settings harness list container | SettingsHarnesses.tsx:153-164 |
| Harness row presentation (name + state + greyed) | `HarnessCard` vocabulary | settings/HarnessCard.tsx |
| Install affordance on greyed rows | `descriptor.authAction` label/copy | harness-capability-descriptor.ts:16-24 |
| Folder input + browse button | existing project-folder field | SetupFlow.tsx:281-334 |
| Folder confirm row (path + @branch) | Settings filesystem row | SettingsFilesystems.tsx:150-165 |
| Submit button | design-system `Button` variant="primary" | SetupFlow.tsx:421 |
| Assistant overlay (auto-open, ready) | existing AssistantOverlay | shell/AssistantOverlay.tsx |

## States (populated real states — per design rule)
- **Harness step, fresh machine (DEFAULT):** built-in gateway row (choosable,
  default-selected, "add your API key below") + greyed external rows (claude-code /
  codex / opencode, each "install to use"). This IS the populated default.
- Harness step, machine with a CLI harness installed: that harness renders choosable
  ("Ready"); the rest stay greyed; built-in still default-selected.
- Folder step, git repo picked: path + `@main` chip confirmation.
- Folder step, non-git or no-commit repo: path + quiet `folder` tag, no chip.
(Loading/fetch-in-flight for the discovery fetch is a build concern —
graceful-degrade-to-builtin is in architecture, not a rendered variant.)

## Tokens / aesthetic
All spacing on the 6px grid; warm tokens only; reuse `--r-default`, `--shadow-default`,
`--border-subtle`. Greyed rows use reduced opacity / `--text-tertiary`, NOT a cool-gray
or error token. No new tokens, no AI-aesthetic tells. The step must read as the same
product as the Settings harness list — that is the fidelity bar.
