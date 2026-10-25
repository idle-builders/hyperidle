/**
 * Reach wiring end to end, through the REAL composed app and the REAL
 * probes reading real seeded files — no stubbed integration point.
 *
 * Connections are a user attribute, read through `open_user({}).
 * connections.inherited` and refreshed through `edit_user({ id: me,
 * redetectHarnesses: true })`, both self-only. The harness type an agent
 * runs on lives on `agent_run_config`, not `users`.
 *
 * Covers: `open_user({})` answerable from connections-domain state alone
 * (the boot wire test boots orchestration WITHOUT an adapter pool and still
 * sees the seeded inherited entries); switching an agent's harness type
 * A->B->A leaves `open_user({})`'s inherited reach byte-identical at every
 * step; the view JSON of inherited entries is exactly the connections
 * contract (id/service/via/authSource/health/removable/withheldFrom); `probeInheritedReach:
 * true` awaits the initial probe at boot, so facts are cached by serve time.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import { agentRunConfig, type HyperIdleDb, users } from "@hyperidle/db";
import { AdapterPool } from "@hyperidle/harness-registry";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";
import { disposeApp } from "../app.js";

const TEST_API_KEY = "test-key-reach-wiring";
const NOW = new Date().toISOString();

const HUMAN_ID = "u-reach-human";
const AGENT_ID = "u-reach-agent";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** `open_user({})` opens the one seeded human (the sole API-key actor) and returns its inherited reach. */
async function openInherited(app: {
	request: (path: string, init?: RequestInit) => Response | Promise<Response>;
}): Promise<Array<Record<string, unknown>>> {
	const res = await app.request("/api/actions/open_user", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({}),
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		ok: true;
		data: { connections: { inherited: Array<Record<string, unknown>> } | null };
	};
	return body.data.connections?.inherited ?? [];
}

/** The exact view contract an inherited fact projects to. */
function inheritedView(source: string, name: string): Record<string, unknown> {
	return {
		id: `inherited:${source}:${name}`,
		service: name,
		via: `${source} · ${name}`,
		authSource: "inherited",
		// probe health "unknown" displays as "working" — unchanged contract
		health: "working",
		removable: false,
		withheldFrom: [],
	};
}

async function seedHuman(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: HUMAN_ID,
		kind: "human",
		name: "Reach Human",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

async function seedAgentWithHarness(db: HyperIdleDb, harnessType: string): Promise<void> {
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Reach Agent",
		role: "builder",
		status: "idle",
		createdAt: NOW,
	});
	await db.insert(agentRunConfig).values({ agentUserId: AGENT_ID, harnessType });
}

async function switchAgentHarness(db: HyperIdleDb, harnessType: string): Promise<void> {
	await db
		.update(agentRunConfig)
		.set({ harnessType })
		.where(eq(agentRunConfig.agentUserId, AGENT_ID));
}

/** Seed a codex config.toml carrying one MCP server name (names only, as the probe reads). */
async function seedCodexHome(serverName: string): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "reach-codex-"));
	await writeFile(
		join(home, "config.toml"),
		`[mcp_servers.${serverName}]\ncommand = "node"\nargs = ["index.js"]\n`,
	);
	return home;
}

/** Seed an opencode.jsonc carrying one MCP server name under $XDG_CONFIG_HOME. */
async function seedOpenCodeHome(serverName: string): Promise<string> {
	const configHome = await mkdtemp(join(tmpdir(), "reach-opencode-"));
	const configDirectory = join(configHome, "opencode");
	await mkdir(configDirectory);
	await writeFile(
		join(configDirectory, "opencode.jsonc"),
		JSON.stringify({
			mcp: { [serverName]: { type: "remote", url: "http://localhost:19998/mcp" } },
		}),
	);
	return configHome;
}

/** Empty codex home — honest none-state until seeded. */
async function emptyCodexHome(): Promise<string> {
	return mkdtemp(join(tmpdir(), "reach-codex-empty-"));
}

/**
 * `edit_user({ redetectHarnesses: true })` only calls through when a
 * `HarnessCapabilityReader` is wired (`compose.ts` binds `deps.harnesses`
 * only when `adapterPool` is present) — the pool is NOT the thing under
 * test here; the reach wiring is.
 */
function makePool(): AdapterPool {
	const pool = new AdapterPool();
	return pool;
}

const temporaryDirectories: string[] = [];
const disposers: Array<() => void> = [];

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
});

