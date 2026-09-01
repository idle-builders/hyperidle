# Interception — opencode

Research against the real binary. Every claim below has a command and its real output.
Nothing here was taken from repo comments.

- **Binary:** `/opt/homebrew/bin/opencode` → `/opt/homebrew/Cellar/opencode/1.18.25/bin/opencode`, Mach-O arm64 (compiled Bun single-file binary; the JS bundle is embedded and readable with `strings`/`grep -a`).
- **Version:** `opencode --version` → `1.18.25`
- **Node:** `v24.18.0` (`/opt/homebrew/opt/node@24/bin` first on PATH)
- **Date of runs:** 2026-08-31
- **Model used for live runs:** `openrouter/anthropic/claude-haiku-4.5` (the only provider authed on this machine; `~/.local/share/opencode/auth.json` holds `openrouter` only, and `/Users/tg/hyperidle/.env` has `OPENROUTER_API_KEY` but **no** `ANTHROPIC_API_KEY`). Keys were sourced with `set -a; . ./.env; set +a` from a copy, never inlined.
- **Sandbox:** throwaway dirs under the session scratchpad. The user's `~/.config/opencode` was **read only, never written**.

---

## Short answer

opencode can be gated per session, **two independent ways**, and the better one needs no plugin at all:

1. **`OPENCODE_PERMISSION` environment variable** — a JSON permission config merged into the resolved config **per process**. Perfectly per-session (it is just an env var on the child process), never touches any file, and changes freely between runs. This is the recommended mechanism.
2. **A plugin in `<sandbox>/.opencode/plugin/` that throws inside `tool.execute.before`** — blocks the call and puts **our exact message** in front of the model. Use this when the deny reason must be free text.

`--pure` **must be dropped** if the plugin route is used, because `--pure` disables *all* external plugins including the sandbox's own. The isolation `--pure` was presumably there for is fully replaced by **`XDG_CONFIG_HOME=<per-sandbox dir>`**, which is strictly better: it hides the user's global config, global plugins *and* global MCP servers, while still loading the sandbox's plugin. If the `OPENCODE_PERMISSION` route is used alone, `--pure` can stay — but `XDG_CONFIG_HOME` is still the right isolation and makes `--pure` redundant.

---

## 1. What `--pure` actually does

`--help` says only "run without external plugins". The bundle confirms the flag is nothing but an env var:

```
$ LC_ALL=C grep -aoE '.{250}OPENCODE_PURE.{250}' opencode
... .option("pure",{describe:"run without external plugins",type:"boolean"})
    .middleware(async(D)=>{ ... if(D.pure)process.env.OPENCODE_PURE="1"; ...
... let H=X.plugin_origins??await yJ.pluginOrigins(), q=bB.OPENCODE_PURE?[]:H;
```

So `--pure` ⇒ `OPENCODE_PURE=1` ⇒ the plugin origin list is replaced with `[]`. That is its **entire** effect.

### Measured: what it disables and what it does not

```
$ opencode debug info
opencode version: 1.18.25
plugins:
- file:///Users/tg/.config/opencode/plugins/pipeline.js

$ opencode debug info --pure
opencode version: 1.18.25
plugins:
external plugins disabled (--pure)
```

With a plugin placed in the sandbox as well:

```
$ cd <sandbox> && opencode debug info
plugins:
- file:///Users/tg/.config/opencode/plugins/pipeline.js
- file:///<sandbox>/.opencode/plugins/probe-plural.js
- file:///<sandbox>/.opencode/plugin/probe-singular.js

$ cd <sandbox> && opencode debug info --pure
plugins:
external plugins disabled (--pure)
```

**`--pure` kills the sandbox's own plugin too.** Any plugin-based gate is silently inert under `--pure`.

Does `--pure` isolate config, MCP or auth? No:

```
$ cd <sandbox> && opencode debug config --pure        # user's real ~/.config/opencode
 permission: undefined
 mcp: {"hyperidle":{"type":"remote","url":"http://127.0.0.1:54184/api/mcp/…"}}
 model: openrouter/anthropic/claude-haiku-4.5
```

