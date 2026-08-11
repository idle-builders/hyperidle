/**
 * AU36 RED — inherited-reach cache/runner unit tests (architecture.md §7.1:
 * "New cache/runner tests: fixed source order (D6), atomic swap on refresh,
 * empty initial list()").
 *
 * Drives `createInheritedReach` (D1) through its injected-run/env/cwd seam —
 * the same seam shape the probes carry today (`HarnessProbeDeps` minus
 * `fetchModels`) — so no real binary runs here; real-binary evidence lives in
 * the harness lane (AN1-real-harness-inherited.integration.test.ts).
 *
 * AC coverage:
 *   AC1 — reach is answerable on its own: cache builds, lists, refreshes
 *         without any harness registry involvement
 *   AC3 — display order stays today's order: fixed source order
 *         [claude-code, environment, codex, opencode] (D6)
 *   AC4 — facts carry identity only (asserted on the produced snapshot)
 *
 * FAILS until layers/agent-orchestration/connections/src/inherited-reach.ts
 * exists and the package exports createInheritedReach (D1/D8).
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInheritedReach } from "../inherited-reach.js";

/** The D1 seam: injected runner, same contract as today's probe deps. */
type ProbeRun = (
	args: readonly string[],
	context?: {
		readonly cwd: string;
		readonly env: NodeJS.ProcessEnv;
		readonly signal: AbortSignal;
	},
) => Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }>;

const FAILED: { stdout: string; stderr: string; exitCode: number } = {
	stdout: "",
	stderr: "stubbed",
	exitCode: 1,
};

/** gh logged in on github.com; every other binary fails (config-file paths only). */
const ghLoggedInRun: ProbeRun = async (args) => {
	if (args[0] === "gh") {
		return {
			stdout: JSON.stringify({ "github.com": { users: { "au36-user": {} } } }),
			stderr: "",
			exitCode: 0,
		};
	}
	return FAILED;
};

/** No binary succeeds at all. */
const nothingRun: ProbeRun = async () => FAILED;

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

/** Seed all four sources with one fact each. */
async function seedAllSources(): Promise<{ cwd: string; env: NodeJS.ProcessEnv }> {
	const cwd = await temporaryDirectory("au36-reach-claude-");
	await writeFile(
		join(cwd, ".mcp.json"),
		JSON.stringify({
			mcpServers: { "au36-claude": { command: "node", args: ["index.js"] } },
		}),
	);

	const codexHome = await temporaryDirectory("au36-reach-codex-");
	await writeFile(
		join(codexHome, "config.toml"),
		'[mcp_servers.au36-codex]\ncommand = "node"\nargs = ["index.js"]\n',
	);

	const configHome = await temporaryDirectory("au36-reach-opencode-");
	const opencodeDirectory = join(configHome, "opencode");
	await mkdir(opencodeDirectory);
	await writeFile(
		join(opencodeDirectory, "opencode.jsonc"),
		JSON.stringify({
			mcp: { "au36-opencode": { type: "remote", url: "http://localhost:19998/mcp" } },
		}),
	);

	return {
		cwd,
		env: { CODEX_HOME: codexHome, XDG_CONFIG_HOME: configHome },
	};
}

describe("createInheritedReach", () => {
	it("list() is empty (and frozen) before any refresh", () => {
		const reach = createInheritedReach();
		expect(reach.list()).toEqual([]);
		expect(Object.isFrozen(reach.list())).toBe(true);
	});

	it("refresh assembles facts in the fixed source order [claude-code, environment, codex, opencode] (D6)", async () => {
		const { cwd, env } = await seedAllSources();
		const reach = createInheritedReach();

		await reach.refresh({ run: ghLoggedInRun, env, cwd });

		expect(reach.list()).toEqual([
			{ name: "au36-claude", kind: "mcp-server", source: "claude-code", health: "unknown" },
			{ name: "github", kind: "cli", source: "environment", health: "working" },
			{ name: "au36-codex", kind: "mcp-server", source: "codex", health: "unknown" },
			{ name: "au36-opencode", kind: "mcp-server", source: "opencode", health: "unknown" },
		]);
	});

	it("produced facts are identity-only — no secret/token/env/command property (AN1 hard-rule 4)", async () => {
		const { cwd, env } = await seedAllSources();
		const reach = createInheritedReach();

		await reach.refresh({ run: ghLoggedInRun, env, cwd });

		for (const fact of reach.list()) {
			expect(Object.keys(fact).sort()).toEqual(["health", "kind", "name", "source"]);
		}
	});

	it("refresh atomically swaps the snapshot — a later refresh replaces the earlier facts", async () => {
		const { cwd, env } = await seedAllSources();
		const reach = createInheritedReach();

		await reach.refresh({ run: ghLoggedInRun, env, cwd });
		expect(reach.list().length).toBe(4);

		// Second refresh against an empty world: no gh login, no seeded configs.
		const emptyCwd = await temporaryDirectory("au36-reach-empty-");
		const emptyCodexHome = await temporaryDirectory("au36-reach-codex-empty-");
		const emptyConfigHome = await temporaryDirectory("au36-reach-opencode-empty-");
		await reach.refresh({
			run: nothingRun,
			env: { CODEX_HOME: emptyCodexHome, XDG_CONFIG_HOME: emptyConfigHome },
			cwd: emptyCwd,
		});

		expect(reach.list()).toEqual([]);
		expect(Object.isFrozen(reach.list())).toBe(true);
	});

	it("refresh never rejects — every probe error degrades to [] (unchanged failure behavior)", async () => {
		const reach = createInheritedReach();
		const throwingRun: ProbeRun = async () => {
			throw new Error("probe exploded");
		};

		const emptyCwd = await temporaryDirectory("au36-reach-throwing-");
		await expect(
			reach.refresh({
				run: throwingRun,
				env: { CODEX_HOME: emptyCwd, XDG_CONFIG_HOME: emptyCwd },
				cwd: emptyCwd,
			}),
		).resolves.toBeUndefined();

		expect(reach.list()).toEqual([]);
	});
});
