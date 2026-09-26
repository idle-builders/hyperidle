/**
 * cli-adapter-real-binary — LIVE real-binary CliHarnessAdapter integration tests.
 *
 * Drives the REAL production CliHarnessAdapter (parseStdoutLine, buildResult,
 * wireStdout — every line of it) against the REAL installed binary for each
 * of the four supported harnesses, through one shared behavior:
 *
 *   REAL production CliHarnessAdapter → REAL binary → REAL LLM turn →
 *   a completion event containing the exact token requested, real (>=0) token
 *   usage, and no UnknownHarnessEvent parse-error pollution.
 *
 * ⚠️  LOCAL-ONLY LANE — runs via test:integration's serial `harness` project.
 *     CI runs the unit and service-integration lanes, but never this one: it
 *     needs real CLI binaries and real LLM credentials. Nothing records that
 *     it ran, so a human running it is the only evidence it passed.
 *
 * @lore AU21 (harness-telemetry narrowing): a `cost_update` event / `cost`
 * result field used to be asserted here too. Founder ruling narrowed harness
 * telemetry to token usage only — "very few harness can actually report
 * cost" (confirmed empirically: codex never emits `total_cost_usd`). No
 * harness's adapter emits `cost_update` anymore; every case below asserts its
 * absence.
 *
 * @lore claude-env-allowlist: CLAUDE_CLI_CONFIG's envAllowlist is
 * [PATH, HOME, LANG, USER, LOGNAME] — it does not forward CLAUDECODE or any
 * other CC session var, so claude's nested-session detection never fires even
 * when this test runs inside Claude Code, and claude authenticates via the
 * macOS Keychain (HOME/USER/LOGNAME is sufficient for the Security framework
 * to resolve the keychain user) — no key is injected.
 *
 * @lore codex-stdin-fix: the production adapter closes the child's stdin
 * immediately after spawn; without that, codex blocks forever on "Reading
 * additional input from stdin...". This test runs against the real binary to
 * prove the fix holds.
 *
 * @lore codex-sandbox: codex needs a git repo plus a `.codex-home/` (auth.json
 * + config.toml only — SQLite files lock and make codex exit before the LLM
 * call). The sandbox is built via `LocalSandboxAdapter.spawn()` +
 * `ensureSandboxGitRepo` — the exact two calls, same order, that run-
 * orchestration's real session provisioning uses — never a hand-rolled `git
 * init`, which would prove nothing about production's own provisioning path.
 */

