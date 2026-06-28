# AQ2 — Research: sandboxing technologies + the credential doorway

Cited web research, 2026-06-27. Critically questioned; primary sources preferred. This is the input AQ2's concept/architecture is designed from — it supersedes the "isolation and inherited OAuth are mutually exclusive" conclusion of the original AQ1 draft.

---

## 1. The harnesses already sandbox themselves (don't rebuild it)

Claude Code and OpenAI Codex both build an **OS-native** sandbox on the laptop — no Docker:

- **macOS:** Seatbelt (`sandbox-exec` / SBPL profiles). Deprecated-but-functional; no published removal date (status on macOS 26 Tahoe specifically is **unconfirmed** — monitor). Profiles are last-match-wins, so you can `deny file-read* $HOME` then `allow file-read*` specific credential paths. Network egress allowlisting can't be done in Seatbelt (no DNS); both products block all network except a localhost port and run a **userspace egress proxy** there.
- **Linux:** bubblewrap (namespaces) + seccomp-bpf (blocks AF_UNIX escape) + Landlock (fallback). Default `--ro-bind / /` → whole disk readable; writes confined to cwd; network removed and forced through a UDS→proxy.
- **Default read surface = whole host.** Claude Code docs state plainly the default "still allows reading credential files such as `~/.aws/credentials` and `~/.ssh/`." **This is why inherited logins just work** — not a special carve-out, just "not denied." Both expose a `denyRead`/`allowRead` + credentials block (Claude Code ≥ v2.1.187) and Codex has `sandbox_mode` ∈ `read-only | workspace-write | danger-full-access`.

**Implication for AQ2:** isolation-from-files **while keeping logins** is real on a single machine — flip the default (deny `$HOME`, allow specific cred paths). And we likely **inherit the harness's own sandbox** rather than building one. Caveat: the egress proxies are hostname-based, don't terminate TLS → broad allows enable exfiltration; a TLS-terminating proxy is needed for a hard boundary. macOS **Keychain** is XPC/Mach-mediated (not a path) — file-based cred stores (gh/aws/npm) allowlist cleanly; Keychain does not.

Sources: anthropic.com/engineering/claude-code-sandboxing (2025-10-20); code.claude.com/docs/en/sandboxing; github.com/anthropic-experimental/sandbox-runtime; developers.openai.com/codex/concepts/sandboxing; github.com/openai/codex codex-rs/linux-sandbox/README.md.

## 2. Real-isolation technologies

| Tech | Boot | Boundary | Used by | Fit |
|---|---|---|---|---|
| **Apple `container` / Containerization** (Apache-2.0; CLI v1.0.0 2026-06-09, library v0.1.x) | "sub-second" (unbenchmarked) | **own lightweight VM per container** (Virtualization.framework) | Apple, mid-2026 ecosystem | **Mac desktop** — native, no Docker Desktop. **Apple Silicon + macOS 26 only**; library early/unstable |
| **Firecracker** (AWS, Rust) | ~125 ms | own kernel per microVM | AWS Lambda/Fargate, E2B, Fly, Cloudflare Containers, Vercel | **Remote/multi-tenant** baseline for untrusted code |
| **Cloud Hypervisor / Kata** | ~100–300 ms | microVM (richer/heavier) | Northflank, IBM, EKS | Remote w/ GPU passthrough / Windows / live-migration |
| **gVisor** (Go) | ~50 ms | user-space kernel (shallower) | Modal, Google Cloud Run | Remote where nested-virt unavailable / density > boundary |
| **Plain OCI containers** (Podman/runc) | fast | namespaces+seccomp (shared kernel) | everywhere | **Linux desktop** baseline; *not* a boundary for untrusted code |

Consensus (Fly.io, Northflank, emirb 2026): "your container is not a sandbox" — untrusted/agent-generated code needs a **separate-kernel microVM**. Cloudflare has two products: *Containers* (Firecracker) vs *Workers* (V8 isolates — weakest, JS only); don't conflate.

