/**
 * The per-model options an agent is configured with reach its harness, and the
 * harness confirms it applied them.
 *
 * ⚠️ LOCAL-ONLY LANE — the serial `harness` project. Real binaries, real logins.
 *
 * `model-options.ts` already declares each harness's option keys and how each
 * one is carried, with a compile-time coupling that fails `npm run check` if a
 * key has no carrier or a carrier has no key. What it never had is the other
 * half — evidence that the harness on the far end actually honoured the value.
 * That is the same gap that let the model itself be silently discarded, so it is
 * closed the same way: drive the production adapter and read the harness's own
 * report back.
 *
 * COVERAGE IS NOT EQUAL HERE, AND THAT IS A FACT ABOUT THE HARNESSES:
 *
 *   claude        `--effort` — verified. Its own `/model` command reports the
 *                 effort in force, and costs nothing to ask.
 *   codex         `model_reasoning_effort` — verified. Its session rollout
 *                 records `effort` next to `model` in `turn_context`.
 *   cursor-agent  declares NO options, and this file pins the reason: effort is
 *                 part of model identity (~200 flat ids ending `-low`/`-high`/
 *                 `-max`/`-fast`), and the bracket-override form its own help
 *                 text advertises is REJECTED by the binary. Proven below rather
 *                 than asserted in a comment.
 *   opencode      `--variant` — carried, NOT verified. opencode publishes no
 *                 statement of the variant a session ran with, and it silently
 *                 ignores an unknown one, so there is nothing to read back. A
 *                 lane that ran it and asserted only that the turn completed
 *                 would prove the flag is tolerated, not that it applied — a
 *                 false green. It is left out deliberately, and this paragraph
 *                 is the record of why.
 */

import { execFile, execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";
import { requireHarness } from "./require-harness.js";

const execFileAsync = promisify(execFile);

const CLAUDE_CLI_CONFIG = cliAdapterFixture("claude");
const CODEX_CLI_CONFIG = cliAdapterFixture("codex");

/** The real `spawn`, with the child's stdout duplicated into `sink`. */
function teeingSpawn(sink: { text: string }): typeof spawn {
	return ((...args: Parameters<typeof spawn>) => {
		const child = spawn(...args);
		child.stdout?.on("data", (chunk: Buffer | string) => {
			sink.text += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
		});
		return child;
	}) as typeof spawn;
}

function jsonLines(text: string): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === "object") out.push(parsed as Record<string, unknown>);
		} catch {
			// partial line — the value we want lands on a line of its own
		}
	}
	return out;
}

async function rmSandboxWithRetry(sandboxPath: string): Promise<void> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
			return;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "ENOTEMPTY" && code !== "EBUSY") throw err;
			await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
		}
	}
	fs.rmSync(sandboxPath, { recursive: true, force: true });
}

async function runSession(
	config: ReturnType<typeof cliAdapterFixture>,
	sessionConfig: Omit<SessionConfig, "modelTier" | "tools">,
): Promise<{ stdout: string; events: HarnessEvent[] }> {
	const sink = { text: "" };
	const adapter = new CliHarnessAdapter(config, { spawnFn: teeingSpawn(sink) });
	const handle = await adapter.startSession({
		...sessionConfig,
		modelTier: "workhorse" as const,
		tools: [],
	} as SessionConfig);
	const events: HarnessEvent[] = [];
	for await (const ev of adapter.streamEvents(handle)) {
		events.push(ev);
	}
	await adapter.stopSession(handle);
	return { stdout: sink.text, events };
}

function sessionId(prefix: string): string {
	return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── claude ────────────────────────────────────────────────────────────────────

function provisionClaudeSandbox(sandboxPath: string): void {
	fs.writeFileSync(
		path.join(sandboxPath, ".mcp.json"),
		JSON.stringify({
			mcpServers: { hyperidle: { type: "http", url: "http://localhost:9/api/mcp/x" } },
		}),
		"utf-8",
	);
	fs.mkdirSync(path.join(sandboxPath, ".claude"), { recursive: true });
	fs.writeFileSync(path.join(sandboxPath, ".claude", "settings.json"), JSON.stringify({}), "utf-8");
}

describe("[harness:claude] the configured effort is the effort claude runs with", () => {
	requireHarness("claude");

	test("asking for low and then max each comes back stated by claude itself", async () => {
		const seen: string[] = [];
		for (const effort of ["low", "max"]) {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "model-opt-claude-"));
			try {
				provisionClaudeSandbox(sandboxPath);
				// `/model` is claude's own account of the session it is in — the model
				// and the effort in force. It is answered locally, so this proof costs
				// nothing and cannot be confused with the model's opinion of itself.
				const { stdout } = await runSession(CLAUDE_CLI_CONFIG, {
					sessionId: sessionId("model-opt-claude"),
					sandboxPath,
					assembledPrompt: "/model",
					instruction: "/model",
					selectedModel: "haiku",
					modelOptions: { effort },
					mcpConnectionInfo: undefined,
				});
				const result = jsonLines(stdout).find((o) => o.type === "result");
				const text = typeof result?.result === "string" ? result.result : "";
				expect(text, `claude said nothing about the session for --effort ${effort}`).toContain(
					"effort:",
				);
				expect(text).toContain(`effort: ${effort}`);
				seen.push(text);
			} finally {
				await rmSandboxWithRetry(sandboxPath);
			}
		}
		// Two different asks produced two different answers — the option steers.
		expect(seen[0]).not.toBe(seen[1]);
	}, 240_000);
});

