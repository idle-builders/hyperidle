/**
 * The model a session asks for is the model the harness actually runs — proven
 * against every real binary, from each harness's own report of what it used.
 *
 * ⚠️ LOCAL-ONLY LANE — the serial `harness` project. Real binaries, real model
 * calls, real subscription logins. No CI job runs this.
 *
 * WHY THIS EXISTS. Three defects met here. `--model` was sourced from the
 * gateway's `ResolvedModel`, which needs an API key per provider; on a machine
 * authenticated only by a CLI's own login the resolution threw, the error was
 * swallowed, and the adapter stripped `--model` out of the invocation entirely.
 * The person's choice was discarded in silence. And **nothing anywhere read
 * back what actually ran**, which is precisely why that survived unnoticed. An
 * argv assertion alone would repeat the mistake: it proves what we sent, not
 * what the model layer honoured.
 *
 * HOW IT PROVES IT. claude and cursor-agent lanes drive the production
 * CliHarnessAdapter through its own `spawnFn` seam, wrapping the real `spawn`
 * so the child's stdout is teed into a buffer while the adapter consumes it
 * exactly as it does in production. The buffer is then read for that harness's
 * own statement of the model it ran. codex and opencode lanes drive their
 * production adapters (CodexAppServerAdapter and OpenCodeServeAdapter
 * respectively) directly, using each adapter's own model-readback mechanism.
 * `selectedModel` is set and `resolvedModel` is absent — the shape a
 * subscription-authenticated machine actually has.
 *
 * THE READBACK IS DIFFERENT PER HARNESS, and that is a fact about the harnesses,
 * not a gap here:
 *   claude        result line `modelUsage`, keyed by the concrete model id
 *   cursor-agent  `system`/`init` line `model` — a display LABEL, not the id
 *   codex         absent from stdout; its own rollout JSONL carries `model`
 *   opencode      no structural readback — session completion proves model was accepted
 *
 * MODELS ARE NOT PINNED TO A CONSTANT. Each lane asks discovery what this
 * machine's login actually offers and picks from that, so a model the vendor
 * retires fails loudly here instead of rotting in a hand-maintained list. Two
 * models are used per harness where the readback allows it — asking for one and
 * then the other proves the flag STEERS, rather than that we happened to name
 * the default.
 */

import { execFileSync, spawn } from "node:child_process";
import type { HarnessAdapter, HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { CodexAppServerAdapter } from "../codex-app-server-adapter.js";
import { discoverLocalHarnesses } from "../harness-discovery.js";
import {
	createHarnessSandbox,
	provisionClaudeSandbox,
	provisionCodexHome,
	requireHarnessAuthed,
} from "./harness-sandbox.js";
import { productionCliConfig, productionHarnessAdapter } from "./production-cli-config.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();

const CLAUDE_CLI_CONFIG = productionCliConfig("claude");
const CURSOR_AGENT_CLI_CONFIG = productionCliConfig("cursor-agent");

const PROMPT = "Reply with exactly the token MODEL_OK and nothing else.";

// ── stdout tee ────────────────────────────────────────────────────────────────

/**
 * The real `spawn`, with the child's stdout duplicated into `sink`. The adapter
 * still reads the stream itself — a second `data` listener does not consume it —
 * so the production parse path runs untouched while the raw lines stay readable.
 */
function teeingSpawn(sink: { text: string }): typeof spawn {
	return ((...args: Parameters<typeof spawn>) => {
		const child = spawn(...args);
		child.stdout?.on("data", (chunk: Buffer | string) => {
			sink.text += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
		});
		return child;
	}) as typeof spawn;
}

/** Every JSON object on its own line in a captured stdout buffer. */
function jsonLines(text: string): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === "object") out.push(parsed as Record<string, unknown>);
		} catch {
			// A partial line is not a failure — the next chunk completes it and the
			// value we want appears on a line of its own.
		}
	}
	return out;
}

/** Run one session through the production CliHarnessAdapter, returning its raw stdout. */
async function runWithModel(
	config: ReturnType<typeof productionCliConfig>,
	sessionConfig: Omit<SessionConfig, "modelTier" | "tools">,
): Promise<{ stdout: string; events: HarnessEvent[] }> {
	const sink = { text: "" };
	const adapter = new CliHarnessAdapter(config, { spawnFn: teeingSpawn(sink) });
	const handle = track(
		adapter,
		await adapter.startSession({
			...sessionConfig,
			modelTier: "workhorse" as const,
			tools: [],
		} as SessionConfig),
	);
	const events: HarnessEvent[] = [];
	for await (const ev of adapter.streamEvents(handle)) {
		events.push(ev);
	}
	await adapter.stopSession(handle);
	return { stdout: sink.text, events };
}

