/**
 * AN1 real-harness inherited-reach pin — MOVED from
 * `layers/agent-execution/harness-registry/src/__tests__/AN1-real-harness-inherited.integration.test.ts`
 * (architecture.md §7.3 / §8 step 8): the probes' new home is the connections
 * package, so the pin drives the moved entry (`createInheritedReach`) directly
 * — seeded isolated homes, `assertIdentityOnly`, real binaries, zero stubs.
 *
 * Hard-rule 4 survives the move: every produced fact is identity-only
 * (name/kind/source/health — no secret, token, env, or command value).
 *
 * @lore AU36: gate divergence from the AN1 original, deliberately: the
 * opencode probe parses a config file and execs NOTHING, so it carries no
 * binary gate (the original's requireHarness("opencode") gated a discovery
 * that ran every family probe; the reach entry runs only the four reach
 * probes). claude/codex gates stay — their probes exec the real binary.
 *
 * FAILS until layers/agent-orchestration/connections/src/inherited-reach.ts
 * exists and exports createInheritedReach (D1).
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InheritedConnectionFact } from "@hyperidle/domain-model";
import { afterEach, describe, expect, test } from "vitest";
import { createInheritedReach } from "../inherited-reach.js";
import { requireBinary } from "./require-binary.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(path);
	return path;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

/** AN1 hard-rule 4, re-pinned on the moved fact shape: identity fields only. */
function assertIdentityOnly(facts: readonly InheritedConnectionFact[]): void {
	for (const fact of facts) {
		expect(Object.keys(fact).sort()).toEqual(["health", "kind", "name", "source"]);
	}
}

describe("AN1 real-harness inherited reach (moved pin)", () => {
	describe("codex", () => {
		requireBinary("codex");

		test("reads isolated MCP identity through the moved entry", async () => {
			const home = await temporaryDirectory("an1-codex-");
			await writeFile(
				join(home, "config.toml"),
				'[mcp_servers.an1-codex]\ncommand = "node"\nargs = ["index.js"]\n',
			);
			const reach = createInheritedReach();
			await reach.refresh({ env: { ...process.env, CODEX_HOME: home } });
			const facts = reach.list();
			expect(facts).toContainEqual({
				name: "an1-codex",
				kind: "mcp-server",
				source: "codex",
				health: "unknown",
			});
			assertIdentityOnly(facts);
		});

		test("reports an honest none-state from an empty isolated home", async () => {
			const home = await temporaryDirectory("an1-codex-empty-");
			const reach = createInheritedReach();
			await reach.refresh({ env: { ...process.env, CODEX_HOME: home } });
			expect(reach.list().filter((fact) => fact.source === "codex")).toEqual([]);
		});
	});

	describe("claude", () => {
		requireBinary("claude");

		test("reads isolated project MCP identity through the moved entry", async () => {
			const cwd = await temporaryDirectory("an1-claude-");
			await writeFile(
				join(cwd, ".mcp.json"),
				JSON.stringify({
					mcpServers: {
						"an1-claude": { command: "node", args: ["/tmp/not-present.js"], type: "stdio" },
					},
				}),
			);
			const reach = createInheritedReach();
			await reach.refresh({ cwd });
			const facts = reach.list().filter((fact) => fact.source === "claude-code");
			expect(facts).toContainEqual(
				expect.objectContaining({
					name: "an1-claude",
					health: expect.stringMatching(/^(needs-attention|unknown)$/),
				}),
			);
			assertIdentityOnly(facts);
		});
	});

	describe("opencode", () => {
		// No binary gate: this probe parses $XDG_CONFIG_HOME/opencode/opencode.jsonc
		// and execs nothing (@lore AU36 above).

		test("reads isolated JSONC MCP identity through the moved entry", async () => {
			const configHome = await temporaryDirectory("an1-opencode-");
			const configDirectory = join(configHome, "opencode");
			await mkdir(configDirectory);
			await writeFile(
				join(configDirectory, "opencode.jsonc"),
				JSON.stringify({
					// biome-ignore lint/style/useNamingConvention: external OpenCode config key.
					$schema: "https://opencode.ai/config.json",
					mcp: { "an1-opencode": { type: "remote", url: "http://localhost:19998/mcp" } },
				}),
			);
			const reach = createInheritedReach();
			await reach.refresh({ env: { ...process.env, XDG_CONFIG_HOME: configHome } });
			const facts = reach.list();
			expect(facts).toContainEqual({
				name: "an1-opencode",
				kind: "mcp-server",
				source: "opencode",
				health: "unknown",
			});
			assertIdentityOnly(facts);
		});

		test("reports honest none when config exists without MCP entries", async () => {
			const configHome = await temporaryDirectory("an1-opencode-empty-config-");
			const configDirectory = join(configHome, "opencode");
			await mkdir(configDirectory);
			await writeFile(join(configDirectory, "opencode.jsonc"), JSON.stringify({ theme: "system" }));
			const reach = createInheritedReach();
			await reach.refresh({ env: { ...process.env, XDG_CONFIG_HOME: configHome } });
			expect(reach.list().filter((fact) => fact.source === "opencode")).toEqual([]);
		});

		test("reports honest none when config is absent", async () => {
			const configHome = await temporaryDirectory("an1-opencode-no-config-");
			const reach = createInheritedReach();
			await reach.refresh({ env: { ...process.env, XDG_CONFIG_HOME: configHome } });
			expect(reach.list().filter((fact) => fact.source === "opencode")).toEqual([]);
		});
	});

	describe("environment", () => {
		// `gh` is the GitHub CLI, not a harness — Ruling 15. The binary is still required.
		requireBinary("gh");

		test("returns only identity fields from the real gh probe", async () => {
			const reach = createInheritedReach();
			await reach.refresh();
			const facts = reach.list();
			assertIdentityOnly(facts);
			const github = facts.find(({ name }) => name === "github");
			if (github) {
				expect(github).toMatchObject({
					kind: "cli",
					source: "environment",
					health: "working",
				});
			}
		});
	});
});
