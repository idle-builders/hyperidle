# AM2 CLI Harness Surface Research Dossier

Date: 2026-06-20
Source: official/local documentation and installed binaries on this computer.
Binaries verified:
- `/opt/homebrew/bin/codex` — codex-cli 0.141.0
- `/opt/homebrew/bin/claude` — Claude Code 2.1.170
- `/opt/homebrew/bin/opencode` — OpenCode 1.17.8
- `cursor` / `cursor-agent` — not found on PATH

## Codex CLI (OpenAI)

- **Binary:** `codex`
- **Version command:** `codex --version` → `codex-cli 0.141.0`
- **Installation methods:** npm (`@openai/codex`), Homebrew (`brew install --cask codex`), curl install script, GitHub release tarball.
- **Auth:**
  - `codex login` (defaults to ChatGPT sign-in / OAuth)
  - `codex login --with-api-key` for API-key mode
  - `codex login status` reports ChatGPT or API-key state
  - `codex logout` removes credentials
- **Readiness probe used by AM2:** `codex --version` (binary presence) + `codex login status` (auth present). Note: `codex login status` writes "Logged in using ChatGPT" to **stderr**, so the probe observes both stdout and stderr.
- **Auth status observed:** `stderr: Logged in using ChatGPT`.
- **Non-interactive launch:** `codex exec [PROMPT]` exists, with `--json` for JSONL events. Captured fixture: `{"type":"turn.completed","usage":{"input_tokens":14845,"cached_input_tokens":9088,"output_tokens":5}}`.
- **Model/options surface:** `-m, --model <MODEL>`; `--sandbox <read-only|workspace-write|danger-full-access>`; `-a, --ask-for-approval <untrusted|on-failure|on-request|never>`; `--search`; `--cd <DIR>`; `--add-dir <DIR>`; `--dangerously-bypass-approvals-and-sandbox`; `--dangerously-bypass-hook-trust`.
- **Output/event format:** `--json` emits JSONL lines with observed types: `thread.started`, `turn.started`, `item.completed` (agent_message, error), `turn.completed`, `turn.failed`, `error`. Tool calls, diffs and approvals are also emitted as item/approval types in this schema.
- **Limitations:** Some models are unsupported with ChatGPT-login mode; observed `o3-mini` and `o3` rejected with 400, while default model succeeded. Auth is stored in `~/.codex/auth.json`; HyperIdle must not read this file.
- **AM2 claim:** `codex` is installed, authenticated via ChatGPT, supports non-interactive `exec --json`, model selection, sandbox selection, and approval policy. HyperIdle will surface it as a provider-subscription-cli harness with `native_cli_login` action pointing to `codex login`.

## Claude Code CLI (Anthropic)

- **Binary:** `claude`
- **Version command:** `claude --version` / `claude -v` → `2.1.170 (Claude Code)`
- **Installation:** distributed as `claude` binary (not in concept doc); common install is via Anthropic installer/CLI package manager.
- **Auth:**
  - `claude auth login` — browser-based sign-in to Anthropic account
  - `claude auth logout`
  - `claude auth status` — prints JSON `{ loggedIn, authMethod, apiProvider, email, orgId, orgName, subscriptionType }`
- **Readiness probe used by AM2:** `claude --version` + `claude auth status`.
- **Auth status observed:** `{ "loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", ... }` with subscription type `max`.
- **Non-interactive launch:** `claude -p/--print [prompt]` with `--output-format stream-json` for streaming machine-readable events.
- **Model/options surface:** `--model <model>`, `--effort <low|medium|high|xhigh|max>`, `--permission-mode <mode>`, `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`, `--tools <tools...>`, `--max-budget-usd <amount>`, `--no-session-persistence`, `--system-prompt`, `--add-dir`, `--worktree`, `--mcp-config`, `--safe-mode`.
- **Output/event format:** With `--output-format stream-json --verbose`, emits NDJSON events of types: `system/init`, `assistant`, `rate_limit_event`, `result`. Tool usage appears as `tool_use` blocks inside `assistant` messages; final cost/usage is in the `result` event. Capture in integration-test fixtures.
- **Limitations:** `--output-format=stream-json` requires `--verbose`. Session persistence is off by default with `-p` (non-interactive); `--no-session-persistence` is required when not piping. Auth tokens live in system keychain / `~/.claude` data — HyperIdle must not extract them.
- **AM2 claim:** `claude` is installed, authenticated, supports non-interactive print mode with streaming JSON output, model/effort selection, and tool use. HyperIdle will surface it as a provider-subscription-cli harness with `native_cli_login` action pointing to `claude auth login`.