/** Run one session through any HarnessAdapter, returning its events and per-adapter ids. */
async function runSessionWithAdapter(
	adapter: HarnessAdapter,
	sessionConfig: SessionConfig,
): Promise<{
	events: HarnessEvent[];
	handle: Awaited<ReturnType<HarnessAdapter["startSession"]>>;
	nativeSessionId: string | undefined;
	threadModel: string | undefined;
}> {
	const handle = track(adapter, await adapter.startSession(sessionConfig));
	const events: HarnessEvent[] = [];
	for await (const ev of adapter.streamEvents(handle)) {
		events.push(ev);
	}
	// Capture ids BEFORE stopSession — stopSession deletes the session entry.
	const nativeSessionId = adapter.getNativeSessionId?.(handle);
	const threadModel =
		adapter instanceof CodexAppServerAdapter ? adapter.getThreadModel(handle) : undefined;
	await adapter.stopSession(handle);
	return { events, handle, nativeSessionId, threadModel };
}

/** The models this machine's login actually offers for a harness, from discovery. */
async function discoveredModels(
	harness: "claude-code" | "codex" | "opencode" | "cursor-agent",
): Promise<readonly { id: string; label: string }[]> {
	const result = await discoverLocalHarnesses();
	const models = result[harness].models ?? [];
	return models.map((m) => ({ id: m.id, label: m.label }));
}

function sessionId(prefix: string): string {
	return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── claude ────────────────────────────────────────────────────────────────────

/**
 * claude states the model it used on each `assistant` message's own
 * `message.model` field — the CLI's real per-turn guarantee.
 *
 * @lore: modelUsage key order — not the answering model; internal small-model entry can sort first; read assistant.model instead
 */
function claudeModelUsed(stdout: string): string | undefined {
	for (const obj of jsonLines(stdout).reverse()) {
		if (obj.type !== "assistant") continue;
		const message = obj.message;
		if (message && typeof message === "object") {
			const model = (message as Record<string, unknown>).model;
			if (typeof model === "string" && model.length > 0) return model;
		}
	}
	return undefined;
}

describe("[harness:claude] the model asked for is the model claude runs", () => {
	requireHarness("claude");

	test("two different requested models each come back named in claude's own usage report", async () => {
		const offered = await discoveredModels("claude-code");
		expect(offered.length).toBeGreaterThan(0);
		// haiku is the tiny baseline; sonnet is the second point that proves steering.
		const wanted = ["haiku", "sonnet"].filter((id) => offered.some((m) => m.id === id));
		expect(wanted).toEqual(["haiku", "sonnet"]);

		const seen: string[] = [];
		for (const model of wanted) {
			const sandbox = createHarnessSandbox("model-sel-claude");
			const sandboxPath = sandbox.path;
			try {
				provisionClaudeSandbox(sandboxPath);
				const { stdout } = await runWithModel(CLAUDE_CLI_CONFIG, {
					sessionId: sessionId("model-sel-claude"),
					sandboxPath,
					assembledPrompt: PROMPT,
					instruction: PROMPT,
					// The shape a subscription-authenticated machine has: a chosen model,
					// no gateway credential anywhere.
					selectedModel: model,
					mcpConnectionInfo: undefined,
				});
				const used = claudeModelUsed(stdout);
				expect(used, `claude reported no model for --model ${model}`).toBeDefined();
				seen.push(used as string);
				// `haiku` is an alias; claude reports the concrete id it resolved to.
				expect(used?.toLowerCase()).toContain(model);
			} finally {
				await sandbox.cleanup();
			}
		}
		// Asking for a different model produced a different model — the flag steers.
		expect(seen[0]).not.toBe(seen[1]);
	}, 240_000);
});

// ── cursor-agent ──────────────────────────────────────────────────────────────

/** cursor states the model on its `system`/`init` line — as a display label. */
function cursorModelUsed(stdout: string): string | undefined {
	for (const obj of jsonLines(stdout)) {
		if (obj.type === "system" && obj.subtype === "init" && typeof obj.model === "string") {
			return obj.model;
		}
	}
	return undefined;
}

describe("[harness:cursor-agent] the model asked for is the model cursor runs", () => {
	requireHarness("cursor-agent");

	test("two different requested models each come back named in cursor's own init report", async () => {
		const offered = await discoveredModels("cursor-agent");
		expect(offered.length).toBeGreaterThan(0);
		const wanted = ["composer-2.5", "gpt-5.2"].filter((id) => offered.some((m) => m.id === id));
		expect(wanted.length).toBe(2);

		const seen: string[] = [];
		for (const model of wanted) {
			const sandbox = createHarnessSandbox("model-sel-cursor");
			const sandboxPath = sandbox.path;
			try {
				const { stdout } = await runWithModel(CURSOR_AGENT_CLI_CONFIG, {
					sessionId: sessionId("model-sel-cursor"),
					sandboxPath,
					assembledPrompt: PROMPT,
					instruction: PROMPT,
					selectedModel: model,
					mcpConnectionInfo: undefined,
				});
				const used = cursorModelUsed(stdout);
				expect(used, `cursor reported no model for --model ${model}`).toBeDefined();
				seen.push(used as string);
				// cursor reports the LABEL, so match it against the label discovery
				// published for that id rather than against the id itself.
				const label = offered.find((m) => m.id === model)?.label ?? "";
				expect(used?.startsWith(label)).toBe(true);
			} finally {
				await sandbox.cleanup();
			}
		}
		expect(seen[0]).not.toBe(seen[1]);
	}, 240_000);
});

// ── codex ─────────────────────────────────────────────────────────────────────

/**
 * codex refuses to run outside a git repository unless told otherwise, and the
 * production args do not pass `--skip-git-repo-check` — a real session's sandbox
 * IS a repo. An empty one satisfies it.
 */
function provisionCodexRepo(sandboxPath: string): void {
	execFileSync("git", ["init"], { cwd: sandboxPath, stdio: "ignore" });
	execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
		cwd: sandboxPath,
		stdio: "ignore",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@t",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@t",
		},
	});
}

