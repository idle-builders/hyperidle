# BB3 — An API key gets you a working workspace

## Work package

**Outcome.** Someone who arrives with only an API key still gets a working workspace: the key is handed
to opencode, which runs their agents. Someone who arrives with no harness at all is told what to install
instead of being dropped into a workspace that cannot think. And the default harness for new agents is
the one that person chose during setup, not a constant compiled into the product.

**Why this matters.** The built-in harness is the only reason a bare API key works today, and it is being
removed. Without a replacement, first run on a machine with no signed-in CLI produces a workspace whose
agents silently fail — the worst possible first five minutes. Equally, a workspace that quietly assumes
one particular harness for every new agent contradicts what setup just asked. The beneficiary is every
new user; the cost of not doing it is that the removal in BB5 breaks onboarding outright.

**What exists today.** `SetupFlow` already asks for the harness and already collects a key: the built-in
row is always first and always choosable, it owns provider/base-URL/key fields, and the chosen harness is
sent as `primaryHarness` on team creation — **omitted when built-in is chosen**, so the server's fallback
applies. That fallback is `DEFAULT_AGENT_HARNESS = "builtin"`
(`framework/domain-model/src/model-gateway.ts:100`), with one production consumer
(`layers/core-api/src/routes/agents.ts:256`) plus two literal `?? "builtin"` defaults
(`layers/core-api/org/src/scaffold-agents.ts:173`,
`layers/core-api/src/routes/teams-routes.ts:401`). Discovery already reports per-CLI state as
`ready` / `installed` / `unauthenticated` / `missing` with a reason and a login command, and the setup
screen already greys non-ready rows with an install hint — so the "block and tell them what to install"
surface largely exists; what does not exist is the case where **nothing** is choosable, because the
built-in row is always choosable today.

**opencode accepts any key — verified 2026-08-27** on the installed binary (1.18.16) with an isolated
HOME holding zero stored credentials:

| environment | models opencode offers |
|---|---|
| nothing | 8 (free `opencode/*` tier only) |
| `OPENROUTER_API_KEY` set | + 339 `openrouter/*` |
| `ANTHROPIC_API_KEY` set | + 15 `anthropic/*` |
| project `opencode.json` declaring an `@ai-sdk/openai-compatible` provider with `baseURL` + `apiKey` | that provider's models |

So all three provider shapes the built-in gateway supported map onto opencode, and no `opencode providers
login` is needed. The delivery seams also already exist: opencode's adapter config carries an `envMap`
that injects `{{apiKey}}`, and HyperIdle already writes `opencode.json` into the session sandbox for MCP,
which is the same file a custom provider block goes in.

**Missing delta.** Three things. The key must reach opencode **under the environment variable matching
its provider** — today `envMap` hardcodes it to `ANTHROPIC_API_KEY`
(`layers/agent-execution/harness-registry/src/adapter-pool.ts:370`) whatever the key is for, so a user's
OpenRouter key arrives under the wrong name. Setup must handle "nothing is choosable". And the workspace
default must be the chosen harness rather than a constant.

**One risk to measure before this is called done.** A first `opencode run` in a cold, isolated HOME did
not complete in over four minutes and was killed; the same command in an established HOME returned in
seconds. A first run after onboarding is exactly the cold case. Whether that is one-time provider-SDK
fetching or a hang has to be established, and if it is real latency the onboarding has to show it rather
than appear frozen.

**Depends on.** BB2 — onboarding hands opencode both a key and a model. Until the chosen model survives
the trip to the process, a key-based onboarding produces an agent running an arbitrary default.

**Complexity.** M

**Engineering tier.** production — declared for this WP (per-plan convention). This is first run; there
is no second chance at it.

**Pre-build.** **Design pass required.** Two user-facing surfaces change shape: the setup screen loses
its always-available first row and gains a genuine dead-end state, and the key entry moves from being
"the built-in gateway's own credential" to being something a named harness consumes. What the person sees
when nothing is installed — and how the key's destination is explained without naming a mechanism — is a
real design decision, not a pattern already settled elsewhere.

**Constraints.**

- The key is stored and used for the harness that consumes it. It does not resurrect a general model
  gateway.
- Blocked setup must name what to install and how to sign in, using discovery's own per-harness reason
  and login command — not a generic error.
- No harness may be treated as special or undisableable in the way built-in is today.
- A person's stored key must never be sent to a harness under a variable name for a different provider.

**Out of scope.** Deleting the built-in harness or its gateway (BB5, BB6). Bundling or auto-installing a
CLI. Whether opencode's free zero-credential tier should be offered as a no-key path — a separate product
call, not assumed here.

## Acceptance criteria

1. Someone who completes setup with only an API key ends up with a workspace whose agents run, using
   opencode.
2. The key reaches opencode under the name matching the provider it is for, for every provider shape
   setup accepts, including a custom endpoint.
3. When no harness is installed or signed in, setup does not complete; it names each harness, why it is
   unavailable, and what to run to fix it.
4. New agents default to the harness chosen during setup; no harness name is compiled in as a default.
5. Nothing in the product treats one harness as permanently available or exempt from being unavailable.
6. The delay between finishing setup and an agent's first reply is either unremarkable or shown as
   progress; a first run never looks frozen.

## Validation scenarios

- Given a machine with opencode installed and no credentials, when someone completes setup with an
  OpenRouter key, then their first agent replies.
- Given the same with an Anthropic key, then their first agent replies.
- Given the same with a custom OpenAI-compatible endpoint and key, then their first agent replies.
- Given a machine with no harness installed, when someone opens the product, then setup blocks and lists
  what to install, per harness, with the command to run.
- Given a machine where only claude is installed and signed in, when someone completes setup choosing it,
  then no API key is requested and new agents default to claude.
- Given setup has just completed on a machine that has never run the chosen harness, when the first agent
  is asked something, then progress is visible until it replies.