## OpenCode CLI

- **Binary:** `opencode`
- **Version command:** `opencode --version` → `1.17.8`
- **Installation:** npm/global package.
- **Auth:**
  - `opencode providers login [url]`
  - `opencode providers logout [provider]`
  - `opencode providers list` — prints configured providers/credentials (no `--json`; TUI table output)
- **Readiness probe used by AM2:** `opencode --version` + `opencode providers list`.
- **Auth status observed:** `OpenRouter api` credential present in `~/.local/share/opencode/auth.json`; `OPENAI_API_KEY` environment variable also present and detected.
- **Non-interactive launch:** `opencode run [message..]` with `--format json` for raw JSON events.
- **Model/options surface:** `-m, --model <provider/model>`, `--variant <reasoning variant>`, `--thinking`, `--agent <agent>`, `--dangerously-skip-permissions`, `--pure`, `-c, --continue`, `-s, --session`, `--dir`, `--command`.
- **Output/event format:** `--format json` emits JSON events; the exact schema was not captured in a live session run because the focus was on auth/readiness. A full event fixture is left as a future real-run capture; until then AM2 will not claim concrete event normalization for opencode.
- **Limitations:** Model names are `provider/model` slugs; provider configuration is managed outside HyperIdle. Event schema and cost metadata require further live-session capture.
- **AM2 claim:** `opencode` is installed and has a configured OpenRouter credential. It exposes a provider-subscription-cli auth path and can run non-interactively with `--format json`. Concrete session event normalization remains unproven and will be marked `unknown`/absent until a real `opencode run --format json` session is captured.

## Cursor / Cursor Agent

- **Local binary check:** `cursor` and `cursor-agent` are **not installed** on this computer and are not on PATH.
- **T3code research:** see `plans/AM2/research/t3code-source-map.md` §4.3. Cursor integration in t3code probes the Cursor IDE/ACP endpoint or `cursor agent` CLI when available; auth is implicit via the signed-in Cursor IDE, and models are fetched from ACP `/models`.
- **Public documentation:** Cursor exposes the Cursor Agent as part of the Cursor IDE; there is no standalone, documented, scriptable CLI available for headless integration at this time.
- **AM2 claim:** `cursor-agent` is **unavailable** in this environment. HyperIdle does not invent local CLI support. The descriptor for `cursor-agent` will report `unavailable` with reason `cursor / cursor-agent CLI is not installed or not on PATH and no documented headless local CLI surface exists`.

## HyperIdle built-in / API-gateway harness

- **Surface:** `packages/server/src/harness/builtin-harness-adapter.ts` calls `packages/server/src/harness/llm-client.ts` using a `ResolvedModel` from the model gateway.
- **Default gateway config:** `BUILT_IN_GATEWAY_CONFIG` defaults Anthropic tiers (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`).
- **Credential names:** `anthropic_api_key`, `openrouter_api_key`, `openai_compatible_api_key`.
- **Keys present on this computer:** `OPENAI_API_KEY` is present in the environment, but the default built-in gateway requires `anthropic_api_key`. No Anthropic or OpenRouter key is configured.
- **AM2 claim:** The built-in harness is ready only when the configured provider credential is present. When absent it reports `unauthenticated` with a precise missing-credential reason.

## Evidence files

- CLI help/version/auth outputs captured in the commands listed above are available in shell history; integration tests will re-run these exact commands and assert on their presence/shape. No tokens or keys are recorded.
