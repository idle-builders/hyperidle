/**
 * AF7 §2 / AC2 — Non-blocking session provision (RED phase).
 *
 * Acceptance criterion (TRACK-AF.md AF7 AC2):
 *   "Requesting a session returns promptly; the caller is not blocked for the
 *    full duration of the agent's work."
 *
 * Root cause being closed (Z8-047): `POST /api/sessions` awaits
 * `provisionSession` to full completion (the entire `for await streamEvents`
 * loop) and returns 200 with the completed row. The caller blocks for the whole
 * agent run.
 *
 * Plan §2 contract:
 *   - POST returns **202 Accepted** with the freshly-admitted ACTIVE session row
 *     (state="active", no outcome) BEFORE the harness run completes.
 *   - Admission failures still map on the POST path, NOT the detached tail:
 *       cost-cap → 422 + no row (P2 pre-insert)
 *       concurrency → 429 + no row (P3 pre-insert)
 *       missing credential in local mode (builtin, resolvedModel absent) →
 *         500 + code=MISSING_CREDENTIAL + no row + harness never started
 *         (WARNING-2: synchronous resolvedModel presence guard before P5 insert).
 *
 * RED expectation:
 *   - The 202 test fails because POST currently awaits the full run and returns
 *     200 — and because it returns ONLY after the harness deferred settles
 *     (blocking), so the "returns before harness settles" assertion fails.
 *   - The WARNING-2 test fails because in local mode (no credentialResolver) the
 *     missing-resolvedModel failure surfaces from the detached/awaited harness as
 *     a crashed session, not as a pre-insert 500 with no row.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { clearDeduplicationCache, fabricStrategy } from "@hyperidle/fabric";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-af7-nonblock";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** A deferred promise handle. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

/**
 * Slow harness: streamEvents blocks on an external deferred until it is settled.
 * Lets the test assert the POST returns BEFORE the run completes.
 */
class SlowHarnessAdapter implements HarnessAdapter {
	public startedConfigs: SessionConfig[] = [];

	constructor(private readonly gate: Promise<void>) {}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.startedConfigs.push(config);
		return { sessionId: "af7-slow-1" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// Block until the test settles the gate — simulates a long agent run.
		await this.gate;
		yield { type: "completion", text: "done" };
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic"],
			mcpSupport: false,
		};
	}
}

/** Builtin-typed adapter that throws on start when resolvedModel absent. */
class BuiltinLikeAdapter implements HarnessAdapter {
	public startedConfigs: SessionConfig[] = [];

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.startedConfigs.push(config);
		if (!config.resolvedModel) {
			throw new Error("BuiltinHarnessAdapter: resolvedModel is required in SessionConfig");
		}
		return { sessionId: "af7-builtin-1" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			mcpSupport: false,
		};
	}
}

function makePool(adapter: HarnessAdapter, type?: string): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local", adapter, {
		name: "local",
		kind: "local",
		...(type ? { type } : {}),
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	return pool;
}

const NOW = "2026-06-11T00:00:00.000Z";