Sources: github.com/apple/container + /containerization (technical-overview.md); firecracker-microvm.github.io; fly.io/blog/sandboxing-and-workload-isolation; northflank.com/blog/kata-containers-vs-firecracker-vs-gvisor.

## 3. The credential doorway (dissolves the tradeoff)

"Keep the secret outside the sandbox; mediate the agent's authenticated *effect*" — a multi-vendor-convergent pattern (Anthropic, Docker, Databricks, Vercel, Cloudflare, LangChain, Infisical). Three variants, cleanest first:

1. **Egress credential-injection proxy / outside tool-server (CLEAN).** Sandbox has no direct net; a host-side proxy swaps a sentinel for the real token past the agent's view (Anthropic recommends Envoy `credential_injector`/mitmproxy/LiteLLM; Docker AI Sandboxes; Databricks Omnibox; Infisical agent-vault). Or run the authenticated tool as a server **outside** the sandbox (Anthropic's "git MCP server forwards to a host git proxy that adds auth — agent never sees the credentials"). Declarative, OS-enforced, audit-friendly, scheme-agnostic. For arbitrary HTTPS the proxy must TLS-terminate (CA cert in sandbox trust store) — a named cost; the outside-tool-server form avoids it.
2. **SSH-agent / signing forwarding (CLEAN, for keys).** Key stays on host; sandbox sends "sign this" over a socket, gets a signature. Decades-proven (Docker Sandboxes implement it). Risk: socket-holder can sign for the agent's lifetime — mitigate with `ssh-add -c`, restrictions.
3. **Command/RPC shim — "let `gh`/`git` escape to the host" (FRAGILE).** Exists in narrow forms (askpass shims, policy-gated `git push`) but only because the real protection is the proxy underneath. Standalone it inverts trust (sandboxed agent commands the host), forces shell-command allowlisting (the hard kind), poor audit. **Not the clean boundary.**

Two correctness caveats: (a) **git credential helpers forwarded over a socket DO leak the token into the sandbox** (verified vs git-credential-forwarder README) — not the SSH model; route HTTPS git auth through the header-injecting proxy or an outside tool-server. (b) **MCP OAuth** (spec `2025-11-25`, OAuth 2.1 + RFC 9728/8707 + PKCE, forbids token passthrough) authenticates *agent → MCP server*; keeping the *third-party* secret out of the sandbox comes from **placing the MCP server outside the sandbox**, not from the OAuth spec. STDIO MCP servers are expected to hold the secret from env (so a *local* MCP server isn't a doorway by itself).

Sources: code.claude.com/docs/en/agent-sdk/secure-deployment; docs.docker.com/ai/sandboxes/security/credentials; databricks.com/blog Omnigent + omnigent.ai/docs/omnibox; infisical.com/blog/credential-brokering-for-ai-agents; modelcontextprotocol.io/specification/2025-11-25/basic/authorization; openssh.com/agent-restrict.html.

---

## Recommendation per deployment (for AQ2 design)

- **Mac desktop:** prefer the **harness's own Seatbelt sandbox** (zero-install, keeps logins via allowlist); offer **Apple `container`** (per-container microVM) where Apple-Silicon + macOS 26, Lima/Colima fallback for old/Intel. Avoid Docker Desktop as the default.
- **Linux desktop:** harness's bubblewrap/Landlock sandbox; rootless Podman / gVisor for a stronger boundary.
- **Remote / multi-tenant:** **Firecracker** — build-or-buy (E2B / Fly). Never plain containers for untrusted code.
- **Credentials at every level:** the **egress credential-injection proxy + outside tool-server** doorway so the token never enters the box. This is what lets a tool work whether the agent is wide-open (AQ1), OS-sandboxed, or in a remote microVM — and it never extracts the keychain token (honors AN1 hard-rule 4). It **dissolves** the original AQ1 "isolation vs inherited OAuth" tradeoff: the tradeoff only existed because we assumed the credential must live *with* the agent.
