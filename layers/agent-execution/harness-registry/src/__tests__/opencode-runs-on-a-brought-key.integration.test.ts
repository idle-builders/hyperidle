/**
 * opencode answers on a key HyperIdle holds, and on nothing else.
 *
 * ⚠️ LOCAL-ONLY LANE — the serial `harness` project. Real binary, real model call.
 *
 * This is the proof under "bring an API key, get a working workspace". opencode
 * is the harness someone's own key goes to; the other three authenticate through
 * their own subscription login and are handed nothing.
 *
 * The interesting part is what is taken AWAY. `OPENCODE_CLI_CONFIG.envAllowlist`
 * forwards `OPENROUTER_API_KEY` from the host environment, so on this machine —
 * where that variable is set — opencode would have found a key with or without
 * the routing this test exists to prove. So the lane deletes it from the process
 * environment for the duration, leaving the adapter's own injection as the only
 * path a key can take. A run that completes here completed on the key the
 * adapter put there.
 *
 * @lore opencode `run` waits on stdin when stdin is neither a TTY nor closed —
 * it reaches `init` in its own log and stops, with no error and no timeout.
 * `CliHarnessAdapter` closes the child's stdin, which is why sessions driven
 * through the adapter work while the same command typed into a non-interactive
 * shell appears to hang forever. Codex behaves the same way ("Reading additional
 * input from stdin..."). A driven CLI gets closed stdin, always.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";
import { requireHarness } from "./require-harness.js";

const OPENCODE_CLI_CONFIG = cliAdapterFixture("opencode");

describe("[harness:opencode] a key HyperIdle holds is enough to get an answer", () => {
	requireHarness("opencode");

	let hostKey: string | undefined;

	beforeEach(() => {
		hostKey = process.env.OPENROUTER_API_KEY;
		// The allowlist would forward this straight through, which would make the
		// run pass whether or not the adapter routed anything.
		process.env.OPENROUTER_API_KEY = undefined as unknown as string;
		delete process.env.OPENROUTER_API_KEY;
	});

	afterEach(() => {
		if (hostKey === undefined) delete process.env.OPENROUTER_API_KEY;
		else process.env.OPENROUTER_API_KEY = hostKey;
	});

	test("opencode completes a turn on a key the adapter routed, with none in the environment", async () => {
		// Compared as booleans, never as values: a failing assertion prints what it
		// received, and the received value here is a live credential.
		expect(
			Boolean(hostKey),
			"this lane needs a real OpenRouter key to route — set OPENROUTER_API_KEY",
		).toBe(true);
		expect(process.env.OPENROUTER_API_KEY).toBeUndefined();

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-brought-key-"));
		try {
			// Capture the environment the child is actually given, so the claim is
			// about what reached opencode rather than what we meant to send.
			let childEnv: Record<string, string> = {};
			const capturingSpawn = ((...args: Parameters<typeof spawn>) => {
				childEnv = (args[2] as { env: Record<string, string> }).env;
				return spawn(...args);
			}) as typeof spawn;

			const adapter = new CliHarnessAdapter(OPENCODE_CLI_CONFIG, { spawnFn: capturingSpawn });
			const handle = await adapter.startSession({
				sessionId: `brought-key-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: "Reply with exactly the token KEY_OK and nothing else.",
				modelTier: "workhorse",
				tools: [],
				selectedModel: "openrouter/z-ai/glm-4.7-flash",
				// The shape onboarding produces: a key someone typed, stored, and
				// resolved for the provider it belongs to.
				resolvedModel: {
					provider: "openrouter",
					model: "z-ai/glm-4.7-flash",
					apiKey: hostKey as string,
					baseUrl: "https://openrouter.ai/api",
				},
				mcpConnectionInfo: undefined,
			} as SessionConfig);

			const events: HarnessEvent[] = [];
			for await (const ev of adapter.streamEvents(handle)) {
				events.push(ev);
			}
			const result = await adapter.stopSession(handle);

			expect(result.outcome).toBe("completed");
			const text = events
				.filter((e): e is Extract<HarnessEvent, { type: "completion" }> => e.type === "completion")
				.map((e) => e.text)
				.join(" ");
			expect(text).toContain("KEY_OK");

			// The key was in the child's environment, and it got there from the
			// adapter — nothing else could have put it there.
			expect(
				childEnv.OPENROUTER_API_KEY === hostKey,
				"the key opencode received is not the one the adapter was given",
			).toBe(true);
			expect(childEnv.ANTHROPIC_API_KEY).toBeUndefined();
		} finally {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	}, 240_000);

	test("opencode completes a turn through a brought OpenAI-compatible endpoint", async () => {
		// OpenRouter speaks the OpenAI-compatible protocol, so it stands in for the
		// "type your own endpoint" case using a credential this machine actually
		// has. Nothing here names OpenRouter to opencode: it is handed a base URL
		// and a key, exactly as a stranger's endpoint would be, and reaches the
		// model through the provider block the adapter declares.
		expect(Boolean(hostKey)).toBe(true);

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-brought-endpoint-"));
		try {
			let argv: string[] = [];
			const capturingSpawn = ((...args: Parameters<typeof spawn>) => {
				argv = args[1] as string[];
				return spawn(...args);
			}) as typeof spawn;

			const adapter = new CliHarnessAdapter(OPENCODE_CLI_CONFIG, { spawnFn: capturingSpawn });
			const handle = await adapter.startSession({
				sessionId: `brought-endpoint-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: "Reply with exactly the token ENDPOINT_OK and nothing else.",
				modelTier: "workhorse",
				tools: [],
				selectedModel: "z-ai/glm-4.7-flash",
				resolvedModel: {
					provider: "openai-compatible",
					model: "z-ai/glm-4.7-flash",
					apiKey: hostKey as string,
					baseUrl: "https://openrouter.ai/api/v1",
				},
				mcpConnectionInfo: undefined,
			} as SessionConfig);

			const events: HarnessEvent[] = [];
			for await (const ev of adapter.streamEvents(handle)) {
				events.push(ev);
			}
			const result = await adapter.stopSession(handle);

			expect(result.outcome).toBe("completed");
			const text = events
				.filter((e): e is Extract<HarnessEvent, { type: "completion" }> => e.type === "completion")
				.map((e) => e.text)
				.join(" ");
			expect(text).toContain("ENDPOINT_OK");

			// The model was addressed through the declared provider, not passed
			// through as a bare id opencode would have had to already know.
			const model = argv[argv.indexOf("--model") + 1] ?? "";
			expect(model.endsWith("/z-ai/glm-4.7-flash")).toBe(true);
			expect(model).not.toBe("z-ai/glm-4.7-flash");
		} finally {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	}, 240_000);
});
