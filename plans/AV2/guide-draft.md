# Guide draft — Configuring your team in Settings (post-AV2)

*Backwards-planned from the shipped experience. This is the DOC-CLASS: significant artifact the founder
reviews. User-facing sections first; a short dev note at the end.*

---

## For users

### Settings, at a glance

Open **Settings** from the sidebar. Each area — Profile, Org chart, Models, **Agents**, Filesystems,
Agent backends, Connections, Appearance, Credentials, Notifications, Backend — is a section in the left
nav. Picking a section shows it in the main area. The heavy configuration areas (Agents, Agent backends)
open a **split view**: a list on the left, and the thing you selected as an editable panel on the right —
the same split you already know from Conversations and from reviewing an artifact. Drag the seam to
resize; the app remembers where you put it.

### Your agents — including your Assistant — live in one list

The **Agents** section is a single list of every agent on your team. Your personal **Assistant** is one
of the rows, right alongside your builder, designer, and any others. There is no separate "Assistant"
screen anymore — you edit the Assistant the same way you edit any agent.

Click a row and its editor opens in the panel on the right. You can set:

- **Name**
- **Role** — see below.
- **Harness** — which backend runs this agent (builtin, claude-code, codex, …).
- **Model** — the dropdown shows only the models the chosen harness can run. Switch the harness and the
  model list updates to match, so you can never pick a combination that won't work.
- **System prompt** — the agent's persona. When you pick a known role, the panel fills this in with that
  role's default template; edit from there.
- **Max sessions**, and which **Filesystems** to inject.

Editing your Assistant works identically, with one behind-the-scenes difference: the Assistant's persona
is saved through your personal-assistant settings (it's yours, guarded), while its harness and model save
like any agent's. You don't have to think about it — you just edit and save.

### Defining a role

**Role** is a combobox. Start typing and you'll see the known roles — Builder, Designer, Product Manager,
QA Engineer, and so on, each with a short description. Pick one and the agent gets that role's category
and, on first edit, its default system prompt.

If none of the known roles fit, **type your own** — e.g. "Release Manager" or "Community Lead" — and
select "Use new role: …". The agent gets your custom role. A custom role has no built-in template, so the
system prompt starts empty for you to write. Known roles keep their friendly labels and starter prompts;
custom roles are additive and never break existing agents.

*(Your Assistant's role stays "Assistant" — it's one-per-person and created when you sign up, so the role
picker for that row doesn't offer to change it.)*

### Agent backends and the built-in models

The **Agent backends** section lists the harnesses detected on your machine. Selecting one opens its
detail in the panel: its status, how to authenticate it if needed, and — for the built-in backend — the
**model tiers** (Reasoning / Workhorse / Fast) and the LLM credentials, all in one place instead of
scattered across separate sections. A backend only shows a "Show / Hide" expander when it actually has
something to expand.

### Profile, Backend, and Worker

**Profile** holds your display name and email. The email hint reflects your setup: on a local (laptop)
install it doesn't claim to be used for login you don't have.

**Backend** shows how HyperIdle is running — Local (laptop), Shared (remote), or Web. When you're on a
shared backend, the **Worker** controls (register this device, max concurrent sessions, pause/resume)
appear right there under Backend. On a local or web setup there's no separate Worker section — it doesn't
apply.

---

## For developers (dev note)

### The `agent role` noun

`agent role` is an **open string** on the agent record (`users.role`), not a table or entity. The
`AGENT_ROLE_CATALOG` (`packages/shared/src/agent-roles.ts`) is *metadata for known roles* — friendly
label, category, community, team functions, template flag — not a constraint. The route schemas already
accept any `role: z.string().min(1).max(100)`, so custom roles are additive and require **no DB or API
change**. A custom role's template lookup (`GET /api/agents/templates/:role`) simply 404s → empty prompt,
which the UI treats as "no starter template." Do not add an `agent_roles` table, role CRUD, or role
persistence beyond the `users.role` string.

### Assistant unification is UI save-routing, not a data fork

The Assistant is already a normal agent row (`role:"assistant"`, id `ast-<userId>`) returned by
`GET /api/agents`. The old `role !== "assistant"` filter was UI-only. The shared editor branches **only on
save routing**:

- Persona (`systemPrompt`) for an `ast-*` agent → `PATCH /api/users/:userId/assistant` (userId = id minus
  the `ast-` prefix). Harness/model for the assistant go there too (that route accepts the triple).
- Everything else → `PATCH /api/agents/:id`.

Do **not** relax the `ASSISTANT_SOUL_EDIT_FORBIDDEN` reject in `agents.ts` — it's a real self-edit
boundary. Route around it in the client.

### Model dropdown — harness-discovered

The model select offers the models the selected harness **actually provides**, DISCOVERED from the harness
(`descriptor.models` on `GET /api/harnesses`) — NOT the hardcoded `MODEL_CATALOG`. Each harness exposes its
own set: the built-in gateway reports its live `/models` list, `opencode` reports `opencode models`,
`claude-code` reports its `claude models` catalog. A harness with no enumerable models (e.g. `codex`, which
manages its own model) shows a short "this harness manages its own model" note instead of a select — never a
fallback to a global list. Switching harness reconciles a stale `modelProvider` so a save never hits the
INCOMPATIBLE_HARNESS_MODEL error.

### Layout primitives — reuse, don't invent

Agents list + backends list use `ItemList`/`Row` (`variant="flush"`). Detail/edit uses `SplitView` +
`useUiPreference(surfaceKey)`, exactly as `Conversations.tsx` does (`surfaceKey` e.g. `settings.agents`,
`settings.backends`). No new list/detail/empty primitive.
