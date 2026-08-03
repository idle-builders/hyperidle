# AU22 — Deliver a live update into an already-running agent session

## Work package

**Work package.** As a maintainer, I want an agent that's in the middle of a long-running session to be able to receive new information about its task while it's still working — not only before it starts or after it finishes — so that an agent never spends the rest of a long run acting on instructions core-api already knows are stale. Today, when something relevant changes mid-session (a task gets reassigned, a bet's scope changes, the human wants to redirect the agent), the update queues up and only takes effect on the *next* session — for a thread-based back-and-forth this is barely noticeable, but for a long autonomous run it can mean minutes of wasted work on outdated instructions before the agent ever finds out.

**Why this matters.** AU21 built the mechanism for pushing an update into orchestration for work that hasn't started yet, and confirmed — by reading the real harness adapter code, not assuming — that delivery into an *already-running* session is not possible today: the CLI harness adapters close the child process's stdin immediately after spawn, by design, and the worker protocol has no message for delivering input to a live session. The founder specifically asked for this capability during AU21 and it was explicitly carved out as a named follow-up rather than silently declared "good enough." The person this benefits is anyone waiting on a long agent run whose input has changed underneath it — right now they have no choice but to let the stale run finish (wasting the agent's time and possibly producing wrong output) before the correction lands.

**Type.** backend / infra (agent-execution + agent-orchestration).

**What exists today.** Nothing — this is a new capability. Concretely, the current execution model is one-shot: `RunOptions.input` (harness contracts) is set once at launch and never revisited; `runSession` runs to a single terminal `RunResult`; the worker protocol (`worker-ingress.ts`) supports `register/event/session_result/error/pause/resume`, where `pause`/`resume` are pool backpressure, not input delivery — there is no server-to-session "here's new information" message. The CLI harness adapter (`cli-harness-adapter.ts`) spawns `claude`/`codex`/`opencode` and immediately closes the child process's stdin, by its own documented design, specifically so the CLIs don't block waiting for input that will never come. AU21's Decision B‴ builds the two cases this capability doesn't need to solve: an update for work that hasn't launched yet (supersedes the pending request) and an update that naturally lands as a thread's next conversational turn — both already covered elsewhere and out of this work package's scope.

**What's genuinely missing.** A real channel for delivering new information to a session that is already running, and everything that has to exist for that channel to be trustworthy: does any of the three CLI harnesses support an interactive/streaming input mode at all today, what the worker protocol needs to gain to carry a mid-run message, and how the harness adapter contract exposes "deliver this to the live session" in a way that's uniform (or honestly, explicitly non-uniform) across `claude`/`codex`/`opencode`.

**Depends on.**
- **AU21** — this work package extends the request/update plumbing AU21 builds (Decision B‴); it cannot be meaningfully designed or verified until that mechanism exists and has shipped.

**Complexity.** L

**Engineering tier.** production — matches this track's existing forecast (AU21 set this explicitly as the maintainer's call in the absence of a repo-wide `engineering.tier` config key); this is live-system capability work, not prototype exploration.

**Pre-build gates.**
- **Refinement:** Required — the goal is clear at the top level ("deliver an update mid-session"), but what "delivered" has to mean as an observable guarantee is genuinely open (does the agent need to see it before its next tool call? Is it acceptable if only some harnesses support true interactive delivery and others fall back to a documented degraded mode?) — `/refine` should pin this down before `/architecture` designs a mechanism against a fuzzy target.
- **Design:** Not required — backend/infra, no UI surface.

**Human review gates.** Yes — mandatory for every work package. Forecast: high-friction. This touches the harness adapter contract directly (a foundational, load-bearing interface every harness implements), and per this repo's harness-parity rule, any change here has to be checked for equal, honest coverage across `claude`/`codex`/`opencode`, not silently uneven.

**Plan calls.** This needs real feasibility investigation before an architecture can be trusted — per-harness research (does `claude`/`codex`/`opencode` expose any live/streaming input mode today, e.g., an interactive REPL mode, a named pipe, a control socket — or genuinely none of them), not an assumption that all three behave the same. If the three harnesses turn out to support this unevenly, `/architecture` must design the honest, explicit shape (which harnesses get real mid-run delivery, which get a documented fallback) rather than force a false uniform contract. Reuse Track AR's real-harness testing standard (`requireHarness`, zero stubs) for whatever proves this works.

**Contracts / constraints.**
- Must not silently regress the harness-parity rule: any harness that can't support true mid-run delivery gets an explicit, documented fallback, never an untested gap presented as if it works.
- Must not touch or reopen AU21's Decision B‴ mechanism (supersede-before-claim, deliver-on-next-turn) — this work package is additive, a third case layered on top, not a replacement.
- No stub/mock of the harness process stands in for proof that delivery works — per Track AR's rule, this is exactly the kind of claim that must be proven against the real installed binary.

**Out of scope.**
- Anything AU21's Decision B‴ already covers (not-yet-started supersede, next-turn delivery for thread-based work).
- Streaming the AI's own live output/response back into core or the UI (a separate, explicitly parked question from AU21 — R8 in that architecture).
- Any UI change.

**Effort.** L (~4-6d) — genuine per-harness research, a worker-protocol extension, and a harness-adapter-contract change, potentially with non-uniform behavior across three harnesses to design honestly.

## Acceptance criteria

- A session that is already running can receive new information about its task and demonstrably act on it before that session ends — not only at the start of a subsequent session.
- For every harness where true interactive mid-run delivery is not actually possible, that limitation is explicit and tested (a real assertion the fallback behavior is what's documented), never a silent gap presented as equivalent to the harnesses that do support it.
- Delivering a mid-run update does not corrupt, restart, or otherwise disrupt the agent's in-progress work — it's incorporated as new information within the run the agent is already conducting.
- The mechanism is proven against the real installed harness binary for every harness it claims to support (no scripted/stubbed harness stands in as proof), per this repo's harness-integration testing standard.
- AU21's Decision B‴ mechanism (supersede-before-claim, deliver-on-next-turn) is unchanged — this capability is additive.

## Validation scenarios

- Given a session is actively running a long task, when core-api's underlying data for that task changes and re-emits the request, then the running agent receives the update and its subsequent actions reflect the new information, verified against the real installed harness.
- Given a harness that cannot support true mid-run input delivery, when the same scenario is attempted against that harness, then the system's documented fallback behavior occurs and is asserted by a real test — not silently treated as "delivered."
- Given a mid-run update is delivered, when the session continues, then the session does not crash, restart, or lose its prior context as a side effect of the delivery.
