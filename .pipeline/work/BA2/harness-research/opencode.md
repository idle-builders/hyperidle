# BA2 phase 1 — opencode: can we intercept an action inside the session?

**Researcher:** planner, 2026-08-27. **Installed binary:** `opencode 1.18.16` (`/opt/homebrew/bin/opencode`
→ `/opt/homebrew/Cellar/opencode/1.18.16/bin/opencode`, Homebrew, arm64). Every "PROVEN" fact below was
demonstrated by running that binary headlessly in a scratch directory outside the repository, with the
locked repo test model `openrouter/z-ai/glm-4.7-flash`
(`layers/agent-execution/harness-registry/src/__tests__/harness-test-models.test.ts:41`).

---

## Verdict

**Yes — fully, with no caveat on capability. Two independent mechanisms both work in the exact headless
`run` form the repository already uses.** One of them (a project plugin) gives us a *fully custom
push-back message written by HyperIdle*, decided *per tool call at runtime by a call back to the
HyperIdle server*. That is more than BA2 needs.

The caveat is not about opencode. It is about the repository: **the production spawn passes `--pure`,
and `--pure` disables project plugins entirely** (PROVEN). The plugin route requires removing `--pure`
from the opencode invocation. Doing so also re-enables the user's *global* opencode plugins and config
inside our sandbox, which is a real decision, not a formality — see Risks.

---

## The mechanism

Two layers, and I recommend using both:

### Layer 1 — `permission` in the per-session config (config-only, survives `--pure`)

Write a `permission` block into the `opencode.json` the repo *already writes into the sandbox* and
*already points at* via `OPENCODE_CONFIG`
(`layers/agent-execution/harness-registry/src/cli-mcp-config.ts:131-163`). A `deny` rule blocks the tool
call, feeds an error string back to the model, and the agent loop continues.

```json
{ "permission": { "bash": { "*": "allow", "git push*": "deny" } } }
```

The model sees, verbatim:
`The user has specified a rule which prevents you from using this specific tool call. Here are some of
the relevant rules [ ...the rules, as JSON... ]`

That text is **fixed by opencode**. We cannot append "and here is how to ask for approval" to it. So
layer 1 alone satisfies "block it" but **not** "tell the agent how to ask". It is a good *floor* — it
works even under `--pure`, needs no plugin runtime, and cannot be defeated by a plugin failing to load.

### Layer 2 — a project plugin's `tool.execute.before` hook (the push-back carrier)

A file in `<sandbox>/.opencode/plugins/*.ts` exporting a named async function that returns a hooks
object. Throwing inside `tool.execute.before` blocks the tool and **delivers the thrown message to the
model verbatim**, and the loop continues. This is opencode's own documented ".env protection" pattern.

```ts
export const HyperIdleGate = async (ctx) => ({
  "tool.execute.before": async (input, output) => {
    // input  = { tool, sessionID, callID }
    // output = { args }   e.g. { command: "git push origin main" }
    const d = await fetch(BRIDGE_URL, { method: "POST", body: JSON.stringify({ ... }) }).then(r => r.json());
    if (d.decision === "deny") throw new Error(d.message); // ← reaches the model
  },
});
```

PROVEN end to end against a local HTTP server acting as the bridge (test t12 below): the plugin asked
the server, the server said deny with a custom sentence, the tool was blocked, the model received the
sentence, and the model then *tried to call `submit_review`* — it was not present in that scratch
sandbox, but the behaviour is exactly the push-back BA2 describes.

This layer gives us everything the plan asks for: block, custom message naming the rule and how to ask,
runtime decision by HyperIdle (so no config rewrite needed for the one-time clearing), and the loop
continues so the agent can act on the push-back in the same turn.

### Delivery is already per-invocation

`OPENCODE_CONFIG` points at a per-session file and the plugin dir is inside the per-session sandbox.
Nothing global has to change. PROVEN: a config referenced only by `OPENCODE_CONFIG`, in a directory with
no `opencode.json` at all, enforced its `deny` rule under `--pure` (t8).

---

## Evidence, fact by fact

### 1. opencode has a permission system — PROVEN