async function seedDomain(
	db: HyperIdleDb,
	overrides: { costCap?: number | null; maxConcurrentSessions?: number; harnessType?: string } = {},
): Promise<void> {
	await db.insert(teams).values({ id: "p1", name: "AF7", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "AF7 bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-af7",
		name: "AF7 Agent",
		role: "builder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: overrides.maxConcurrentSessions ?? 1,
		costCap: overrides.costCap === undefined ? null : overrides.costCap,
		costActual: 0,
		...(overrides.harnessType ? { harnessType: overrides.harnessType } : {}),
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-af7",
		betId: "b1",
		teamId: "p1",
		title: "AF7 task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("AF7 AC2: POST /api/sessions is non-blocking (202 + active row)", () => {
	let tmpDir: string;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "af7-nonblock-"));
		clearDeduplicationCache();
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("returns 202 with an ACTIVE session row BEFORE the harness run completes", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);

		const gate = deferred();
		const harness = new SlowHarnessAdapter(gate.promise);
		const validResolver: CredentialResolver = { resolve: async () => "fake-api-key" };

		const app = await createTestApp({
			db,
			eventBus,
			adapterPool: makePool(harness),
			workspaceAdapter: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			credentialResolver: validResolver,
		});

		// The harness gate is NOT settled yet. If POST is non-blocking (§2) it must
		// resolve with 202 BEFORE the gate is settled. If it BLOCKS for the full
		// run (today's behaviour, Z8-047) the POST never resolves while the gate is
		// open — so we race it against a short deadline. `gateSettled` records
		// whether the run finished before the POST returned.
		let gateSettled = false;
		const postPromise = Promise.resolve(
			app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ agentId: "agent-af7", taskId: "task-af7", modelTier: "workhorse" }),
			}),
		).then((r) => ({ kind: "post" as const, res: r }));

		const deadline = new Promise<{ kind: "timeout" }>((resolve) =>
			setTimeout(() => resolve({ kind: "timeout" }), 2000),
		);

		const raced = await Promise.race([postPromise, deadline]);

		// §2: the POST must win the race (resolve) while the run is still gated.
		// RED today: the POST is blocked on the full run, so `deadline` wins.
		expect(raced.kind).toBe("post");
		expect(gateSettled).toBe(false);

		if (raced.kind === "post") {
			expect(raced.res.status).toBe(202);
			const body = (await raced.res.json()) as Record<string, unknown>;
			expect(body.state).toBe("active");
			expect(body.outcome).toBeFalsy();
			expect(harness.startedConfigs.length).toBe(1);

			// Settle the gate — the detached tail completes the session.
			gateSettled = true;
			gate.resolve();
			await vi.waitFor(
				async () => {
					const [row] = await db
						.select()
						.from(sessions)
						.where(eq(sessions.id, body.id as string));
					expect(row?.state).toBe("done");
				},
				{ timeout: 10_000 },
			);
		} else {
			// Unblock the hung provision so the test process can exit cleanly.
			gateSettled = true;
			gate.resolve();
			await postPromise.catch(() => undefined);
		}
	});

	test("cost-cap exceeded → 422 + NO session row (admission stays on the POST path)", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db, { costCap: 0 });

		const gate = deferred();
		const harness = new SlowHarnessAdapter(gate.promise);
		const validResolver: CredentialResolver = { resolve: async () => "fake-api-key" };

		const app = await createTestApp({
			db,
			eventBus,
			adapterPool: makePool(harness),
			workspaceAdapter: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			credentialResolver: validResolver,
		});

		const res = await app.request("/api/sessions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ agentId: "agent-af7", taskId: "task-af7", modelTier: "workhorse" }),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("COST_CAP_EXCEEDED");
		const rows = await db.select().from(sessions);
		expect(rows).toHaveLength(0);
	});

	test("concurrency limit → 429 + NO session row", async ({ db, eventBus }) => {
		await seedDomain(db, { maxConcurrentSessions: 0 });

		const gate = deferred();
		const harness = new SlowHarnessAdapter(gate.promise);
		const validResolver: CredentialResolver = { resolve: async () => "fake-api-key" };

		const app = await createTestApp({
			db,
			eventBus,
			adapterPool: makePool(harness),
			workspaceAdapter: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			credentialResolver: validResolver,
		});

		const res = await app.request("/api/sessions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ agentId: "agent-af7", taskId: "task-af7", modelTier: "workhorse" }),
		});

		expect(res.status).toBe(429);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("CONCURRENCY_LIMIT");
		const rows = await db.select().from(sessions);
		expect(rows).toHaveLength(0);
	});

	test("WARNING-2: local mode (no credentialResolver) + builtin + resolvedModel absent → 500 MISSING_CREDENTIAL, no row, harness never started", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db, { harnessType: "builtin" });

		const harness = new BuiltinLikeAdapter();

		// NO credentialResolver → local mode. resolvedModel stays undefined.
		// Plan §2 (option a): a synchronous resolvedModel-presence guard in the
		// admit prefix (before the P5 row insert) must throw MissingCredentialError
		// so the route maps it to 500 — NOT a later crashed session from the tail.
		const app = await createTestApp({
			db,
			eventBus,
			adapterPool: makePool(harness, "builtin"),
			workspaceAdapter: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
		});

		const res = await app.request("/api/sessions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ agentId: "agent-af7", taskId: "task-af7", modelTier: "workhorse" }),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("MISSING_CREDENTIAL");

		// No doomed row inserted (pre-P5 guard).
		const rows = await db.select().from(sessions);
		expect(rows).toHaveLength(0);

		// Harness never started — the guard fires before P9.
		expect(harness.startedConfigs).toHaveLength(0);
	});
});
