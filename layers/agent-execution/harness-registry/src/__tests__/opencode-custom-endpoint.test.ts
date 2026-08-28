/**
 * A custom OpenAI-compatible endpoint reaches opencode as a provider it can use.
 *
 * Onboarding offers three provider shapes. Two are named vendors with fixed
 * hosts, and their key travels in the environment variable that vendor reads.
 * The third — "OpenAI-compatible" — is whatever endpoint someone types, so no
 * environment variable can carry it: the key alone says nothing about where to
 * send it.
 *
 * opencode takes it as a provider declared in the config file it loads from the
 * session directory: an `@ai-sdk/openai-compatible` block with the base URL and
 * the key, and the model addressed as `<provider>/<model>` so the id names which
 * provider serves it. Verified live 2026-08-27 — a project `opencode.json` with
 * exactly this shape made the model appear in `opencode models`.
 *
 * The file is MERGED, never rewritten. `writeOpencodeJson` has already put the
 * MCP server there by the time a session starts, and clobbering it would take
 * away the agent's tools to give it a model.
 */

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";

const OPENCODE_CLI_CONFIG = cliAdapterFixture("opencode");

const sandboxes: string[] = [];
afterEach(() => {
	for (const dir of sandboxes.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeSandbox(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-custom-"));
	sandboxes.push(dir);
	return dir;
}

function makeFakeChild(): { proc: ChildProcess; emitExit: (code: number | null) => void } {
	const proc = new EventEmitter() as unknown as ChildProcess;
	(proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
	(proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
	(proc as unknown as { stdin: { end: () => void } }).stdin = { end: () => undefined };
	(proc as unknown as { pid: number }).pid = 4243;
	(proc as unknown as { kill: () => boolean }).kill = () => true;
	return { proc, emitExit: (code) => proc.emit("exit", code, null) };
}

async function startWithCustomEndpoint(
	sandboxPath: string,
	overrides: Partial<SessionConfig> = {},
): Promise<{ argv: string[]; env: Record<string, string> }> {
	const spawnSpy = vi.fn();
	const fakeChild = makeFakeChild();
	spawnSpy.mockReturnValue(fakeChild.proc);

	const adapter = new CliHarnessAdapter(OPENCODE_CLI_CONFIG, { spawnFn: spawnSpy });
	const started = adapter.startSession({
		sessionId: "opencode-custom-endpoint",
		sandboxPath,
		assembledPrompt: "Do the task.",
		modelTier: "workhorse",
		tools: [],
		selectedModel: "meta-llama/Llama-3-70b-chat-hf",
		resolvedModel: {
			provider: "openai-compatible",
			model: "meta-llama/Llama-3-70b-chat-hf",
			apiKey: "sk-custom-endpoint",
			baseUrl: "https://api.together.xyz/v1",
		},
		mcpConnectionInfo: undefined,
		...overrides,
	} as SessionConfig);
	await Promise.resolve();
	fakeChild.emitExit(0);
	await started;

	const [, argv, opts] = spawnSpy.mock.calls[0] as [
		string,
		string[],
		{ env: Record<string, string> },
	];
	return { argv, env: opts.env };
}

function readOpencodeJson(sandboxPath: string): Record<string, unknown> {
	const file = path.join(sandboxPath, "opencode.json");
	expect(fs.existsSync(file), "no opencode.json was written into the session directory").toBe(true);
	return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
}

describe("a brought endpoint reaches opencode as a provider", () => {
	it("declares the endpoint with its base URL and key", async () => {
		const sandboxPath = makeSandbox();
		await startWithCustomEndpoint(sandboxPath);

		const config = readOpencodeJson(sandboxPath);
		const providers = config.provider as Record<string, Record<string, unknown>> | undefined;
		expect(providers, "opencode.json declares no provider").toBeDefined();

		const entry = Object.values(providers ?? {})[0];
		expect(entry?.npm).toBe("@ai-sdk/openai-compatible");
		const options = entry?.options as Record<string, unknown> | undefined;
		expect(options?.baseURL).toBe("https://api.together.xyz/v1");
		// Compared as a boolean: a failing assertion prints what it received, and
		// what it received is a credential.
		expect(options?.apiKey === "sk-custom-endpoint").toBe(true);
	});

	it("addresses the model through that provider, so the id says who serves it", async () => {
		const sandboxPath = makeSandbox();
		const { argv } = await startWithCustomEndpoint(sandboxPath);

		const config = readOpencodeJson(sandboxPath);
		const providerId = Object.keys(config.provider as Record<string, unknown>)[0] as string;
		const model = argv[argv.indexOf("--model") + 1];
		expect(model).toBe(`${providerId}/meta-llama/Llama-3-70b-chat-hf`);

		// And the provider declares that model, or opencode has a prefix pointing
		// at nothing.
		const entry = (config.provider as Record<string, Record<string, unknown>>)[providerId];
		expect(Object.keys((entry?.models ?? {}) as Record<string, unknown>)).toContain(
			"meta-llama/Llama-3-70b-chat-hf",
		);
	});

	it("keeps the MCP server that was already written into the same file", async () => {
		const sandboxPath = makeSandbox();
		// The shape `writeOpencodeJson` leaves behind before a session starts.
		fs.writeFileSync(
			path.join(sandboxPath, "opencode.json"),
			JSON.stringify({
				$schema: "https://opencode.ai/config.json",
				mcp: {
					hyperidle: {
						type: "remote",
						url: "http://127.0.0.1:9/api/mcp/x",
						headers: { Authorization: "Bearer tok" },
						enabled: true,
					},
				},
			}),
			"utf-8",
		);

		await startWithCustomEndpoint(sandboxPath);

		const config = readOpencodeJson(sandboxPath);
		const mcp = config.mcp as Record<string, Record<string, unknown>> | undefined;
		expect(mcp?.hyperidle, "the MCP server was clobbered by the provider write").toBeDefined();
		expect(mcp?.hyperidle?.url).toBe("http://127.0.0.1:9/api/mcp/x");
		expect(config.provider).toBeDefined();
	});

	it("writes no provider block for a named vendor, whose key travels in the environment", async () => {
		const sandboxPath = makeSandbox();
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);
		const adapter = new CliHarnessAdapter(OPENCODE_CLI_CONFIG, { spawnFn: spawnSpy });
		const started = adapter.startSession({
			sessionId: "opencode-named-vendor",
			sandboxPath,
			assembledPrompt: "Do the task.",
			modelTier: "workhorse",
			tools: [],
			selectedModel: "openrouter/z-ai/glm-4.7-flash",
			resolvedModel: {
				provider: "openrouter",
				model: "z-ai/glm-4.7-flash",
				apiKey: "sk-or-test",
				baseUrl: "https://openrouter.ai/api",
			},
			mcpConnectionInfo: undefined,
		} as SessionConfig);
		await Promise.resolve();
		fakeChild.emitExit(0);
		await started;

		const file = path.join(sandboxPath, "opencode.json");
		if (fs.existsSync(file)) {
			const config = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
			expect(config.provider).toBeUndefined();
		}
		const [, argv] = spawnSpy.mock.calls[0] as [string, string[], unknown];
		// Untouched: the id opencode already knows how to route.
		expect(argv[argv.indexOf("--model") + 1]).toBe("openrouter/z-ai/glm-4.7-flash");
	});
});
