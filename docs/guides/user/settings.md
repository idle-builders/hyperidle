# Settings

Click the **Settings** button pinned at the bottom of the Sidebar. All sections stack vertically in one scrollable page, in this order:

| Section | What You Configure |
|---------|-------------------|
| **Profile** | Your name and email |
| **Org chart** | Reporting lines between humans (direct / function / team relationships) |
| **Agents** | Per-agent model, harness, and system prompt; add new agents |
| **Skills & rules** | Skill and rule documents attached to agents |
| **Agent behavior** | Configuration that controls agent work: agents, subscriptions, skills, tools, and MCP |
| **Filesystems** | Team-registered file sources — code repos and document sets |
| **Agent backends** | Which AI execution environments (harnesses) are detected, authenticated, and enabled |
| **Connections** | External services your agents can use — see [Connections](connections.md) |
| **Appearance** | Theme (light / dark / system) |
| **Notifications** | One toggle per event, over your own subscriptions to it |
| **Worker** | Desktop + shared backend: register this device as a worker node |
| **Backend** | Shows current backend mode (Web / Local / Shared) |

## Profile

Name and email, saved via your user record. That's it — there is no avatar field.

## Org Chart

The **Org chart** section shows reporting lines between humans in your team.

- **Add an edge** — click **+ Add Edge**, choose the relationship type:
  - **Direct** — direct reporting line (one human reports to another)
  - **Function** — role-based relationship (free text, e.g. "Engineering") — works even if you are the only human, useful for describing your own role
  - **Team** — associates you with a named team from your team roster
- **Delete an edge** — click the delete button on any row

If you are the only human in the system, a guidance hint appears above the form; **Function** is the zero-dependency default for describing your role before other humans join.

Team membership itself is not an org edge — it is the team every user belongs to, shown on their row and set when they are created or edited. Org edges are reporting lines on top of that: add a **Team** edge yourself to record who founded or leads a team.

## Adding Agents

In **Settings → Agents**, click **+ Add Agent**. The form asks:

- **Team** — which team this agent belongs to, populated from your existing teams (defaults to the first). If no teams exist yet, run Setup first.
- **Name** — the agent's display name
- **Role** — any name you type. The picker offers the roles your agents already
  have so you can reuse one; typing a new one introduces it. A new agent starts
  with an empty identity — you write it, or a plugin brings an agent that has
  one.
- **Harness** — from the registered backend list
- **Model** — from the model catalog
- **Max concurrent sessions**

## Per-Agent Model and Harness

Each agent can run a different model. Click **Edit** on any agent:

- **Model** — one of the closed model catalog: Opus 4.8, Sonnet 4.6 (default), Haiku 4.5, or Fable 5. Overrides the default model for this agent only.
- **Harness** — which execution environment runs this agent (e.g. Built-in, Claude Code). Must match one registered on the worker device. Defaults to Built-in.

An amber warning chip appears next to an agent if its harness type is not currently registered on any available worker.

There is no per-agent autonomy dial. How much an agent's work gets reviewed is derived from its verdict history — approval rate crossed with the risk tier of the action. See the [review primitive](../../human-interface-layer/review-primitive.md).

## Agent Behavior

**Settings → Agent behavior** shows the configuration that controls when agents act and what context they use.

The section groups configuration across agents, skills, tools, and MCP. Each row shows the active value, where it came from, and whether a user override is active. Built-in and plugin defaults remain visible when you override them, so you can tell what changed without reading plugin internals.

Some edits happen directly in Agent behavior. Deep edits still link to the existing canonical sections: agent identity in **Agents**, backend setup in **Agent backends**, service/MCP credentials in **Connections**, and an agent's own subscriptions on its profile page.

## Filesystems

**Settings → Filesystems** lists the file sources your team has registered — a code repository or a document set where work lives and accrues history (GitHub, Google Drive, Obsidian, or a local folder). Each row shows the source, resource (repo or folder, with branch where relevant), the backing connection (or "Local (no connection)"), and a state chip: **Reachable**, **Needs attention**, or **Attached**.

Register a filesystem once here with **+ Add filesystem**; injecting it into a specific agent happens on that agent's config panel under **Agents**.

## Agent Backends

**Settings → Agent backends** shows all execution environments HyperIdle can use to run agents. HyperIdle detects what is installed on this device and reports each backend's status at a glance.

**The in-scope backends:**

| Backend | What it is | How to activate |
|---------|-----------|-----------------|
| **Claude Code** | Anthropic's Claude Code CLI | Run `claude auth login` in a terminal |
| **Codex** | OpenAI Codex CLI | Run `codex login` in a terminal |
| **OpenCode** | OpenCode CLI | Run `opencode providers login` in a terminal |
| **Cursor Agent** | Cursor's `cursor-agent` CLI | Sign in to Cursor; HyperIdle inherits that login |

**Reading the status rows.** Each row shows a colored dot and a short status line:

- Green — authenticated and ready to use
- Amber — installed but not signed in, or install not yet confirmed; an action zone below the row shows the exact command to run
- Grey — not installed, or not available on this machine

**Refreshing detection.** HyperIdle probes for backends when it starts. If you install a new CLI or sign in while HyperIdle is running, click **Refresh** (top-right of the section) to re-probe.

**Enabling and disabling backends.** Rows that can be toggled show a switch on the right. Turning a backend off prevents it from being selected for new agent sessions — useful for keeping a CLI installed while routing all work through a specific backend. The built-in backend cannot be disabled; it is the always-present fallback.

**Capabilities.** Click **Models** on a ready backend to expand its declared models and, once a first session has run, its confirmed capabilities (file editing, tool use, etc.). Before the first session, the section reads "Capabilities confirmed after first run."

## Connections

External services (tokens, MCP servers, inherited harness auth) live in **Settings → Connections**. Full walkthrough: [Connections](connections.md).

## Notifications

One toggle per event — task, conversation, document, or user, created or changed. Turning a toggle on subscribes you to that event; turning it off pauses your subscription. See [The Interface](the-interface.md) for how a subscribed event reaches your inbox.

## Backend Mode

The **Backend** section shows which mode HyperIdle is running in:

- **Web** — browser-only, no local bridge
- **Local (laptop)** — Electron desktop app, running sessions locally
- **Shared (remote)** — Electron desktop app connected to a shared backend server

See [Deployment](deployment.md) for what each profile means.

## Worker Mode

The **Worker** section appears only in the desktop app in **Shared** backend mode. It registers this device as a worker node that runs agent sessions on behalf of the team, with a toggle, status display, and pause/resume.