// ── codex ─────────────────────────────────────────────────────────────────────

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

function provisionCodexHome(sandboxPath: string): boolean {
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	fs.mkdirSync(codexHomeDir, { recursive: true });
	const homeCodexDir = path.join(os.homedir(), ".codex");
	let authFound = false;
	for (const fname of ["auth.json", "config.toml"]) {
		const src = path.join(homeCodexDir, fname);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, path.join(codexHomeDir, fname));
			if (fname === "auth.json") authFound = true;
		}
	}
	return authFound;
}

/** codex records the effort alongside the model in its own `turn_context`. */
function codexTurnContext(
	stdout: string,
	codexHome: string,
): { model?: string; effort?: string } | undefined {
	const started = jsonLines(stdout).find((o) => o.type === "thread.started");
	const threadId = typeof started?.thread_id === "string" ? started.thread_id : undefined;
	if (!threadId) return undefined;
	const sessionsRoot = path.join(codexHome, "sessions");
	if (!fs.existsSync(sessionsRoot)) return undefined;
	const stack = [sessionsRoot];
	while (stack.length > 0) {
		const dir = stack.pop() as string;
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else if (entry.name.includes(threadId) && entry.name.endsWith(".jsonl")) {
				for (const obj of jsonLines(fs.readFileSync(full, "utf-8"))) {
					if (obj.type !== "turn_context") continue;
					const payload = obj.payload as Record<string, unknown> | undefined;
					return {
						...(typeof payload?.model === "string" ? { model: payload.model } : {}),
						...(typeof payload?.effort === "string" ? { effort: payload.effort } : {}),
					};
				}
			}
		}
	}
	return undefined;
}

describe("[harness:codex] the configured reasoning effort is the effort codex runs with", () => {
	requireHarness("codex");

	test("two different efforts each come back recorded by codex for the turn it ran", async () => {
		// NEITHER value may be the one already in play, or a broken carrier passes
		// by coincidence. `provisionCodexHome` copies the machine's own
		// `config.toml` into the session CODEX_HOME, and that file may set
		// `model_reasoning_effort` — asking for the same value would prove nothing.
		// Two asks, both different from each other, is what makes a dropped option
		// impossible to miss.
		const seen: string[] = [];
		for (const effort of ["low", "xhigh"]) {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "model-opt-codex-"));
			try {
				provisionCodexRepo(sandboxPath);
				expect(provisionCodexHome(sandboxPath)).toBe(true);
				const { stdout } = await runSession(CODEX_CLI_CONFIG, {
					sessionId: sessionId("model-opt-codex"),
					sandboxPath,
					assembledPrompt: "Reply with exactly the token OPTION_OK and nothing else.",
					instruction: "Reply with exactly the token OPTION_OK and nothing else.",
					selectedModel: "gpt-5.6-luna",
					modelOptions: { model_reasoning_effort: effort },
					mcpConnectionInfo: undefined,
				});
				const ctx = codexTurnContext(stdout, path.join(sandboxPath, ".codex-home"));
				expect(ctx, "codex recorded no turn context").toBeDefined();
				expect(ctx?.model).toBe("gpt-5.6-luna");
				expect(ctx?.effort, `codex ran at ${ctx?.effort}, not the requested ${effort}`).toBe(
					effort,
				);
				seen.push(ctx?.effort as string);
			} finally {
				await rmSandboxWithRetry(sandboxPath);
			}
		}
		expect(seen[0]).not.toBe(seen[1]);
	}, 300_000);
});

// ── cursor-agent ──────────────────────────────────────────────────────────────

describe("[harness:cursor-agent] cursor takes its effort in the model id, not an option", () => {
	requireHarness("cursor-agent");

	test("the bracket-override form cursor's own help advertises is rejected by the binary", async () => {
		// This is why `OPTION_KEYS["cursor-agent"]` is empty. `--list-models` closes
		// with a tip advertising `--model 'id[context=1m,effort=high,fast=false]'`,
		// so the obvious reading is that cursor takes options that way. It does not.
		// Offering that as a control would hand someone a setting that kills every
		// run — this test is what keeps the empty declaration honest if the binary
		// ever changes its mind.
		let rejected = false;
		let message = "";
		try {
			const { stdout, stderr } = await execFileAsync(
				"cursor-agent",
				[
					"-p",
					"hi",
					"--model",
					"claude-opus-5-thinking-high[context=1m]",
					"--trust",
					"--output-format",
					"stream-json",
				],
				{ timeout: 120_000 },
			);
			message = stdout + stderr;
			rejected = /cannot use this model/i.test(message);
		} catch (err) {
			const e = err as { stdout?: string; stderr?: string; message?: string };
			message = `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`;
			rejected = true;
		}
		expect(rejected, `cursor accepted a bracketed model id: ${message.slice(0, 200)}`).toBe(true);
		expect(message.toLowerCase()).toContain("cannot use this model");
	}, 180_000);
});