The user's **global MCP server is still loaded under `--pure`**. `--pure` gives *no* config isolation at all.

### The replacement: `XDG_CONFIG_HOME`

```
$ cd <sandbox> && XDG_CONFIG_HOME=<scratch>/cfg opencode debug paths
config     <scratch>/cfg/opencode          # <- was /Users/tg/.config/opencode

$ cd <sandbox> && XDG_CONFIG_HOME=<scratch>/cfg opencode debug info
plugins:
- file:///<sandbox>/.opencode/plugins/probe-plural.js
- file:///<sandbox>/.opencode/plugin/probe-singular.js
```

The user's global plugin is gone; the sandbox's plugins still load. Resolved config with an isolated `XDG_CONFIG_HOME` also shows `mcp: undefined` — the user's global MCP server is gone too, which `--pure` never achieved.

Note `OPENCODE_CONFIG_DIR` does **not** do this — tested, and `debug info` still listed the user's global plugin. `XDG_CONFIG_HOME` is the one that works.

**Verdict on `--pure`: drop it, replace with `XDG_CONFIG_HOME=<sandbox>/.xdg_config`.** Nothing is lost; config/MCP isolation is gained.

---

## 2. opencode's real plugin contract (v1.18.25)

Established from three sources that agree: the shipped `@opencode-ai/plugin` type definitions, the published docs, and a live run.

**Locations (both work — verified by `debug info` above):**
- `<project>/.opencode/plugin/*.js` and `<project>/.opencode/plugins/*.js`
- `~/.config/opencode/plugins/*.js` (global)
- npm packages named in the `plugin: []` array of `opencode.json`