- Authoritative schema: `https://opencode.ai/config.json` (fetched 2026-08-27). Root property
  `permission`, `$defs.PermissionActionConfig = enum ["ask","allow","deny"]`,
  `$defs.PermissionConfig` with named keys `read, edit, glob, grep, list, bash, task,
  external_directory, todowrite, question, webfetch, websearch, lsp, doom_loop, skill` plus
  `additionalProperties` (so arbitrary tool names, including MCP tool names, can be keyed).
- Official docs: `https://opencode.ai/docs/permissions/` — page footer "Last updated: Aug 27, 2026".
  Notes the legacy `tools` boolean config is deprecated as of v1.1.1 and merged into `permission`.
- **Demonstrated (t1, t4):** `opencode run "<prompt>" --dir <sandbox> --format json --pure --model
  openrouter/z-ai/glm-4.7-flash` with `{"permission":{"bash":{"*":"allow","git push*":"deny"}}}`.
  Exit code 0. Event stream: `tool_use` with `state.status:"error"` and the rules-quoting error string,
  then a second step in which the model said *"I cannot run that command. The git push pattern is
  explicitly denied by the current permission rules."* Repeated twice with the same outcome.

### 2. Plugins can run before a tool call, deny it, AND return text the model reads — PROVEN, both halves

- Official docs `https://opencode.ai/docs/plugins/` (fetched 2026-08-27): plugin dirs
  `.opencode/plugins/` (project) and `~/.config/opencode/plugins/` (global); a plugin is a module
  exporting one or more named async functions receiving `{ project, client, $, directory, worktree }`
  and returning a hooks object; hooks include `tool.execute.before` / `tool.execute.after`; the
  documented ".env protection" example blocks a tool by `throw new Error("Do not read .env files")`.
- **Demonstrated (t5):** plugin at `<sandbox>/.opencode/plugin/hyperidle.ts` throwing
  `HYPERIDLE-PUSHBACK: pushing needs a human. Call submit_review with your case and the action you want
  cleared.` Result — `tool_use.state.error` is exactly that string, and the model's next text part was
  *"The push failed with a custom error: \"HYPERIDLE-PUSHBACK: ...\""*. The loop continued to a normal
  `stop`.
- **Demonstrated (t12):** same, but the decision and the message came from a local HTTP server the
  plugin called with `fetch`. Confirms HyperIdle can decide per call at runtime rather than baking a
  static rule file.
- **Demonstrated (t13):** hook argument shapes are `input = { tool, sessionID, callID }` and
  `output = { args }` (e.g. `{ command: "echo hello" }`). `sessionID` is opencode's own
  `ses_...` id, **not** HyperIdle's — correlation must be baked into the generated plugin text the way
  the bridge token already is.
- **Demonstrated (t5):** plugins load from **both** `.opencode/plugin` and `.opencode/plugins`. The
  binary contains both strings; the docs name only the plural. Prefer the plural (documented) form.
- Plugin context keys observed at load: `client, project, worktree, directory,
  experimental_workspace, serverUrl, $`.

### 3. What "ask" does in the headless `run` form — PROVEN, and it is unusable

**`ask` auto-rejects. It does not prompt, does not hang, and does not fail the process.**

- **Demonstrated (t2):** rule `{"bash":{"*":"allow","git push*":"ask"}}`, `--pure`. Exit 0 after 5.7s.
  stderr: `! permission requested: bash (git push origin main .); auto-rejecting`. The model got
  `The user rejected permission to use this specific tool call.` — **and the run ended right there**
  (one step, `reason:"tool-calls"`, no follow-up text). The agent never got to respond to the rejection.
- **Demonstrated (t3):** same, plus `{"experimental":{"continue_loop_on_deny":true}}` — the loop *did*
  continue and the model produced a closing sentence. The experimental flag is the difference.
- **Demonstrated (t14):** same rule plus `--auto` — the command **ran**. Matches the docs: "`--auto`
  automatically approve permission requests that are not explicitly denied … Explicit `deny` rules are
  still enforced."

**Consequence for BA2: never use `"ask"`.** Use `"deny"` (loop continues by default) or a plugin throw
(loop continues by default). `ask` both loses the message and, without an experimental flag, ends the
agent's turn.

### 4. What a rule can match on — PROVEN + documented

Per `https://opencode.ai/docs/permissions/` (Aug 27, 2026) and confirmed by test:

