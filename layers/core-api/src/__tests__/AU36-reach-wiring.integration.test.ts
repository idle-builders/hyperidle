/**
 * AU36 RED — reach wiring end to end: the ONE service-lane evidence piece for
 * the inherited-reach relocation (architecture.md §7.2).
 *
 * Drives the REAL composed app through `createTestApp` (the production
 * composition shape) with the REAL probes reading real seeded files — no
 * stubbed integration point, no test-only production export.
 *
 * AC coverage:
 *   AC1 — GET /api/connections is answerable from connections-domain state
 *         alone: the boot wire test boots orchestration WITHOUT an adapter
 *         pool and still sees the seeded inherited entries.
 *   AC2 — switching an agent's harness type A→B→A leaves GET /api/connections
 *         byte-identical at every step (harness independence, exercised both).
 *   AC3 — the view JSON of inherited entries is exactly the AN1 contract
 *         (id/service/via/authSource/health/removable).
 *   AC5 (boot moment) — `probeInheritedReach: true` awaits the initial probe,
 *         so facts are cached by serve time.
 *
 * Wiring proven (each test catches a broken hook at a different point):
 *   boot wire    — bootAgentOrchestration(probeInheritedReach) → cache → route
 *   redetect wire — POST /api/harnesses/redetect → onHarnessRedetect → refresh
 *
 * @lore AU36: architecture.md §7.2's AC2 wording says "switch an agent's
 * `users.harnessType`" — that citation is stale (pre-AU26). The harness type
 * column lives on `agent_run_config` (framework/db/src/schema.ts, AU26 G1);
 * `users` carries identity only. This test switches the real column.
 *
 * FAILS until:
 *   - `@hyperidle/connections` exports `createInheritedReach` (D1)
 *   - `bootAgentOrchestration` gains `probeInheritedReach`, builds the cache,
 *     and exposes `inheritedReach` (D4)
 *   - `createConnectionRoutes` reads the reach cache instead of descriptors (D7)
 *   - `createTestApp`/core-api wire `onHarnessRedetect` into redetect (D5)
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import { agentRunConfig, type HyperIdleDb, users } from "@hyperidle/db";
import { AdapterPool, BuiltinHarnessAdapter } from "@hyperidle/harness-registry";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";
import { disposeApp } from "../app.js";

const TEST_API_KEY = "test-key-au36-reach-wiring";
const NOW = new Date().toISOString();

const HUMAN_ID = "u-au36-human";
const AGENT_ID = "u-au36-agent";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** The exact AN1 view contract an inherited fact projects to (architecture §2). */
function inheritedView(source: string, name: string): Record<string, unknown> {
	return {
		id: `inherited:${source}:${name}`,
		service: name,
		via: `${source} · ${name}`,
		authSource: "inherited",
		// probe health "unknown" displays as "working" — unchanged contract
		health: "working",
		removable: false,
	};
}