The docs (https://opencode.ai/docs/plugins/, read 2026-08-31) name only `.opencode/plugins/`; the binary accepts both. The binary wins.

**Module shape — a NAMED (or default) export that is an async function returning an object of hooks:**

```js
export const Gate = async ({ client, project, directory, worktree, $ }) => {
  return { "<hook name>": async (input, output) => { /* … */ } }
}
```

From `@opencode-ai/plugin@1.18.25/dist/index.d.ts`:

```ts
export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>;
export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>;
  project: Project; directory: string; worktree: string;
  serverUrl: URL; $: BunShell; experimental_workspace: {…};
};
```

There is **no `ctx.on(...)`, no event-emitter registration, and no `PreToolUse`**. Those are Claude Code's vocabulary. opencode dispatches by **object key**.

**The hooks this version actually triggers** (`grep -aoE 'trigger\("[a-z.]+"' opencode`, exhaustive):

```
chat.headers            chat.message              chat.params
command.execute.before  file.open                 shell.env
tab.new                 tool.definition           tool.execute.after
tool.execute.before
experimental.chat.messages.transform
experimental.chat.system.transform
experimental.compaction.autocontinue
experimental.session.compacting
experimental.text.complete
```

Plus `event`, `config`, `tool`, `auth`, `provider` and `permission.ask`, which the type file declares and which are wired by other paths.

**Proof it loads and runs.** Plugin written to `<sandbox>/.opencode/plugin/gate.js`, invoked with **no `--pure`** and `XDG_CONFIG_HOME` isolation:

```
$ XDG_CONFIG_HOME=<scratch>/cfg opencode run "run this exact shell command: ls" \
    --dir <sandbox> --format json

$ cat /tmp/oc-gate.log
LOADED directory=<sandbox> worktree=<sandbox>
BEFORE tool=bash session=ses_fa6e309c1ffe4T8DbVruKWL00x args={"command":"ls"}
BEFORE tool=read session=ses_fa6e309c1ffe4T8DbVruKWL00x args={"filePath":"."}
```

Two things to note, both of which the previous HyperIdle implementation gets wrong:
- the **args are on the SECOND parameter** — `output.args` — not `input.input`. `input` carries only `{ tool, sessionID, callID }`.
- the plugin dir is auto-provisioned: on first load opencode writes `package.json`, `package-lock.json` and a full `node_modules/` (≈ the plugin SDK + effect + zod + ai-sdk) into `<sandbox>/.opencode/`. Measured cold cost in a fresh sandbox: **5 s**, and it needs network.

---

## 3. Pre-execution hook and how to BLOCK

The hook is **`tool.execute.before`**. A handler blocks by **throwing**. There is no return value protocol — no `{permission:"deny"}` object, no exit code. Confirmed by the docs (https://opencode.ai/docs/plugins/, 2026-08-31):

> Tools are blocked by throwing an error in the `tool.execute.before` hook.

Live refusal — the plugin:

```js
"tool.execute.before": async (input, output) => {
  if (input.tool === "bash" && /(^|\s)ls(\s|$)/.test(output.args?.command ?? "")) {
    throw new Error("HYPERIDLE-GATE: rule 'no-listing' blocks `ls` in this sandbox. Ask the human to approve it.");
  }
}
```

and the real stream event:

```json
{"type":"tool_use","part":{"type":"tool","tool":"bash",
 "callID":"toolu_bdrk_01Qv1HgfHFsPoyb8sAMALr93",
 "state":{"status":"error","input":{"command":"ls"},
  "error":"HYPERIDLE-GATE: rule 'no-listing' blocks `ls` in this sandbox. Ask the human to approve it."}}}
```

The call never ran. Everything else stayed allowed — the model's next `read` tool call completed normally in the same run.

---

## 4. What the model sees

**Plugin route — our text, verbatim, and the model reads it.** Same run, the model's next text part:

```json
{"type":"text","part":{"text":"The `ls` command is blocked in this sandbox environment. This is a security restriction. To see the directory contents, you can use the Read tool instead:"}}
```

So a free-form reason naming the rule reaches the model and it acts on it. **Fully influenceable.**

**Config/`OPENCODE_PERMISSION` route — fixed prose plus the matched rules as JSON.** The message template is hard-coded in the binary:

```
$ LC_ALL=C grep -aoE 'PermissionDeniedError",\{ruleset.{300}' opencode
class CZ extends rK.TaggedErrorClass()("PermissionDeniedError",{ruleset:rK.Any}){
  get message(){return `The user has specified a rule which prevents you from using this
  specific tool call. Here are some of the relevant rules ${JSON.stringify(this.ruleset)}`}}
```

Live output (see §5) confirms the ruleset JSON is echoed to the model, so the **pattern string is the only text we control** on this route. Two sibling errors exist for the interactive path and are not reachable headlessly: `PermissionRejectedError` ("The user rejected permission to use this specific tool call.") and `PermissionCorrectedError` ("…with the following feedback: ${feedback}").

---

## 5. Deny mechanism independent of plugins — yes, and it is the better one

`opencode.json` supports a `permission` block (schema `https://opencode.ai/config.json`, `$defs.PermissionConfig`): every key maps a tool name to `"ask" | "allow" | "deny"`, or to an object of glob-pattern → action. `additionalProperties` is open, so **any** tool id can be given a rule, MCP tools included. Docs: https://opencode.ai/docs/permissions/ (read 2026-08-31) — "Rules are evaluated by pattern match, with the last matching rule winning."

Crucially the binary also reads an **environment variable**, which the docs do not mention:

```
$ LC_ALL=C grep -aoE '.{100}OPENCODE_PERMISSION.{200}' opencode
if(k.OPENCODE_PERMISSION)try{ B.permission=$$(B.permission??{},JSON.parse(k.OPENCODE_PERMISSION)) }
catch(G){ yield*Q.logWarning("OPENCODE_PERMISSION contains invalid JSON, skipping",{err:G}) }
```

Merged into the resolved config, per process. Verified:

```
$ cd <sandbox> && OPENCODE_PERMISSION='{"bash":{"*":"allow","ls*":"deny"}}' \
    XDG_CONFIG_HOME=<scratch>/cfg opencode debug config
 permission: {"webfetch":"deny","bash":{"*":"allow","ls*":"deny"}}
```

(`webfetch:deny` came from the isolated global config file; the env var merged on top.)

**Live refusal, no plugin present at all:**

```
$ OPENCODE_PERMISSION='{"bash":{"*":"allow","ls*":"deny"}}' XDG_CONFIG_HOME=<scratch>/cfg \
    opencode run "run this exact shell command: ls" --dir <sandbox> --format json
```

```json
{"type":"tool_use","part":{"type":"tool","tool":"bash",
 "state":{"status":"error","input":{"command":"ls"},
  "error":"The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules [{\"permission\":\"*\",\"action\":\"allow\",\"pattern\":\"*\"},{\"permission\":\"bash\",\"pattern\":\"*\",\"action\":\"allow\"},{\"permission\":\"bash\",\"pattern\":\"ls*\",\"action\":\"deny\"}]"}}}
{"type":"text","part":{"text":"I'm unable to run the `ls` command due to permissions. The system has a rule that denies `ls` commands specifically.\n\nHowever, I can use the Read tool to list directory contents instead:"}}
```

The model understood the refusal and the rule. Everything else stayed allowed.

**Why this beats the plugin for HyperIdle's requirements:** it is an env var on the spawned process, so it is per-session by construction, needs no file in the sandbox, cannot leak between concurrent sessions, mutates nothing global, and changes freely between runs. No `node_modules` install, no network, no fail-open surface.

Its one limitation is §4: the deny text is fixed prose plus the matched rule JSON. A rule pattern is the only place to put a human-readable reason.

### Other per-session knobs found in the bundle

`OPENCODE_CONFIG` (config file path), `OPENCODE_CONFIG_CONTENT` (whole config inline), `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_DISABLE_DEFAULT_PLUGINS`, `OPENCODE_PURE`. Full list obtained with `LC_ALL=C grep -aoE 'OPENCODE_[A-Z0-9_]+' opencode | sort -u`.

### Headless `run` treats "ask" as reject

```
$ LC_ALL=C grep -aoE 'permission requested: .{200}' opencode
`permission requested: ${J.permission} (${J.patterns.join(", ")}); auto-rejecting`),
await N.permission.reply({requestID:J.id,reply:"reject"})
```

In `opencode run` without `--auto`, anything resolving to `ask` is auto-rejected (and the model gets `PermissionRejectedError`'s generic text). With `--auto` it is auto-approved. So `ask` is not a usable state headlessly — use `allow`/`deny` explicitly, and do not pass `--auto` if any rule relies on `ask` meaning "no".

---

## 6. Does a resumed session re-read the plugin and the deny set?

Yes. A resumed run is a **fresh OS process** — `opencode run --session <id>` bootstraps exactly like a new session, reading every config file and loading every plugin *before* it touches the session. Proven by running with `--session` against a session created by an earlier run, with a plugin that logs its own load:

```
$ OPENCODE_PERMISSION='{"bash":{"*":"allow","git *":"deny"}}' XDG_CONFIG_HOME=<scratch>/cfg \
    opencode run "say hi" --dir <sandbox> --session ses_fa6de3da8ffeQ3ZJJUIhqB92Ue \
    --format json --print-logs --log-level DEBUG
```

```
$ cat /tmp/resume.log
PLUGIN LOADED ON RESUME 2026-08-31T19:24:40.747Z
```

and from the resumed process's own stderr:

```
level=INFO run=5170d16b message="creating instance" directory=<sandbox>
level=INFO run=5170d16b message=loading path=<scratch>/cfg/opencode/config.json
level=INFO run=5170d16b message=loading path=<scratch>/cfg/opencode/opencode.json
level=INFO run=5170d16b message=loading path=<scratch>/cfg/opencode/opencode.jsonc
level=INFO run=5170d16b message=loading path=<sandbox>/opencode.json
level=INFO run=5170d16b message=loading path=<sandbox>/.opencode/opencode.json
level=INFO run=5170d16b message=loading path=<sandbox>/.opencode/opencode.jsonc
level=INFO run=5170d16b message=init
```

Config resolution and plugin load both complete before `init`, on the resume path. So a deny set rewritten between runs — whether as `OPENCODE_PERMISSION` on the new process, or as a rewritten plugin file — takes effect on the resumed turn. There is no caching of the previous run's permissions: nothing survives the process.

Also note the **full config search order** this reveals, which is worth knowing for precedence: global `config.json` → global `opencode.json` → global `opencode.jsonc` → `<dir>/opencode.json` → `<dir>/.opencode/opencode.json` → `<dir>/.opencode/opencode.jsonc`, and `OPENCODE_PERMISSION` is merged on top of all of them (§5).

**Caveat, stated plainly:** the resumed turn's own tool call could not be observed, because this run hit the startup stall described in §7g and was killed after 70 s. What is proven is that the resumed process re-reads config and re-loads the plugin. What is not separately proven live is a deny *changing* between two completed turns of the same session — though since nothing persists across the process boundary, there is no mechanism by which it could fail to.

---

## 7. Things that make this silently not work

### 7a. `--pure` silently disables a sandbox plugin

Covered in §1. There is no warning on the normal path: `opencode run --pure` with a plugin in the sandbox simply never calls it. Only `opencode debug info --pure` says "external plugins disabled (--pure)". **This alone invalidates any plugin gate.**

### 7b. A plugin that fails to load is logged and skipped — fail OPEN

A deliberately broken plugin (it called `fs.appendFileSync(process.env.PROBE_LOG, …)` with the variable unset) produced, at `--log-level DEBUG --print-logs`:

```
level=ERROR message="failed to load plugin"
  path=file:///<sandbox>/.opencode/plugin/probe-singular.js
  error="path must be a string or a file descriptor"
level=INFO message="all LSPs are disabled"
level=INFO message=init
```

The run **continued normally** with the plugin absent. On stdout with `--format json` — the stream HyperIdle actually reads — **nothing appears at all**. A broken gate plugin is invisible unless stderr is captured at DEBUG. This is the dangerous case, and it is exactly the case HyperIdle's adapter makes worse: the adapter config comment says opencode's stderr is silenced wholesale (`opencode-stderr-ignore`), so this ERROR line would be thrown away.

A gate on the plugin route therefore needs its own liveness proof — e.g. the plugin pings the bridge on load and the session refuses to start until that ping lands. `OPENCODE_PERMISSION` has no equivalent failure mode: an unparseable value is logged (`"OPENCODE_PERMISSION contains invalid JSON, skipping"`) and also fails open, but the value is generated by HyperIdle rather than executed, so it is verifiable before spawn.

### 7c. A hook that throws blocks the call — including by accident

There is no distinction between "the gate denied this" and "the gate crashed". Any exception out of `tool.execute.before` — a typo, a `fetch` rejection, a JSON parse error — becomes a tool-call refusal whose text is the exception message, shown to the model. That is fail-closed at the call level, which is the safe direction, but a network blip will read to the model as a policy denial. Wrap the body and decide explicitly.

### 7d. A plugin costs a `node_modules` install inside the sandbox

First load in a fresh sandbox writes `package.json`, `package-lock.json`, `.gitignore` and `node_modules/` into `<sandbox>/.opencode/` — measured **3,645 files / 61 MB / ~5 s**, and it needs network. opencode writes a `.opencode/.gitignore` covering `node_modules`, so it does not pollute git status, but it is real disk and a real network dependency per sandbox. `OPENCODE_PERMISSION` costs nothing.

### 7e. `ask` is not a usable state headlessly

See §5. In `opencode run`, `ask` is auto-rejected without `--auto` and auto-approved with it. Only `allow` and `deny` mean what they say.

### 7f. Both `.opencode/plugin/` and `.opencode/plugins/` load

The docs name only the plural. The binary loads both, and loads **every** `.js` in them. A stale file left behind by an earlier session will still run. Write exactly one file and clear the directory when re-provisioning.

### 7g. Startup can stall for minutes, unrelated to gating

Repeatedly during this research, `opencode run` produced no stdout for 150–300 s and had to be killed. At `--log-level DEBUG` the last line is always `message=init`, after config load and plugin load complete. It reproduced with **no plugin**, with **no deny config**, with a **fresh isolated `XDG_DATA_HOME`**, and with network to `models.dev` and `openrouter.ai` verified healthy (HTTP 200 in ~0.1–0.2 s at the same moment). Identical invocations succeeded in 20–30 s at other times.

One contributing factor is visible: against the user's real data dir the log shows a 60 s gap between `init` and `cleanup prune=7.days`, and that data dir holds a **2.96 GB `opencode.db`**. That matches HyperIdle's existing lore about isolating `XDG_DATA_HOME`. But it is not the whole story, because the stall also occurred against a fresh empty data dir. **Cause not fully identified.** Whatever the gate design, the harness needs a hard per-run timeout and must not treat a silent stall as a completed run.

---

## Verdict

**Yes — opencode can be gated per session, and it does not need a plugin.**

**Primary mechanism: `OPENCODE_PERMISSION` on the spawned process.**

```
OPENCODE_PERMISSION='{"bash":{"*":"allow","<denied pattern>":"deny"},"<tool>":"deny"}'
XDG_CONFIG_HOME=<sandbox>/.xdg_config
opencode run "<prompt>" --dir <sandbox> --format json
```

Against the five requirements:

| # | Requirement | Verdict |
|---|---|---|
| 1 | Per-session, never mutate global config | **Met.** An env var on the child process. Nothing is written anywhere. Concurrent sessions cannot see each other's value. `XDG_CONFIG_HOME` additionally hides the user's global config, plugins and MCP servers — which `--pure` never did. |
| 2 | Deny one action, allow the rest | **Met.** Proven live: `bash`/`ls` refused, `read` in the same run allowed. Patterns are last-match-wins globs; any tool id can carry a rule. |
| 3 | Model learns why | **Partly met.** The model gets a fixed sentence plus the matched rules as JSON, and demonstrably understood it ("The system has a rule that denies `ls` commands specifically"). The **rule pattern is the only text we control** on this route. If a free-text reason naming the HyperIdle rule is required, use the plugin route, which puts our exact sentence in the model's context — proven live. |
| 4 | Deny set changes between runs | **Met by construction** — `opencode run` is a fresh process per invocation on HyperIdle's process-reengage channel, so config, env and plugins are re-read every time. |
| 5 | Auth keeps working | **Met.** All live runs authenticated from `OPENROUTER_API_KEY` in the environment, with `XDG_CONFIG_HOME` isolated. Auth lives in the **data** dir, not the config dir, so config isolation does not disturb it; provider keys from the environment work regardless. |

**On `--pure`: drop it.** Its only effect is disabling all external plugins, including the sandbox's own. It provides no config, MCP or auth isolation, so it cannot be the reason it was added. Replace it with `XDG_CONFIG_HOME=<sandbox>/.xdg_config`, which gives strictly more isolation and keeps the plugin route available as the escape hatch for requirement 3.

**Recommendation:** use `OPENCODE_PERMISSION` as the gate. Reach for the plugin only if the deny message must be free text — and if so, keep `OPENCODE_PERMISSION` as the belt to the plugin's braces, because the plugin route fails open silently when the plugin fails to load and the adapter currently discards the only log line that would say so.

---

## Corrections to the existing HyperIdle code

`layers/agent-execution/harness-registry/src/provision-gate-hook.ts`, `addOpencodeGatePlugin()`:

- **The tool arguments are read from the wrong place.** It sends `tool_input: input?.input ?? {}`. `input` is `{ tool, sessionID, callID }` only; the arguments are `output.args` on the **second** parameter. As written, `tool_input` is always `{}` and the bridge can never see the command it is being asked to judge. Verified live: `BEFORE tool=bash … args={"command":"ls"}` came from the second parameter.
- **Deny detection is by substring.** `err.message.includes("Action blocked") || …includes("blocked by")` re-throws only if the message happens to contain those words. A bridge reason phrased any other way is swallowed as a network error and the call proceeds. Decide from `data.decision`, not from the string.
- The plugin dir it writes, `.opencode/plugins/`, is correct — both spellings load.
- The `@lore` about the plugin API shape (named async function returning a hooks object, not `ctx.on`) is **correct** and matches the shipped `@opencode-ai/plugin@1.18.25` types.

`layers/agent-execution/harness-registry/src/adapter-pool.ts`: the `opencode-stderr-ignore` decision to silence all opencode stderr discards the only signal that a gate plugin failed to load (§7b).
