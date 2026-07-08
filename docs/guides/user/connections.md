# Connecting services to your agents

Your agents can use external services — GitHub, Stripe, Figma, databases, or any tool that exposes an MCP server. **Settings → Connections** is where you see and manage what's connected.

How connections work under the hood (held vs inherited, spawn-time provisioning) is covered in [Connection model](../../architecture/connection-model.md).

---

## What you see

Three groups in fixed order:

**Inherited from your environment** — services your harness or PATH-level CLIs are already logged into. These appear automatically. HyperIdle stores nothing for them; the auth lives where you set it up (Claude Code, a CLI login, your OS keychain). You cannot add or remove these here — manage them in the relevant tool.

**Connected with a token** — an API key or PAT you pasted. Stored encrypted on the server and resolved server-side. Your agents' tools use it to authenticate; it is never shown back in this UI.

**Connected via an MCP server** — a remote MCP server you pointed at. The server owns its own sign-in. HyperIdle never appears on a consent screen.

Each row shows:
- The service name and where the tools come from
- A health chip — **Working** or **Needs attention** (inherited connections suppress the chip when working; they are auto-detected and expected healthy)

---

## Add a token connection (most common)

1. Click **+ Add connection** in the top-right of the Connections section.
2. Select **Paste a token (API key / PAT)**.
3. Enter the service name (e.g. `Stripe`) and paste your token.
4. Click **Add**.

The token is encrypted immediately. A new token connection starts with a **Needs attention** chip — it hasn't been validated yet. There is currently no Validate action in the UI to clear it; the chip is informational and will stay until a validate UI is surfaced in a future release.

**Where to get your token:**

- GitHub: Settings → Developer settings → Personal access tokens → Tokens (classic)
- Stripe: Dashboard → Developers → Restricted keys
- Any service: look for "API key" or "Personal access token" in the service's developer or security settings

---

## Add an MCP server connection

1. Click **+ Add connection**.
2. Select **Point at an MCP server**.
3. Paste the server URL (`https://mcp.example.com`). The service name fills from the URL; override it if you prefer.
4. Click **Add**.

The server must be reachable over HTTPS (URLs pointing at private addresses are rejected). The server owns auth — your agents send requests to it, and the server handles sign-in with the external service. HyperIdle registers no app and never handles a callback.

---

## Inherited connections

If you use Claude Code and have `gh` logged in, GitHub appears automatically in the Inherited group. The same applies to any MCP server configured in your Claude Code, Codex, or OpenCode setup.

To change what appears here, manage the connection in the relevant tool:

- **Claude Code MCP servers**: `claude mcp add` / `claude mcp remove`
- **gh CLI**: `gh auth login` / `gh auth logout`
- **Codex MCP servers**: edit `~/.codex/config.toml`

After changing a harness's configuration, click **Refresh** in Settings → Agent backends to re-probe. The Connections list updates on next load.

---

## Remove a connection

Click **⋯** on any held connection (token or MCP) and select **Remove**. Confirm inline when prompted. The connection disappears and agents lose access immediately.

Inherited connections cannot be removed here — remove them from the harness.

---

## Security notes

- Tokens are stored AES-256-GCM encrypted at rest. HyperIdle never returns a stored token in any API response.
- Your agents use the token server-side to authenticate their tools. At session start the token is injected into the agent's session working directory (env vars per service, or an MCP bearer entry) — never into any response the browser sees.
- HyperIdle never runs an OAuth flow on your behalf and never registers as an OAuth app on any external service. OAuth-protected services (Google, Microsoft) arrive inherited from your harness.

---

Next: [Agent backends](./settings.md#agent-backends) — which execution environments are detected and ready to run your agents.
