# Settings

Click **Settings** pinned at the bottom of the sidebar. All sections stack vertically in one scrollable page.

| Section | What you configure |
|---|---|
| **Profile** | Your name |
| **Org chart** | Reporting lines between humans |
| **Agents** | Per-agent name, discipline, system prompt, harness, max sessions; add new agents |
| **Skills & rules** | Skill and rule documents attached to agents |
| **Plugins** | Install, enable, disable, and remove plugins |
| **Filesystems** | View registered file sources |
| **Agent backends** | Which harnesses are detected and ready |
| **Connections** | External services your agents can reach |
| **Appearance** | Theme (light / dark / system) |
| **Notifications** | Your own event subscriptions |
| **Backend** | Current backend mode; worker registration |

---

## Profile

Your name. No email field, no avatar.

---

## Org chart

Reporting lines between humans. Add an edge to record a direct report, a discipline, or a team relationship. If you are the only human, use **Discipline** to describe your craft.

---

## Agents

Lists all agents. Click **+ Add Agent** to create one:

- **Name** — display name
- **Discipline** — any text; the picker shows disciplines already in use
- **System prompt** — the agent's instructions
- **Harness** — which CLI runs it
- **Max concurrent sessions** — how many sessions this agent can run at once

To edit an existing agent, click **Edit** on its row. The model selector shows the options that harness exposes, plus "System default."

---

## Skills & rules

Skill and rule documents attached to agents. These are documents in the knowledge store with a `skill` or `rule` slot. Manage them here or directly in Knowledge.

---

## Plugins

**Settings → Plugins** is where agents with opinions come from.

The plugins that ship with the app are listed as available, each with an **Install** button. A team plugin installs for your team; a factory plugin installs for everyone. You can also install from a folder, a repository URL, or a zip.

Expand an installed plugin to see what it brought: agents, subscriptions, documents, and MCP servers. Edit one of its agents or subscriptions and it is marked **detached** — a reinstall leaves your version alone; **Restore** brings back the plugin's original.

---

## Filesystems

A read-only list of file sources registered to your team — code repositories and document sets. Each row shows the source, resource, connection, and state chip (Reachable / Needs attention / Attached).

New filesystems are added during setup or through an agent. To attach a filesystem to a specific agent, use the agent's editor under **Agents**.

---

## Agent backends

Shows the four harnesses HyperIdle supports:

| Harness | How to activate |
|---|---|
| **Claude Code** | `claude auth login` in a terminal |
| **Codex** | `codex login` in a terminal |
| **OpenCode** | `opencode providers login` in a terminal |
| **Cursor Agent** | `cursor-agent login` in a terminal |

Each row shows a colored dot:
- **Green** — authenticated and ready
- **Amber** — installed but not signed in; the exact command to run is shown
- **Grey** — not installed

Click **Refresh** to re-probe after signing in while HyperIdle is running.

Click **Models** on a ready harness to see the models it exposes.

There is no switch to disable a harness. If you do not want a harness used, do not sign in to it — an unauthenticated harness cannot run sessions.

---

## Connections

External services your agents can reach. Full walkthrough: [Connecting Services](connections.md).

---

## Notifications

One toggle per event — task, conversation, document, or user, created or changed. Turning a toggle on subscribes you to that event; turning it off pauses the subscription. Events you subscribe to land rows in your inbox.

Your assistant and any plugin agents have their own subscriptions on their profile pages.

---

## Backend

Shows which mode HyperIdle is running in:

- **Web** — browser only
- **Local (laptop)** — Electron desktop app with local sessions
- **Shared (remote)** — Electron desktop app connected to a shared backend

The **Worker** sub-section always appears inside Backend. In non-shared modes it explains that worker registration requires shared backend mode. In Shared mode it shows the registration controls for adding this device as a worker node that runs sessions for the team.

See [Deployment](../../deployment/index.md) for what each profile means.

---

Next: [Connecting Services](./connections.md)
