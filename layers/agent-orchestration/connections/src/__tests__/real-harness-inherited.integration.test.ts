/**
 * `createInheritedReach` probes each harness family's own config/binary for
 * an inherited connection and returns identity-only views (service/via/
 * authSource/health/removable — never a secret, token, env, or command
 * value). The opencode probe only parses a config file so it needs no binary
 * gate; claude/codex exec the real binary and gate on it via `requireBinary`.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServiceConnectionView } from "@hyperidle/domain-model";
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

/**
 * AN1 hard-rule 4, re-pinned on the ServiceConnectionView shape.
 * list() projects facts into views — all fields are identity/display only,
 * no secret/token/env/command value may appear.
 *
 * @lore AU44 batch2: keys updated from [health,kind,name,source] to the
 * ServiceConnectionView shape [authSource,health,id,removable,service,via].
 */
function assertIdentityOnly(facts: readonly ServiceConnectionView[]): void {
	for (const fact of facts) {
		expect(Object.keys(fact).sort()).toEqual([
			"authSource",
			"health",
			"id",
			"removable",
			"service",
			"via",
		]);
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
			// @lore AU44 batch2: InheritedConnectionFact.health "unknown" maps to
			// ServiceConnectionView.health "working" (anything != "needs-attention").
			expect(facts).toContainEqual(
				expect.objectContaining({
					service: "an1-codex",
					authSource: "inherited",
					health: "working",
				}),
			);
			assertIdentityOnly(facts);
		});

		test("reports an honest none-state from an empty isolated home", async () => {
			const home = await temporaryDirectory("an1-codex-empty-");
			const reach = createInheritedReach();
			await reach.refresh({ env: { ...process.env, CODEX_HOME: home } });
			expect(reach.list().filter((fact) => fact.id.startsWith("inherited:codex:"))).toEqual([]);
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
			const facts = reach.list().filter((fact) => fact.id.startsWith("inherited:claude-code:"));
			expect(facts).toContainEqual(
				expect.objectContaining({
					service: "an1-claude",
					// "unknown" → "working"; "needs-attention" stays "needs-attention"
					health: expect.stringMatching(/^(needs-attention|working)$/),
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
			expect(facts).toContainEqual(
				expect.objectContaining({
					service: "an1-opencode",
					authSource: "inherited",
					health: "working",
				}),
			);
			assertIdentityOnly(facts);
		});

		test("reports honest none when config exists without MCP entries", async () => {
			const configHome = await temporaryDirectory("an1-opencode-empty-config-");
			const configDirectory = join(configHome, "opencode");
			await mkdir(configDirectory);
			await writeFile(join(configDirectory, "opencode.jsonc"), JSON.stringify({ theme: "system" }));
			const reach = createInheritedReach();
			await reach.refresh({ env: { ...process.env, XDG_CONFIG_HOME: configHome } });
			expect(reach.list().filter((fact) => fact.id.startsWith("inherited:opencode:"))).toEqual([]);
		});

		test("reports honest none when config is absent", async () => {
			const configHome = await temporaryDirectory("an1-opencode-no-config-");
			const reach = createInheritedReach();
			await reach.refresh({ env: { ...process.env, XDG_CONFIG_HOME: configHome } });
			expect(reach.list().filter((fact) => fact.id.startsWith("inherited:opencode:"))).toEqual([]);
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
			const github = facts.find(({ service }) => service === "github");
			if (github) {
				expect(github).toMatchObject({
					authSource: "inherited",
					health: "working",
				});
			}
		});
	});
});