import type { HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	createHarnessSandbox,
	provisionClaudeSandbox,
	provisionCodexHome,
	requireHarnessAuthed,
} from "./harness-sandbox.js";
import { productionCliConfig } from "./production-cli-config.js";
import { HARNESS_TEST_MODELS, type HarnessName, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

// @lore process-group kill only helps once stopSession runs. `track` stops any
// handle a test leaves unstopped — timeout or thrown assertion included — in
// afterEach. See session-handle-tracker.ts.
const { track } = trackHarnessSessions();

const ADAPTER_OK_PROMPT = "Reply with exactly the token ADAPTER_OK and nothing else.";

interface HarnessCase {
	readonly name: HarnessName;
	readonly selectedModel: string;
	/** True when a real turn on this harness reliably emits token_usage with real counts. */
	readonly expectsPositiveTokenUsage: boolean;
	buildSandbox(): Promise<{ sandboxPath: string; cleanup: () => Promise<void> }>;
}

const CASES: readonly HarnessCase[] = [
	{
		name: "claude",
		selectedModel: HARNESS_TEST_MODELS.claude.model,
		expectsPositiveTokenUsage: true,
		async buildSandbox() {
			const sandbox = createHarnessSandbox("cli-adapter-claude");
			provisionClaudeSandbox(sandbox.path);
			return { sandboxPath: sandbox.path, cleanup: sandbox.cleanup };
		},
	},
	{
		name: "codex",
		selectedModel: HARNESS_TEST_MODELS.codex.model,
		expectsPositiveTokenUsage: false,
		async buildSandbox() {
			const baseSandbox = createHarnessSandbox("cli-adapter-codex-base");
			const sandboxAdapter = new LocalSandboxAdapter();
			const handle = await sandboxAdapter.spawn(baseSandbox.path);
			ensureSandboxGitRepo(handle.path);
			const authFound = provisionCodexHome(handle.path);
			if (!authFound) {
				throw new Error(
					"codex: no ~/.codex/auth.json to copy into the per-session sandbox — run `codex login`. Never skip to green.",
				);
			}
			return { sandboxPath: handle.path, cleanup: baseSandbox.cleanup };
		},
	},
	{
		name: "opencode",
		selectedModel: HARNESS_TEST_MODELS.opencode.model,
		expectsPositiveTokenUsage: false,
		async buildSandbox() {
			const sandbox = createHarnessSandbox("cli-adapter-opencode");
			return { sandboxPath: sandbox.path, cleanup: sandbox.cleanup };
		},
	},
	{
		name: "cursor-agent",
		selectedModel: HARNESS_TEST_MODELS["cursor-agent"].model,
		expectsPositiveTokenUsage: false,
		async buildSandbox() {
			const sandbox = createHarnessSandbox("cli-adapter-cursor");
			return { sandboxPath: sandbox.path, cleanup: sandbox.cleanup };
		},
	},
];

describe("CLI adapter (real binary, production CliHarnessAdapter path)", () => {
	requireHarness("claude", "codex", "opencode", "cursor-agent");

	test.each(CASES)(
		"$name: real binary → parsed ADAPTER_OK completion + real token usage + no error pollution",
		async ({ name, selectedModel, expectsPositiveTokenUsage, buildSandbox }) => {
			await requireHarnessAuthed(name);

			const { sandboxPath, cleanup } = await buildSandbox();
			try {
				const config: SessionConfig = {
					sessionId: `cli-adapter-${name}-${Math.random().toString(36).slice(2, 10)}`,
					sandboxPath,
					assembledPrompt: ADAPTER_OK_PROMPT,
					instruction: ADAPTER_OK_PROMPT,
					modelTier: "workhorse" as const,
					tools: [],
					selectedModel,
					mcpConnectionInfo: undefined,
				};

				// NO spawnFn → REAL spawn.
				const adapter = new CliHarnessAdapter(productionCliConfig(name));
				const handle = await adapter.startSession(config);
				track(adapter, handle);

				const events: HarnessEvent[] = [];
				for await (const ev of adapter.streamEvents(handle)) {
					events.push(ev);
				}
				const result = await adapter.stopSession(handle);

				// ── completion event containing "ADAPTER_OK" ───────────────────────
				// Proves the harness's event-mapping translated the real binary's
				// output into a canonical completion event, for every dialect.
				const hasCompletion = events.some(
					(e) =>
						e.type === "completion" &&
						typeof (e as { text?: string }).text === "string" &&
						(e as { text: string }).text.includes("ADAPTER_OK"),
				);
				if (!hasCompletion) {
					const completions = events
						.filter((e) => e.type === "completion")
						.map((e) => (e as { text?: string }).text ?? "")
						.join(" | ");
					throw new Error(
						`${name}: ADAPTER PROOF FAILED — no completion event with 'ADAPTER_OK'. ` +
							`events: ${events.map((e) => e.type).join(",")}. completion texts: "${completions}"`,
					);
				}

				// ── no UnknownHarnessEvent errors ───────────────────────────────────
				const unknownErrors = events.filter(
					(e) => e.type === "error" && (e as { code?: string }).code === "UnknownHarnessEvent",
				);
				if (unknownErrors.length > 0) {
					throw new Error(
						`${name}: ADAPTER PROOF FAILED — UnknownHarnessEvent errors: ${JSON.stringify(unknownErrors.slice(0, 3))}`,
					);
				}

				// ── real (or honestly-absent) token usage, never a cost field ──────
				expect(events.some((e) => (e.type as string) === "cost_update")).toBe(false);
				const tokenEvent = events.find((e) => e.type === "token_usage");
				// A real per-harness run may honestly omit token_usage; the per-harness
				// expected-value branch below is a per-harness shape, not a skippable check.
				if (tokenEvent && tokenEvent.type === "token_usage") {
					// eslint-disable-next-line vitest/no-conditional-expect
					expect(tokenEvent.inputTokens).toBeGreaterThanOrEqual(0);
					// eslint-disable-next-line vitest/no-conditional-expect
					expect(tokenEvent.outputTokens).toBeGreaterThanOrEqual(0);
					if (expectsPositiveTokenUsage) {
						// eslint-disable-next-line vitest/no-conditional-expect
						expect(
							tokenEvent.inputTokens,
							`${name}: real LLM turn must consume input tokens`,
						).toBeGreaterThan(0);
						// eslint-disable-next-line vitest/no-conditional-expect
						expect(
							tokenEvent.outputTokens,
							`${name}: real LLM turn must consume output tokens`,
						).toBeGreaterThan(0);
					}
				} else if (expectsPositiveTokenUsage) {
					throw new Error(
						`${name}: expected a token_usage event from the real result but none was emitted.`,
					);
				}

				// ── outcome + no cost field on the result ──────────────────────────
				expect(result.outcome).toBe("completed");
				expect(result).not.toHaveProperty("cost");
			} finally {
				await cleanup();
			}
		},
		120_000,
	);
});
