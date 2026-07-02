# Design — Assistant configuration in Settings (AR4)

**Surface:** Settings → Assistant. **Class:** routine (extends an existing solved pattern).
**Extract, don't invent:** the harness + model configuration UI already exists for team agents in
`SettingsAgents` (the edit-form's `Harness` Select + `Model` Select). AR4 lifts that exact pattern into
the assistant's own section. No new component family.

> Per project rule (MEMORY: no skeleton/error states in initial designs): the rendered variant shows the
> **populated real state only**. Loading/error/empty are deferred to build (the existing
> `SettingsAssistant` already implements them and they carry over unchanged).

---

## 1. User story

> As a user who runs my own harness, I want to set **which harness and model my assistant uses** — right
> next to its persona instructions — so my assistant talks to me through the harness I already have
> connected (Codex / Claude / OpenCode / built-in), the same way I configure any team agent.

The decision the user is making: *"which engine answers when I chat with my assistant, and who is it."*
Today they can only edit the persona; the harness/model decision is hidden (hardcoded to builtin). This
surface exposes it with the same constrained, validated selects team agents already use.

---

## 2. Why extend `SettingsAssistant` (not un-exclude into `SettingsAgents`)

Two candidate placements; this is a routine call, so one variant — the right one — with the rejected
alternative recorded:

- **CHOSEN — extend `SettingsAssistant`** with a Harness + Model select row above the persona textarea.
  The assistant is a *single, user-owned* entity; it has its own settings section already. Keeping its
  config there matches the user's mental model ("my assistant"), avoids dropping a user-scoped row into a
  *team-agent management table* (which carries delete / role-change / max-sessions affordances that don't
  apply to the assistant), and reuses the section's existing load/save/dirty/notice scaffolding.
- **REJECTED — un-exclude the assistant from `SettingsAgents`** (drop the `role!=="assistant"` filter).
  This mixes a user-scoped agent into the team table, exposes inapplicable affordances (Delete, Role,
  Max Sessions), and splits the assistant's persona editor (`SettingsAssistant`) from its harness/model
  editor (`SettingsAgents`) across two sections — the dual-edit hazard the existing filter comment
  (`SettingsAgents.tsx:750`) was added to prevent. We keep the filter; we extend the dedicated section.

The **extracted pattern** (verbatim from `SettingsAgents.renderEditForm`): two `Select`s side by side —
`Harness` (options from `GET /api/harnesses`, first option `{value:"", label:"Default"}`) and `Model`
(options from `MODEL_CATALOG`, first option `{value:"", label:"System default"}`) — `size="sm"`,
`min-w-[140px]`, in a `flex gap-[9px] flex-wrap` row, with the inline 422 error rendered above Save
(`text-[12px] text-[var(--status-error)] role="alert"`).

---

## 3. States

| State | Behavior |
|---|---|
| **Populated** (the rendered variant) | Harness select + Model select on one row; persona textarea below; Save enabled only when dirty. Current harness/model preselected from the `users` row. |
| Loading | Selects + textarea disabled, placeholder copy (carried over from existing `SettingsAssistant`). |
| Saving | Selects + textarea + Save disabled; button reads "Saving…". |
| Saved | Transient "Saved" affordance (existing 2s reset), then idle. |
| Validation error (422) | On an incompatible `(harness, provider, model)` triple, the server rejects before save; inline error above Save: e.g. *"anthropic models require a harness that supports the anthropic provider."* The selects retain the user's choice so they can correct it. Mirrors `SettingsAgents` AH2 inline-422. |
| Harness unavailable | If the saved `harnessType` is not in the registry (binary/config gone), show the same amber `StatusChip status="behind" label="Harness unavailable"` used in `SettingsAgents` next to the Harness select. |

---

## 4. Behavior — interactions, transitions, keyboard, focus

- **Selects** are native `<select>` via the design-system `Select` — full native keyboard support
  (focusable, arrow-key option cycling, Enter/Esc) inherited; no custom focus management needed.
- **Dirty tracking** widens from prompt-only to the whole config: dirty = `harnessType` OR `modelId` OR
  `systemPrompt` changed from the loaded values. Save disabled when clean (unchanged behavior, wider input).
- **Save** issues one request carrying the changed fields (harness/model/persona). The triple is
  validated server-side (§5); a 422 maps to the inline error; success updates the loaded baseline and
  shows "Saved".
- **Changing harness then saving** changes which harness serves the next chat reply (AC2). No live
  preview; the change takes effect on the next turn (the turn reads the row).
- **Focus on error:** the inline error has `role="alert"` so it is announced; focus stays on the
  control the user was editing (no focus steal), matching `SettingsAgents`.
- **Mobile:** the two selects carry `max-md:text-[16px]` (AQ-005 iOS zoom mitigation — already on the
  extracted selects) and stack via `flex-wrap` at narrow widths; the row already wraps in `SettingsAgents`.

---

## 5. Save path + validation (extracted contract)

Two viable wirings; the architecture phase picks; the design only requires the **validated triple**:

- The save must run the **same `(harness, provider, model)` compatibility validation team agents use**
  (`validateHarnessModelTriple`, agents.ts — UNSUPPORTED_PROVIDER → UNKNOWN_HARNESS → UNKNOWN_MODEL →
  INCOMPATIBLE_HARNESS_MODEL, 422 with a message). Incompatible triples are rejected **before** the row
  is written.
- Wiring options (architecture decides): (a) extend `PATCH /api/users/:userId/assistant` to accept
  `harnessType`/`modelId`/`modelProvider` and run the shared validator; or (b) have the assistant section
  save harness/model through the existing `PATCH /api/agents/:id` (which already validates the triple)
  while persona stays on the assistant route. (a) keeps one assistant write surface and is the boring
  default; (b) reuses the validated route verbatim but splits the write. The design is agnostic; the
  **validated-triple-before-save** contract is the requirement.

---

## 6. Component mapping

| Slot | Existing component | Source of options |
|---|---|---|
| Harness select | `Select` (`@hyperidle/design-system`), `size="sm"` | `GET /api/harnesses` (+ `{value:"",label:"Default"}`) |
| Model select | `Select`, `size="sm"` | `MODEL_CATALOG` (`@hyperidle/shared`) (+ `{value:"",label:"System default"}`) |
| Persona | `Input` `textarea` (already in `SettingsAssistant`) | `users.systemPrompt` |
| Save | `Button` (already in `SettingsAssistant`) | — |
| Inline 422 | `<p text-[12px] text-[var(--status-error)] role="alert">` (pattern from `SettingsAgents`) | server 422 |
| Harness-unavailable chip | `StatusChip status="behind"` (pattern from `SettingsAgents`) | harness registry check |

**Zero new components.** All primitives exist; the layout (a `flex gap-[9px]` select row above the
persona textarea) is the `SettingsAgents` edit-form row minus the inapplicable Name/Role/Max-Sessions
fields.

---

## 7. Layout (the rendered variant)

```
Settings → Assistant
┌────────────────────────────────────────────────────────────┐
│  Configure your personal assistant — the agent that chats   │  ← intro copy (existing, reworded)
│  with you. It uses your connected harness like any agent.   │
│                                                              │
│  ┌── Harness ─────────┐   ┌── Model ──────────────┐         │  ← EXTRACTED select row
│  │ Codex            ▾ │   │ claude-sonnet-4-6   ▾ │         │     (flex gap-[9px] flex-wrap)
│  └────────────────────┘   └───────────────────────┘         │
│                                                              │
│  Persona instructions                                        │  ← existing textarea
│  ┌──────────────────────────────────────────────────────┐  │
│  │ You are a concise, proactive assistant…              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│                                              [ Save ]        │  ← existing Button (dirty-gated)
└────────────────────────────────────────────────────────────┘
```

Spacing on the Hearth 6px grid: section stack `gap-[18px]` (existing), select row `gap-[9px]`, select
min-width `140px` — all lifted from `SettingsAgents.renderEditForm`. No off-grid values, no new tokens.

---

## 8. Render artifact

`packages/web/src/settings/SettingsAssistant.stories.tsx` gains a **`Configured`** variant rendering the
populated state (harness + model selects preselected, persona filled) via the `globalThis.fetch` mock
pattern already used by `SettingsAgents.stories`. The story is the design artifact the
human/visual review renders at the viewer. (Build wires the real fetch + save; the story proves the
painted layout.)

## 9. Design self-critique

- *Density:* the select row adds one line above an existing textarea — no whitespace inflation; it
  reuses the densest existing settings pattern. Good.
- *AI-aesthetic tells:* none — native selects, warm tokens, no gradients/hero/3-col grid. The extracted
  pattern already passes `eslint-plugin-design`.
- *Scope:* deliberately does NOT touch the team-agent table or add filesystem/max-session controls to the
  assistant (out of scope, and inapplicable to a user-scoped single agent).
- *Risk:* the only genuinely new copy is the intro reword; everything else is extraction. Low blast radius.