afterEach(async () => {
	for (const dispose of disposers.splice(0)) dispose();
	vi.unstubAllEnvs();
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

function trackTemporaryDirectory(path: string): string {
	temporaryDirectories.push(path);
	return path;
}

describe("reach wiring end to end", () => {
	describe("boot wire — probeInheritedReach populates GET /api/connections", () => {
		test("seeded inherited entries appear with exact view JSON, no adapter pool in the boot", async ({
			db,
			eventBus,
		}) => {
			const codexHome = trackTemporaryDirectory(await seedCodexHome("reach-codex-boot"));
			const opencodeHome = trackTemporaryDirectory(await seedOpenCodeHome("reach-opencode-boot"));
			vi.stubEnv("CODEX_HOME", codexHome);
			vi.stubEnv("XDG_CONFIG_HOME", opencodeHome);

			// The boot carries NO adapter pool — reach must come from the
			// connections domain's own probe + cache, not the harness model.
			const boot = await bootAgentOrchestration({
				db,
				eventBus,
				probeInheritedReach: true,
			});
			disposers.push(() => boot.dispose());
			const app = await createTestApp({ db, eventBus, agentOrchestrationBoot: boot });
			disposers.push(() => disposeApp(app));

			await seedHuman(db);

			const inherited = await openInherited(app);

			// Exact view JSON, cached by serve time (boot awaited the probe).
			expect(inherited).toContainEqual(inheritedView("codex", "reach-codex-boot"));
			expect(inherited).toContainEqual(inheritedView("opencode", "reach-opencode-boot"));
		});
	});

	describe("redetect wire — edit_user({ redetectHarnesses: true }) refreshes inherited reach", () => {
		test("facts seeded after boot appear in GET after redetect", async ({ db, eventBus }) => {
			const codexHome = trackTemporaryDirectory(await emptyCodexHome());
			const opencodeHome = trackTemporaryDirectory(await seedOpenCodeHome("reach-opencode-stable"));
			vi.stubEnv("CODEX_HOME", codexHome);
			vi.stubEnv("XDG_CONFIG_HOME", opencodeHome);

			const boot = await bootAgentOrchestration({
				db,
				eventBus,
				probeInheritedReach: true,
			});
			disposers.push(() => boot.dispose());
			const app = await createTestApp({
				db,
				eventBus,
				agentOrchestrationBoot: boot,
				// mounts /api/harnesses (and its redetect endpoint)
				adapterPool: makePool(),
			});
			disposers.push(() => disposeApp(app));

			await seedHuman(db);

			// Boot saw the empty codex home — honest none-state first.
			const before = await openInherited(app);
			expect(before).not.toContainEqual(inheritedView("codex", "reach-redetect-codex"));

			// The user changes harness config, then hits Refresh (redetect).
			await writeFile(
				join(codexHome, "config.toml"),
				'[mcp_servers.reach-redetect-codex]\ncommand = "node"\nargs = ["index.js"]\n',
			);

			const redetect = await app.request("/api/actions/edit_user", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ id: HUMAN_ID, redetectHarnesses: true }),
			});
			expect(redetect.status).toBe(200);

			// The response returns after the probes completed — the read reflects the fact.
			const after = await openInherited(app);
			expect(after).toContainEqual(inheritedView("codex", "reach-redetect-codex"));
			// the stable opencode fact survived the refresh
			expect(after).toContainEqual(inheritedView("opencode", "reach-opencode-stable"));
		});
	});

	describe("harness switch A->B->A leaves reach identical", () => {
		test("GET /api/connections is byte-identical across the switch", async ({ db, eventBus }) => {
			const codexHome = trackTemporaryDirectory(await seedCodexHome("reach-switch-codex"));
			const opencodeHome = trackTemporaryDirectory(await seedOpenCodeHome("reach-switch-opencode"));
			vi.stubEnv("CODEX_HOME", codexHome);
			vi.stubEnv("XDG_CONFIG_HOME", opencodeHome);

			const boot = await bootAgentOrchestration({
				db,
				eventBus,
				probeInheritedReach: true,
			});
			disposers.push(() => boot.dispose());
			const app = await createTestApp({ db, eventBus, agentOrchestrationBoot: boot });
			disposers.push(() => disposeApp(app));

			await seedHuman(db);
			await seedAgentWithHarness(db, "claude-code");

			const first = await openInherited(app);

			// Non-vacuity: the response genuinely carries the seeded reach facts,
			// so byte-identity below cannot pass on two empty arrays.
			expect(first).toContainEqual(inheritedView("codex", "reach-switch-codex"));
			expect(first).toContainEqual(inheritedView("opencode", "reach-switch-opencode"));

			// A → B
			await switchAgentHarness(db, "codex");
			const second = await openInherited(app);

			// B → A
			await switchAgentHarness(db, "claude-code");
			const third = await openInherited(app);

			expect(second).toEqual(first);
			expect(third).toEqual(first);
		});
	});
});
