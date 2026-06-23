## Settings

Click the **Settings** button in the Sidebar to open Settings. Sections stack vertically in a scrollable page.

| Section | What You Configure |
|---------|-------------------|
| **Profile** | Your name, email, avatar |
| **Org chart** | Reporting lines between humans (direct / function / team relationships) |
| **Models** | AI model tier selection (reasoning, workhorse, fast) and API credentials |
| **Agents** | Per-agent model and harness, autonomy levels, pause/resume, system prompt |
| **Assistant** | Your personal AI assistant system prompt and settings |
| **Appearance** | Theme (light / dark / system) |
| **Credentials** | Desktop app: saved credentials and API keys |
| **Notifications** | Per-type toggles, quiet hours |
| **Worker** | Desktop + shared backend: register this device as a worker node |
| **Backend** | Shows current backend mode (Web / Local / Shared) |
| **Agent backends** | Which AI execution environments (harnesses) are detected, authenticated, and enabled |

### Org Chart

The **Org chart** section shows reporting lines between humans in your team. You can:

- **Add an edge** — click **+ Add Edge**, choose the relationship type:
  - **Direct** — direct reporting line (one human reports to another)
  - **Function** — role-based relationship (e.g., "Engineering") — works even if you are the only human, useful for describing your own role
  - **Team** — associated with a named team from your team roster
- **Delete an edge** — click the delete button on any row

If you are the only human in the system, a guidance hint appears above the form. You can still add **Function** edges to describe your role before adding other humans.

**Teams connect automatically.** When you create a team via Setup or the Teams page, a **Team** org edge is created automatically connecting you (the founder) to the new team. You do not need to add that edge manually.

### Adding Agents

In **Settings → Agents**, click **+ Add Agent** to create a new agent. The add form asks:

- **Team** — which team this agent belongs to. Populated from your existing teams. Select a team before saving; the agent lands in that team immediately.
- **Name** — the agent's display name
- Other configuration (role, harness, model tier, max sessions)

The **Team** field is required if you have existing teams. If no teams exist yet, run Setup first to create your initial team.

### Per-Agent Model and Harness

Each agent can run a different model. In **Settings → Agents**, click **Edit** on any agent and select:

- **Model** — the specific Claude model this agent uses (e.g. Sonnet 4.6, Opus 4.8, Haiku 4.5). Defaults to Sonnet 4.6. Overrides the system-level model tier for this agent only.
- **Harness** — which execution environment runs this agent (e.g. Built-in, Claude Code). Must match one registered on the worker device. Defaults to Built-in.

A warning badge appears next to an agent if its harness type is not currently registered on any available worker.

### Autonomy Levels

Each agent can have a different autonomy level:

- **Manual** — every action needs your approval
- **Supervised** — most actions approved, some autonomy for low-risk work
- **Autonomous** — fully autonomous unless blocked

### Agent Backends

**Settings → Agent backends** shows all execution environments HyperIdle can use to run agents. HyperIdle detects what is installed on this device and reports each backend's status at a glance.

**The four in-scope backends:**

| Backend | What it is | How to activate |
|---------|-----------|-----------------|
| **Built-in** | HyperIdle's own model gateway (Anthropic, OpenAI, OpenRouter API keys) | Add an API key in **Settings → Models** |
| **Claude Code** | Anthropic's Claude Code CLI | Run `claude auth login` in a terminal |
| **Codex** | OpenAI Codex CLI | Run `codex login` in a terminal |
| **OpenCode** | OpenCode CLI | Run `opencode providers login` in a terminal |

Cursor Agent appears as "unavailable" — there is no documented headless CLI surface HyperIdle can drive without the Cursor IDE running.

**Reading the status rows:**

Each row shows a colored dot and a short status line:
- Green dot — authenticated and ready to use.
- Amber dot — installed but not signed in, or install not yet confirmed. An action button appears below the row telling you exactly what to run.
- Grey dot — not installed, or not available on this machine.

**Refreshing detection.** HyperIdle probes for backends when it starts. If you install a new CLI or sign in after HyperIdle is already running, click **Refresh** (top-right of the section) to re-probe. The page updates to reflect the new status.

**Enabling and disabling backends.** Each row that can be toggled shows a switch on the right. Turning a backend off prevents it from being selected for new agent sessions — useful if you want to keep a CLI installed but route all work through a specific backend. The built-in backend cannot be disabled; it is the always-present fallback.

**Present but not signed in.** If a backend is detected but not authenticated, the row shows an amber dot and an action zone with the exact sign-in command to run in your terminal. After signing in, click **Refresh** to confirm the new status.

**Capabilities.** Click **Models** on a ready backend to expand its declared models and, once a first session has run, its confirmed capabilities (file editing, tool use, etc.). Before the first session, the capabilities section reads "Capabilities confirmed after first run."

---

### Backend Mode

The **Backend** section shows which backend mode HyperIdle is running in:

- **Web** — browser-only, no local bridge
- **Local (laptop)** — Electron desktop app, running sessions locally
- **Shared (remote)** — Electron desktop app connected to a shared backend server

### Worker Mode

The **Worker** section is only shown when using the desktop app in **Shared** backend mode. It lets you register this device as a worker node that runs agent sessions on behalf of the team.
