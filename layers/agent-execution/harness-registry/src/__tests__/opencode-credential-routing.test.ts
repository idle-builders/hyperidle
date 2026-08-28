/**
 * A stored API key reaches opencode under the name that key's provider uses.
 *
 * opencode is the harness someone's own API key goes to — it accepts one for any
 * provider it knows, which is what makes "bring a key, get a working workspace"
 * possible at all. The other three authenticate through their own subscription
 * logins and take no key from us.
 *
 * The defect this closes: the opencode adapter injected `{{apiKey}}` into
 * `ANTHROPIC_API_KEY` **whatever provider the key was for**. Onboarding lets
 * someone pick Anthropic, OpenRouter or a custom OpenAI-compatible endpoint, so
 * an OpenRouter key — the common case — arrived under a name that provider never
 * reads, while the name it did arrive under belongs to a different vendor
 * entirely. The key was stored, carried, and useless.
 *
 * These assertions are on the environment the adapter builds for the child, so
 * they hold without opencode having to accept the key. Whether opencode then
 * authenticates with it is a separate, live question — and one that is easy to
 * answer wrongly from a green test here, so it is not claimed.
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

// A real directory: a brought OpenAI-compatible endpoint is declared in a config
// file the adapter writes into the session directory, so that directory has to
// exist the way it does in production.
const sandboxes: string[] = [];
afterEach(() => {
	for (const dir of sandboxes.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function makeSandbox(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-cred-"));
	sandboxes.push(dir);
	return dir;
}

function makeFakeChild(): { proc: ChildProcess; emitExit: (code: number | null) => void } {
	const proc = new EventEmitter() as unknown as ChildProcess;
	(proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
	(proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
	(proc as unknown as { stdin: { end: () => void } }).stdin = { end: () => undefined };
	(proc as unknown as { pid: number }).pid = 4242;
	(proc as unknown as { kill: () => boolean }).kill = () => true;
	return { proc, emitExit: (code) => proc.emit("exit", code, null) };
}

/** The env the adapter hands the child for a session resolved against `provider`. */
async function spawnEnvFor(
	resolvedModel: SessionConfig["resolvedModel"],
): Promise<Record<string, string>> {
	const spawnSpy = vi.fn();
	const fakeChild = makeFakeChild();
	spawnSpy.mockReturnValue(fakeChild.proc);

	const adapter = new CliHarnessAdapter(OPENCODE_CLI_CONFIG, { spawnFn: spawnSpy });
	const started = adapter.startSession({
		sessionId: "opencode-credential-routing",
		sandboxPath: makeSandbox(),
		assembledPrompt: "Do the task.",
		modelTier: "workhorse",
		tools: [],
		selectedModel: "openrouter/z-ai/glm-4.7-flash",
		...(resolvedModel ? { resolvedModel } : {}),
		mcpConnectionInfo: undefined,
	} as SessionConfig);
	await Promise.resolve();
	fakeChild.emitExit(0);
	await started;

	const [, , opts] = spawnSpy.mock.calls[0] as [string, string[], { env: Record<string, string> }];
	return opts.env;
}

describe("a stored key reaches opencode under its own provider's name", () => {
	it("an OpenRouter key arrives as OPENROUTER_API_KEY, not as another vendor's", async () => {
		const env = await spawnEnvFor({
			provider: "openrouter",
			model: "z-ai/glm-4.7-flash",
			apiKey: "sk-or-routing-test",
			baseUrl: "https://openrouter.ai/api",
		});
		expect(env.OPENROUTER_API_KEY).toBe("sk-or-routing-test");
		// The old behaviour put it here, where OpenRouter never looks.
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
	});

	it("an Anthropic key arrives as ANTHROPIC_API_KEY", async () => {
		const env = await spawnEnvFor({
			provider: "anthropic",
			model: "claude-haiku-4-5",
			apiKey: "sk-ant-routing-test",
			baseUrl: "https://api.anthropic.com",
		});
		expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-routing-test");
		expect(env.OPENROUTER_API_KEY).toBeUndefined();
	});

	it("no key means no credential variable at all, rather than an empty one", async () => {
		// An empty `ANTHROPIC_API_KEY=""` is not nothing: it is a set variable, and
		// a harness that reads it can prefer it over the login the person already
		// has. Absent is the only correct shape for "we hold no key".
		const env = await spawnEnvFor(undefined);
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(env.OPENROUTER_API_KEY).toBeUndefined();
	});

	it("a key for a provider opencode takes no variable for is not smuggled into one", async () => {
		// openai-compatible has no fixed host, so no environment variable can mean
		// "this endpoint": the key alone says nothing about where to send it. It
		// travels as a provider block in the session config instead (see
		// `opencode-custom-endpoint`), and putting it in some other vendor's
		// variable would aim it at the wrong service.
		const env = await spawnEnvFor({
			provider: "openai-compatible",
			model: "meta-llama/Llama-3-70b-chat-hf",
			apiKey: "sk-custom-endpoint",
			baseUrl: "https://api.together.xyz/v1",
		});
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(env.OPENROUTER_API_KEY).toBeUndefined();
		expect(Object.values(env)).not.toContain("sk-custom-endpoint");
	});
});