async function seedHuman(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: HUMAN_ID,
		kind: "human",
		name: "AU36 Human",
		email: "au36-human@hyperidle.test",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

async function seedAgentWithHarness(db: HyperIdleDb, harnessType: string): Promise<void> {
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "AU36 Agent",
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
	const home = await mkdtemp(join(tmpdir(), "au36-codex-"));
	await writeFile(
		join(home, "config.toml"),
		`[mcp_servers.${serverName}]\ncommand = "node"\nargs = ["index.js"]\n`,
	);
	return home;
}

/** Seed an opencode.jsonc carrying one MCP server name under $XDG_CONFIG_HOME. */
async function seedOpenCodeHome(serverName: string): Promise<string> {
	const configHome = await mkdtemp(join(tmpdir(), "au36-opencode-"));
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
	return mkdtemp(join(tmpdir(), "au36-codex-empty-"));
}

/**
 * The harness routes need a `HarnessCapabilityReader` to mount at all
 * (core-api app.ts mounts /api/harnesses only when `adapterPool` is present).
 * Same minimal static pool shape AM4/AH2 use — the pool is NOT the thing
 * under test here; the reach wiring is.
 */
function makePool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", new BuiltinHarnessAdapter(), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
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

describe("AU36 — reach wiring end to end", () => {
	describe("boot wire — probeInheritedReach populates GET /api/connections", () => {
		test("seeded inherited entries appear with exact view JSON, no adapter pool in the boot", async ({
			db,
			eventBus,
		}) => {
			const codexHome = trackTemporaryDirectory(await seedCodexHome("au36-codex-reach"));
			const opencodeHome = trackTemporaryDirectory(await seedOpenCodeHome("au36-opencode-reach"));
			vi.stubEnv("CODEX_HOME", codexHome);
			vi.stubEnv("XDG_CONFIG_HOME", opencodeHome);

			// AC1: the boot carries NO adapter pool — reach must come from the
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

			const res = await app.request("/api/connections", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<Record<string, unknown>>;

			// AC3/AC5: exact view JSON, cached by serve time (boot awaited the probe).
			expect(body).toContainEqual(inheritedView("codex", "au36-codex-reach"));
			expect(body).toContainEqual(inheritedView("opencode", "au36-opencode-reach"));
		});
	});

	describe("redetect wire — POST /api/harnesses/redetect refreshes inherited reach", () => {
		test("facts seeded after boot appear in GET after redetect", async ({ db, eventBus }) => {
			const codexHome = trackTemporaryDirectory(await emptyCodexHome());
			const opencodeHome = trackTemporaryDirectory(await seedOpenCodeHome("au36-opencode-stable"));
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
			const before = await app.request("/api/connections", { headers: authHeaders() });
			expect(before.status).toBe(200);
			expect(await before.text()).not.toContain("au36-redetect-codex");

			// The user changes harness config, then hits Refresh (redetect).
			await writeFile(
				join(codexHome, "config.toml"),
				'[mcp_servers.au36-redetect-codex]\ncommand = "node"\nargs = ["index.js"]\n',
			);

			const redetect = await app.request("/api/harnesses/redetect", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(redetect.status).toBe(200);

			// The response returns after the probes completed — GET reflects the fact.
			const after = await app.request("/api/connections", { headers: authHeaders() });
			expect(after.status).toBe(200);
			const body = (await after.json()) as Array<Record<string, unknown>>;
			expect(body).toContainEqual(inheritedView("codex", "au36-redetect-codex"));
			// the stable opencode fact survived the refresh
			expect(body).toContainEqual(inheritedView("opencode", "au36-opencode-stable"));
		});
	});

	describe("AC2 — harness switch A→B→A leaves reach identical", () => {
		test("GET /api/connections is byte-identical across the switch", async ({ db, eventBus }) => {
			const codexHome = trackTemporaryDirectory(await seedCodexHome("au36-switch-codex"));
			const opencodeHome = trackTemporaryDirectory(await seedOpenCodeHome("au36-switch-opencode"));
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

			const firstRes = await app.request("/api/connections", { headers: authHeaders() });
			expect(firstRes.status).toBe(200);
			const firstBody = await firstRes.text();

			// Non-vacuity: the response genuinely carries the seeded reach facts,
			// so byte-identity below cannot pass on two empty arrays.
			expect(firstBody).toContain("inherited:codex:au36-switch-codex");
			expect(firstBody).toContain("inherited:opencode:au36-switch-opencode");

			// A → B
			await switchAgentHarness(db, "codex");
			const secondRes = await app.request("/api/connections", { headers: authHeaders() });
			expect(secondRes.status).toBe(200);
			const secondBody = await secondRes.text();

			// B → A
			await switchAgentHarness(db, "claude-code");
			const thirdRes = await app.request("/api/connections", { headers: authHeaders() });
			expect(thirdRes.status).toBe(200);
			const thirdBody = await thirdRes.text();

			expect(secondBody).toBe(firstBody);
			expect(thirdBody).toBe(firstBody);
		});
	});
});
