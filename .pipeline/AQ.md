# Track AQ: The Run-Unit — Scheduling (where) × Sandbox (how isolated)

**Two orthogonal axes (founder, 2026-06-28).** Where an agent runs — the **scheduler/distribution** axis, local desktop or a joined remote desktop running the task host-local — is independent of how isolated it runs, the **sandbox** axis, which is a per-**agent** property. The word "sandbox" used to conflate them. AQ1 stripped sandbox to nothing and realigned the remote system to the scheduler axis; AQ2 adds the per-agent sandbox; AQ3 makes remote scheduling work end to end.

**Shipped foundation.** AQ1 (run on the computer — remove the sandbox) is merged (PR #371). The agent runs as a host process with the user's environment, and that is now the honest, only path.

**Constraint.** Isolation is **opt-in for genuine cases** (shared server, untrusted code), never a preemptive wall held down by default. Ground every claim in the real adapters, never in aspirational architecture.

**Superseded framing — do not re-derive it.** The original "isolation and inherited OAuth are mutually exclusive past L1" conclusion is **wrong** and has been retired. It only holds if the credential must live with the agent. The research (`plans/AQ2/research-sandboxing.md`) found the dissolving answer: a **credential doorway** — an egress injection proxy or an outside-the-sandbox tool-server — keeps the secret outside the box while the agent's authenticated effect still lands. AQ2 is designed from that research, not from the half-built machinery it replaces.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AQ2 | Add an opt-in sandbox: real isolation as a per-agent property, layered on the AQ1 host run-unit, with connected tools still working and the secret never entering the box | backend/infra | L | AQ1 (shipped) | unbuilt — carried from the legacy track file. AQ1 shipped the honest no-boundary default; the genuine-isolation case (shared server, untrusted code) still needs a real answer. Lean on the harness's own OS sandbox and Apple `container` locally, Firecracker remotely, and the credential doorway so tools keep working under isolation. **Concept SEED only** (`plans/AQ2/requirements.md`) — run `/pipeline:refine AQ2` to lock it before any build. |
| AQ3 | Make remote scheduling work end-to-end: a task dispatched to a joined desktop executes host-local there and returns results across machines | backend/infra | L | AQ1 (shipped) | unbuilt — carried from the legacy track file. AQ1 realigned the remote subsystem to the scheduler axis but deliberately left the cross-machine transport unimplemented behind the stubbed `RemoteHarnessAdapter`. Until AQ3 lands, the remote UI and routes exist but no task can actually run remotely — "where it runs" is not yet a real scheduling choice. |

## Dependency graph

- `AQ2` → `AQ1` (shipped): layers isolation on the host run-unit AQ1 established. Consumes AN1/AN2's Connection model (held vs inherited).
- `AQ3` → `AQ1` (shipped): implements the transport behind the realigned, coherent remote seam AQ1 left.
- `AQ2` and `AQ3` are orthogonal — a remotely-scheduled task is still subject to the agent's own sandbox property once AQ2 lands. Sequence by value, not by number.
