# AQ2 — Opt-in sandbox

Concept seed, not locked. Run `/pipeline:refine AQ2` before any architecture. Two nouns to lock:
**isolation level** (a closed set) and **credential doorway**.

## What we need

Real isolation as an opt-in property of an *agent*, not of the run-unit, layered on the AQ1 host
run-unit. Connected tools must keep working while an agent runs isolated, and the upstream secret
must never enter the box.

## How it works

We do not build an isolation mechanism. Mac: the harness's own Seatbelt sandbox, with Apple
`container` (per-container microVM) where Apple Silicon and macOS 26 allow. Linux: the harness's
bubblewrap/Landlock. Remote or multi-tenant: Firecracker, build-or-buy (E2B, Fly).

Credentials go through a **doorway** — an egress credential-injection proxy, or a tool server
running *outside* the box that holds the upstream credential. The agent only ever sees a
placeholder. That is what makes isolation and inherited logins compatible at all, and it honours
AN1 hard-rule 4: the token is used in place, never extracted.

Rejected as the boundary: a command/RPC shim letting `git`/`gh` escape to the host. It inverts trust
(the sandboxed agent commands the host), forces shell-command allowlisting, and audits badly. Where
it appears to work, a proxy underneath is doing the real work.

## Confusions

- "Isolation and inherited OAuth are mutually exclusive past L1" is **wrong** and retired. It held
  only while we assumed the credential must live with the agent.
- A git credential helper forwarded over a socket **does** leak the token into the sandbox — that is
  not the ssh-agent model. Route HTTPS git auth through the header-injecting proxy or an
  outside-the-box tool server instead.
- macOS Keychain is XPC/Mach-mediated, not a file path, so a "deny `$HOME`, allow the credential
  paths" profile cannot allowlist it. File-based stores (gh, aws, npm) allowlist cleanly; the
  keychain-authenticating CLIs — claude, codex, opencode — do not. This is the hard case.
- The harnesses' own egress proxies match on hostname and do not terminate TLS, so a broad allow is
  an exfiltration path. A hard boundary needs a TLS-terminating proxy with its CA in the sandbox
  trust store — a real cost the outside-tool-server form avoids.
- A local STDIO MCP server is not a doorway: it holds the secret from env, inside the box. MCP OAuth
  authenticates agent→server and says nothing about the third-party secret.
- A plain container is not a boundary for untrusted code. That needs a separate-kernel microVM.
