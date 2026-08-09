import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InheritedToolDescriptor } from "@hyperidle/harness-capability";
import { afterEach, describe, expect, test } from "vitest";
import { discoverLocalHarnesses } from "../harness-discovery.js";
import { requireBinary } from "./require-binary.js";
import { requireHarness } from "./require-harness.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(path);
	return path;
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

function assertIdentityOnly(tools: readonly InheritedToolDescriptor[]): void {
	for (const tool of tools) {
		expect(Object.keys(tool).sort()).toEqual(["harness", "health", "kind", "name"]);
	}
}

describe("AN1 real-harness inherited tool discovery", () => {
	describe("codex", () => {
		requireHarness("codex");

		test("reads isolated MCP identity through cohesive discovery", async () => {
			const home = await temporaryDirectory("an1-codex-");
			await writeFile(
				join(home, "config.toml"),
				'[mcp_servers.an1-codex]\ncommand = "node"\nargs = ["index.js"]\n',
			);
			const result = await discoverLocalHarnesses({
				env: { ...process.env, CODEX_HOME: home },
			});
			const tools = result.codex.inheritedTools ?? [];
			expect(tools).toContainEqual({
				name: "an1-codex",
				kind: "mcp-server",
				harness: "codex",
				health: "unknown",
			});
			assertIdentityOnly(tools);
		});

		test("reports an honest none-state from an empty isolated home", async () => {
			const home = await temporaryDirectory("an1-codex-empty-");
			const tools = (
				await discoverLocalHarnesses({
					env: { ...process.env, CODEX_HOME: home },
				})
			).codex.inheritedTools;
			expect(tools).toEqual([]);
		});
	});

	describe("claude", () => {
		requireHarness("claude");

		test("reads isolated project MCP identity through cohesive discovery", async () => {
			const cwd = await temporaryDirectory("an1-claude-");
			await writeFile(
				join(cwd, ".mcp.json"),
				JSON.stringify({
					mcpServers: {
						"an1-claude": { command: "node", args: ["/tmp/not-present.js"], type: "stdio" },
					},
				}),
			);
			const tools = (await discoverLocalHarnesses({ cwd }))["claude-code"].inheritedTools;
			expect(tools).toContainEqual(
				expect.objectContaining({
					name: "an1-claude",
					health: expect.stringMatching(/^(needs-attention|unknown)$/),
				}),
			);
			assertIdentityOnly(tools ?? []);
		});
	});

	describe("opencode", () => {
		requireHarness("opencode");

		test("reads isolated JSONC MCP identity through cohesive discovery", async () => {
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
			const result = await discoverLocalHarnesses({
				env: { ...process.env, XDG_CONFIG_HOME: configHome },
			});
			const tools = result.opencode.inheritedTools ?? [];
			expect(tools).toContainEqual({
				name: "an1-opencode",
				kind: "mcp-server",
				harness: "opencode",
				health: "unknown",
			});
			assertIdentityOnly(tools);
		});

		test("reports honest none when config exists without MCP entries", async () => {
			const configHome = await temporaryDirectory("an1-opencode-empty-config-");
			const configDirectory = join(configHome, "opencode");
			await mkdir(configDirectory);
			await writeFile(join(configDirectory, "opencode.jsonc"), JSON.stringify({ theme: "system" }));
			const tools = (
				await discoverLocalHarnesses({
					env: { ...process.env, XDG_CONFIG_HOME: configHome },
				})
			).opencode.inheritedTools;
			expect(tools).toEqual([]);
		});

		test("reports honest none when config is absent", async () => {
			const configHome = await temporaryDirectory("an1-opencode-no-config-");
			const tools = (
				await discoverLocalHarnesses({
					env: { ...process.env, XDG_CONFIG_HOME: configHome },
				})
			).opencode.inheritedTools;
			expect(tools).toEqual([]);
		});
	});

	describe("environment", () => {
		// `gh` is the GitHub CLI, not a harness — Ruling 15. The binary is still required.
		requireBinary("gh");

		test("returns only identity fields from the real gh probe", async () => {
			const tools = (await discoverLocalHarnesses()).builtin.inheritedTools ?? [];
			assertIdentityOnly(tools);
			const github = tools.find(({ name }) => name === "github");
			if (github) {
				expect(github).toMatchObject({
					kind: "cli",
					harness: "environment",
					health: "working",
				});
			}
		});
	});
});
