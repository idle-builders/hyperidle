/**
 * Reach wiring end to end: the ONE service-lane evidence piece for
 * the inherited-reach relocation (architecture.md §7.2).
 *
 * Drives the REAL composed app through `createTestApp` (the production
 * composition shape) with the REAL probes reading real seeded files — no
 * stubbed integration point, no test-only production export.
 *
 * Covers: `open_user({})` answerable from connections-domain state alone
 * (the boot wire test boots orchestration WITHOUT an adapter pool and still
 * sees the seeded inherited entries); switching an agent's harness type
 * A->B->A leaves `open_user({})`'s inherited reach byte-identical at every
 * step (harness independence, exercised both); the view JSON of inherited
 * entries is exactly the connections contract (id/service/via/authSource/
 * health/removable); `probeInheritedReach: true` awaits the initial probe at
 * boot, so facts are cached by serve time.
 *
 * Wiring proven (each test catches a broken hook at a different point):
 *   boot wire    — bootAgentOrchestration(probeInheritedReach) → cache → route
 *   redetect wire — `edit_user({ redetectHarnesses: true })` → onHarnessRedetect → refresh
 *
 * @lore AU36: architecture.md §7.2's AC2 wording says "switch an agent's
 * `users.harnessType`" — that citation is stale (pre-AU26). The harness type
 * column lives on `agent_run_config` (framework/db/src/schema.ts, AU26 G1);
 * `users` carries identity only. This test switches the real column.
 *
 * @lore BC5 T11: `GET /api/connections` and `POST /api/harnesses/redetect`
 * are deleted with the `harnesses`/`connections` route families —
 * connections are a user attribute now, read through `open_user({}).
 * connections.inherited` and refreshed through `edit_user({ id: me,
 * redetectHarnesses: true })`, both self-only (architecture.md §8).
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

const TEST_API_KEY = "test-key-au36-reach-wiring";
const NOW = new Date().toISOString();

const HUMAN_ID = "u-au36-human";
const AGENT_ID = "u-au36-agent";

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
 * `edit_user({ redetectHarnesses: true })` only calls through when a
 * `HarnessCapabilityReader` is wired (`compose.ts` binds `deps.harnesses`
 * only when `adapterPool` is present). Same minimal static pool shape
 * AM4/AH2 used — the pool is NOT the thing under test here; the reach
 * wiring is.
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
			const codexHome = trackTemporaryDirectory(await seedCodexHome("au36-codex-reach"));
			const opencodeHome = trackTemporaryDirectory(await seedOpenCodeHome("au36-opencode-reach"));
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
			expect(inherited).toContainEqual(inheritedView("codex", "au36-codex-reach"));
			expect(inherited).toContainEqual(inheritedView("opencode", "au36-opencode-reach"));
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
			const before = await openInherited(app);
			expect(before).not.toContainEqual(inheritedView("codex", "au36-redetect-codex"));

			// The user changes harness config, then hits Refresh (redetect).
			await writeFile(
				join(codexHome, "config.toml"),
				'[mcp_servers.au36-redetect-codex]\ncommand = "node"\nargs = ["index.js"]\n',
			);

			const redetect = await app.request("/api/actions/edit_user", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ id: HUMAN_ID, redetectHarnesses: true }),
			});
			expect(redetect.status).toBe(200);

			// The response returns after the probes completed — the read reflects the fact.
			const after = await openInherited(app);
			expect(after).toContainEqual(inheritedView("codex", "au36-redetect-codex"));
			// the stable opencode fact survived the refresh
			expect(after).toContainEqual(inheritedView("opencode", "au36-opencode-stable"));
		});
	});

	describe("harness switch A->B->A leaves reach identical", () => {
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

			const first = await openInherited(app);

			// Non-vacuity: the response genuinely carries the seeded reach facts,
			// so byte-identity below cannot pass on two empty arrays.
			expect(first).toContainEqual(inheritedView("codex", "au36-switch-codex"));
			expect(first).toContainEqual(inheritedView("opencode", "au36-switch-opencode"));

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
