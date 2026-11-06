# Folders and services

Two things decide what an agent can do outside HyperIdle:

- **Works in** — the folders it works in, such as a code repository on your computer.
- **Can reach** — the services it can use, such as GitHub, Stripe or a database.

Folders are added on [your page](./your-page.md); each folder goes to the agents you pick. Services are on your page and on each agent's page. An agent works best with only what it needs.

How this works underneath: [Connection model](../../architecture/connections.md).

---

## Add a folder

On your page, press **Add a folder**.

1. **Where** — the folder's path, for example `~/code/project`. A git repository gets a branch per task or conversation.
2. **Who works in it** — all of your agents are ticked; untick any that should not get it.
3. Press **Save**.

The agent's page also has an **Add a folder** button, which opens the folder dialog for that agent only.

---

## Connect a service

On your page, press **Connect a service**.

1. **Service** — its name, for example `Stripe`.
2. **Sign in with**:
   - **A key** — paste an API key or personal access token. It is kept encrypted; nobody sees it again, not even you. Look for "API key" or "Personal access token" in the service's developer settings.
   - **An MCP server** — give its address (`https://…`). The server handles its own sign-in.
3. **Who gets it** — all of your agents, unless you untick one.
4. Press **Save**.

The first conversation's **Connect GitHub** opens this same dialog.

---

## Services already signed in on this computer

Services that your agent programs or command-line tools are already signed in to show up by themselves, marked **Signed in on this computer** — for example MCP servers set up in Claude Code, Codex or OpenCode. HyperIdle stores nothing for them, and they cannot be unticked here. To change them, change them in that tool:

- Claude Code MCP servers: `claude mcp add` / `claude mcp remove`
- Codex MCP servers: edit `~/.codex/config.toml`

---

Next: [Running your team](./running-your-team.md)