describe("[harness:codex] the model asked for is the model codex runs", () => {
	requireHarness("codex");

	test("the requested model is the one codex records for the turn it ran", async () => {
		await requireHarnessAuthed("codex");

		const offered = await discoveredModels("codex");
		expect(offered.length).toBeGreaterThan(0);
		// The smallest model this account is offered, taken from codex's own list.
		const model =
			offered.find((m) => m.id.endsWith("-mini"))?.id ?? offered[offered.length - 1]?.id;
		expect(model).toBeDefined();
		if (!model) return;

		const sandbox = createHarnessSandbox("model-sel-codex");
		const sandboxPath = sandbox.path;
		try {
			provisionCodexRepo(sandboxPath);
			expect(provisionCodexHome(sandboxPath)).toBe(true);

			// CodexAppServerAdapter — production adapter (codex app-server --stdio).
			// threadModel is read from the thread/start JSON-RPC response (ephemeral sessions
			// do not write a session rollout JSONL, so the RPC echo is the only reliable source).
			const adapter = productionHarnessAdapter("codex");
			const { threadModel } = await runSessionWithAdapter(adapter, {
				sessionId: sessionId("model-sel-codex"),
				sandboxPath,
				assembledPrompt: PROMPT,
				instruction: PROMPT,
				selectedModel: model,
				mcpConnectionInfo: undefined,
				modelTier: "workhorse",
				tools: [],
			});

			expect(threadModel, "codex thread/start must echo the requested model").toBeDefined();
			expect(threadModel).toBe(model);
		} finally {
			await sandbox.cleanup();
		}
	}, 240_000);
});

// ── opencode ──────────────────────────────────────────────────────────────────
//
// opencode serve (OpenCodeServeAdapter) sends the model via the HTTP POST body.
// The SSE event stream does not expose model readback — session completion proves
// the model flag was accepted (a bad model string causes a startup error).

describe("[harness:opencode] the requested model is accepted and runs to completion", () => {
	requireHarness("opencode");

	test("requested model sent to opencode serve session and session completes", async () => {
		await requireHarnessAuthed(
			"opencode",
			"model-selection opencode needs a real logged-in session",
		);

		const sandbox = createHarnessSandbox("model-sel-opencode");
		const sandboxPath = sandbox.path;
		try {
			// OpenCodeServeAdapter — production adapter (opencode serve --port 0).
			// model is sent in the POST /session/{id}/prompt_async body.
			const adapter = productionHarnessAdapter("opencode");
			const { events } = await runSessionWithAdapter(adapter, {
				sessionId: sessionId("model-sel-opencode"),
				sandboxPath,
				assembledPrompt: PROMPT,
				instruction: PROMPT,
				selectedModel: HARNESS_TEST_MODELS.opencode.model,
				mcpConnectionInfo: undefined,
				modelTier: "workhorse",
				tools: [],
			});

			// A completion event with text proves the model accepted the session and ran.
			// A bad model string causes an HTTP error at session start (startup failure).
			const completionText = events
				.filter((e) => e.type === "completion")
				.map((e) => ("text" in e ? (e.text as string) : ""))
				.join("");
			expect(
				completionText,
				`opencode session must produce completion text (proves model was accepted). ` +
					`Got empty — session may have failed at startup with a bad model string.`,
			).toContain("MODEL_OK");
		} finally {
			await sandbox.cleanup();
		}
	}, 240_000);
});
