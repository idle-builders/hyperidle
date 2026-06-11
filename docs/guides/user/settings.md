## Settings

Click the **Settings** button in the Sidebar to open Settings. Sections stack vertically in a scrollable page.

| Section | What You Configure |
|---------|-------------------|
| **Profile** | Your name, email, avatar |
| **Org chart** | Reporting lines between humans (direct / function / team relationships) |
| **Models** | AI model tier selection (reasoning, workhorse, fast) and API credentials |
| **Agents** | Autonomy levels per agent, pause/resume, soul prompt |
| **Assistant** | Your personal AI assistant soul prompt and settings |
| **Appearance** | Theme (light / dark / system) |
| **Credentials** | Desktop app: saved credentials and API keys |
| **Notifications** | Per-type toggles, quiet hours |
| **Worker** | Desktop + shared backend: register this device as a worker node |
| **Backend** | Shows current backend mode (Web / Local / Shared) |

### Org Chart

The **Org chart** section shows reporting lines between humans in your team. You can:

- **Add an edge** — click **+ Add Edge**, choose the relationship type:
  - **Direct** — direct reporting line (one human reports to another)
  - **Function** — role-based relationship (e.g., "Engineering") — works even if you are the only human, useful for describing your own role
  - **Team** — associated with a named team from your team roster
- **Delete an edge** — click the delete button on any row

If you are the only human in the system, a guidance hint appears above the form. You can still add **Function** edges to describe your role before adding other humans.

### Autonomy Levels

Each agent can have a different autonomy level:

- **Manual** — every action needs your approval
- **Supervised** — most actions approved, some autonomy for low-risk work
- **Autonomous** — fully autonomous unless blocked

### Backend Mode

The **Backend** section shows which backend mode HyperIdle is running in:

- **Web** — browser-only, no local bridge
- **Local (laptop)** — Electron desktop app, running sessions locally
- **Shared (remote)** — Electron desktop app connected to a shared backend server

### Worker Mode

The **Worker** section is only shown when using the desktop app in **Shared** backend mode. It lets you register this device as a worker node that runs agent sessions on behalf of the team.