- Keys are **tool names**, plus two safety guards. `read` matches the file path; `edit` covers
  edit/write/patch and matches the path; `glob` matches the glob pattern; `grep` the regex; `bash` the
  *parsed* command; `task` the subagent type; `skill` the skill name; `webfetch` the URL; `websearch`
  the query; `external_directory` any path outside the working directory; `doom_loop` the same tool call
  repeating 3× with identical input.
- Patterns are **simple wildcards, not full globs**: `*` = zero or more of any character, `?` = exactly
  one, everything else literal. `~` / `$HOME` expand at the start of a pattern.
- **Precedence: last matching rule in the object wins.** Docs state it; **t11 demonstrates it** —
  `{"bash":{"*":"deny","git status*":"allow"}}` let `git status` run. So the catch-all goes *first* and
  our rules go after. This matters for AC5 ("an action named in a review that was not blocked stays
  unblocked") and for the one-time clearing.
- **Demonstrated (t9):** path matching works — `{"read":{"*":"allow","**/secrets/**":"deny"},
  "edit":{...same...}}` blocked both a `read` and a `write` of `secrets/a.txt`. Note the `write` tool
  was blocked by the **`edit`** key, exactly as documented.
- Per-agent override exists (`agent.<name>.permission`, merged, agent wins) — an extra lever if BA2 ever
  needs per-agent scoping. Out of scope per plan (per team).

### 5. Per-invocation vs global — PROVEN per-invocation, but it is a *merge*, not a *replacement*

- **Demonstrated (t8):** `OPENCODE_CONFIG=<path outside the sandbox>` with `--pure` and **no**
  `opencode.json` in the sandbox: the `deny` fired. So the env var alone delivers permissions. The repo
  already sets this env var (`cli-mcp-config.ts:163`).
- **Demonstrated (precedence test):** with a fake global config
  (`XDG_CONFIG_HOME=<scratch>`, containing `{"permission":{"webfetch":"deny","bash":{"git push*":"allow",
  "curl *":"deny"}}}`) plus our `OPENCODE_CONFIG` (`{"bash":{"*":"allow","git push*":"deny"}}`),
  `opencode debug config` resolved to:
  `{"webfetch":"deny","bash":{"git push*":"deny","curl *":"deny","*":"allow"},"edit":{...}}`.
  → Our file **wins on the conflicting key**, but every global key we do not set **survives into the
  session**. It is a deep merge, not an override.
- **Demonstrated (same run without `XDG_CONFIG_HOME`):** the real user global config leaked in — the
  resolved config carried `plugin: ["file:///Users/tg/.config/opencode/plugins/pipeline.js"]` and mcp
  servers `hyperidle`, `hyperidle-trace`. Production spawns forward `HOME`
  (`adapter-pool.ts:384`), so **a developer's personal opencode config is part of every sandboxed
  opencode session today.** Also confirmed the CLI honours `XDG_CONFIG_HOME`, which is the lever if we
  want to cut that leak (the repo already isolates `XDG_DATA_HOME` for the same class of reason).

---

## What the repository does today — verified, and two live defects found

Verified as described in the brief:

- `layers/agent-execution/harness-registry/src/adapter-pool.ts:346-403` — the opencode config. Args at
  `:355-368` are `["run","{{prompt}}","--dir","{{sandbox}}","--format","json","--pure","--model","{{model}}"]`.
  `envAllowlist` at `:384`. `mcpConfig: { dialect: "opencode-json" }` at `:396`.
- `layers/agent-execution/harness-registry/src/cli-mcp-config.ts:131-163` — `writeOpencodeJson` writes
  `<sandbox>/opencode.json` with only `$schema` and `mcp.hyperidle`, and returns
  `{ tokenEnv: { OPENCODE_CONFIG: <that path> } }`. **This is the injection point BA2 should use.** No
  `permission` key anywhere in it.
- `cli-harness-adapter.ts:144-158` — `reEngageCarrier: "run-arg"`; re-engage builds
  `["run", forceMsg, "--format", "json", "--pure"]` at `cli-harness-adapter.ts:825`.

**Confirmed: the repository has no opencode permission configuration at all.** A repo-wide search for
`permission` under `layers/`, `framework/`, `applications/`, `tools/` returns only
`adapter-pool.ts:441` (claude's `--permission-mode bypassPermissions`) and unrelated file-mode/test
matches. The claim in `plan.md:34` is correct.

### Defect A — `--pure` kills the plugin the repo provisions (PROVEN)

`provision-return-hook.ts:392-436` writes `<sandbox>/.opencode/plugins/return-signal.ts` for the
`process-reengage` channel. The production spawn passes `--pure` (`adapter-pool.ts:366`), and re-engage
passes it again (`cli-harness-adapter.ts:825`).

**Demonstrated (t6):** the *identical* sandbox that blocked `git push` via a plugin in t5 was re-run with
`--pure` added and nothing else changed. The plugin's load marker file stayed **empty** and the bash
command **actually executed** (`fatal: not a git repository`). `--pure` is documented in `--help` as
"run without external plugins"; the comment at `adapter-pool.ts:353` describes it as disabling
"TUI / interactive fallback", which is wrong — `run` is headless with or without it (t5, t7, t10, t12,
t13 all completed headlessly without `--pure`). A comment in
`layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts:1021`
already says "Pure mode (--pure) skips external plugin loading".

### Defect B — the provisioned plugin's shape is not opencode's plugin API (PROVEN)

The generated file is `export default { name, version, async setup(ctx) { ctx.on("session.idle", ...) } }`
(`provision-return-hook.ts:409-412`). opencode expects a **named export** that is an async function
returning a **hooks object**, with events delivered through an `event` hook.

**Demonstrated (t7):** the repo's exact shape, loaded **without** `--pure`. The module was evaluated
(top-level marker written) but `setup` was **never called** and `session.idle` never reached it. The
same run shape with the documented API (t10) received `session.idle` along with `permission.asked`,
`permission.replied`, `message.updated`, `session.created`, and others.

So opencode's return-enforcement channel is dead for two independent reasons. That is not BA2's outcome
to fix, but BA2 phase 2 touches both files and will have to decide about `--pure`, so it should be
raised with the founder rather than silently repaired or silently left.

### Adjacent live behaviour worth knowing (PROVEN, t15)

With **no** permission config at all — today's production shape — an opencode agent that reads a path
outside its sandbox is **auto-rejected and its turn ends**. stderr:
`! permission requested: external_directory (<dir>/*); auto-rejecting`, the model gets
`The user rejected permission to use this specific tool call.`, and no further step runs. This is the
documented default (`external_directory` and `doom_loop` default to `"ask"`) colliding with headless
auto-reject. BA2's config writer will be the first thing in the repo that can set these deliberately.

---

## Recommended shape for phase 2 (a suggestion, not a decision)

1. Extend `writeOpencodeJson` to also emit a `permission` block — the catch-all first, HyperIdle's team
   rules after. Empty rule list ⇒ emit no rules ⇒ nothing is interrupted (AC1 holds by construction).
2. Provision a HyperIdle gate plugin at `<sandbox>/.opencode/plugins/`, with the bridge URL and token
   baked in the way `return-signal.ts` already bakes them, using `tool.execute.before` → ask the bridge
   → `throw new Error(pushBackMessage)`. This carries the message and lets the server hold the one-time
   clearing (no config rewrite mid-session).
3. Remove `--pure` from the opencode args, or the plugin cannot load. Then decide what to do about the
   user's global config and plugins now reaching the sandbox — `XDG_CONFIG_HOME` is the isolating lever
   and the repo already uses the `XDG_DATA_HOME` equivalent.
4. Keep the config `deny` rules as the floor even with the plugin in place: they survive `--pure`, need
   no plugin runtime, and cost nothing.
5. Never use `"ask"`.

---

## Still unknown / not verified

- **Does `tool.execute.before` fire for MCP tool calls (our own bridge tools)?** Not tested — it would
  need a live MCP server. If it does, the gate plugin must skip tools whose names come from the
  `hyperidle` MCP server, because intercepting our own MCP calls is explicitly out of scope
  (`plan.md:98`). Treat as an open question for architecture, not a blocker. **UNVERIFIED.**
- **Whether a plugin can *approve* a pending permission programmatically.** The docs list
  `permission.asked` / `permission.replied` as *events*. A `permission.ask` **hook** name exists as a
  string inside the binary, but a plugin returning a `"permission.ask"` hook was **never invoked** in
  headless (t10) even though its sibling `event` hook fired for `permission.asked`. I could not confirm
  it is callable in the `run` form; it may be TUI-only. The plugin-throw route makes this unnecessary,
  so I did not pursue it. **UNVERIFIED — do not design on it.**
- **Whether removing `--pure` regresses anything else in the repo's opencode lane.** All my
  non-`--pure` runs completed headlessly and exited 0, but I ran the CLI directly, not through
  `CliHarnessAdapter` with the bridge attached. The repo's own harness lane
  (`npm run test:integration:harness`) is the place to prove it. **NOT TESTED against the repo's spawn.**
- **Exact tie-breaking when two non-`*` patterns both match.** Docs say "last matching rule wins" and
  t11 is consistent with that, but I did not test two competing specific patterns. Low risk; write the
  config with the catch-all first and rule order deterministic.
- **How opencode parses a bash command before matching.** The docs say `bash` "matches parsed commands
  like `git status --porcelain`". Chained commands (`a && b`, `$(...)`, a shell script file) may or may
  not each be matched. Not tested. Relevant only to how tight a rule can be — the plugin route sees the
  raw `output.args.command` and is unaffected. **UNVERIFIED.**
- **Version drift.** All demonstrations are against `opencode 1.18.16`. The `@lore` in
  `cli-mcp-config.ts:141` was verified against `1.17.8`. opencode moves fast; the permission and plugin
  APIs are both documented and stable-looking, but nothing here is a guarantee for a future version.

---

## Biggest risk

**`--pure` in the production spawn.** It is the single line that decides whether BA2's push-back
message is possible on this harness, it currently silently disables a plugin the repo already ships and
believes is working, and removing it opens the sandbox to the operator's personal global opencode config
and plugins.

---

## Appendix — reproduction

Scratch root (outside the repository):
`/private/tmp/claude-501/-Users-tg-hyperidle--claude-worktrees-au-service-methods-cleanup-158cd0/1744caa3-ba2c-4746-9401-922a3d0c4cd6/scratchpad/oc`

Runner `run.mjs` spawns `/opt/homebrew/bin/opencode run <prompt> --dir <sandbox> --format json --model
openrouter/z-ai/glm-4.7-flash [extra args]` with a hard timeout, a sandboxed env
(`PATH, HOME, LANG, XDG_DATA_HOME`), a per-test `XDG_DATA_HOME` with `auth.json` copied in, and stdin
closed — mirroring `adapter-pool.ts`.

| # | Setup | Result |
|---|---|---|
| t1, t4 | `permission.bash: {"*":"allow","git push*":"deny"}`, `--pure` | blocked; rules-quoting error to model; **loop continued**; exit 0 |
| t2 | same but `"ask"`, `--pure` | stderr `auto-rejecting`; `The user rejected permission…`; **turn ended**; exit 0 |
| t3 | t2 + `experimental.continue_loop_on_deny: true` | same rejection, **loop continued** |
| t5 | plugin throws custom message, **no** `--pure` | blocked; **custom message reached the model verbatim**; loop continued |
| t6 | t5 sandbox **+ `--pure`** | plugin never loaded; **command executed** |
| t7 | repo's `export default {setup}` plugin shape, no `--pure` | module evaluated, `setup` **never called** |
| t8 | permission only via `OPENCODE_CONFIG`, no sandbox `opencode.json`, `--pure` | deny fired |
| t9 | `read`/`edit` path patterns `**/secrets/**: deny`, `--pure` | both `read` and `write` blocked |
| t10 | plugin `permission.ask` hook + `event` hook, rule `ask` | `permission.ask` never fired; `event` fired for `permission.asked`/`permission.replied`/`session.idle` |
| t11 | `{"*":"deny","git status*":"allow"}`, `--pure` | command **ran** → last matching rule wins |
| t12 | plugin asks a local HTTP bridge, throws the server's message | blocked with server-authored text; model then tried `submit_review` |
| t13 | shape probe | `input={tool,sessionID,callID}`, `output={args}` |
| t14 | rule `ask` + `--auto`, `--pure` | command **ran** |
| t15 | **no** permission config, read a path outside the sandbox, `--pure` | `external_directory` auto-rejected; turn ended |
