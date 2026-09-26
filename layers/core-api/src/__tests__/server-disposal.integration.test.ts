import type { HyperIdleDb } from "@hyperidle/db";
import { registerFixtureOrchestrationCleanup } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

// @lore shared-integration-workers: this suite mocks modules commonly loaded by
// earlier service files. Clear evaluated modules before Vitest resolves its hoisted
// mocks, then remove only this suite's registrations when it ends.
vi.hoisted(() => vi.resetModules());

const shutdown = vi.hoisted(() => {
	const state = {
		events: [] as string[],
		failures: new Set<string>(),
		nextOwnedDb: null as HyperIdleDb | null,
		recordDurableShutdown: null as null | (() => Promise<void>),
		verifyDurableShutdown: null as null | (() => Promise<void>),
		ownedDbSawDurableShutdown: false,
	};
	const phase = async (name: string): Promise<void> => {
		state.events.push(name);
		await Promise.resolve();
		if (state.failures.has(name)) throw new Error(`${name} failed`);
	};
	const phaseSync = (name: string): void => {
		state.events.push(name);
		if (state.failures.has(name)) throw new Error(`${name} failed`);
	};
	return { state, phase, phaseSync };
});

/**
 * `bootAgentOrchestration` starts the runtime internally and exposes its
 * disposer separately as `disposeRuntime`. Wrap the REAL
 * `bootAgentOrchestration` and override only `disposeRuntime`'s behavior —
 * everything else (the app, the session-stream socket, the lifecycle drain)
 * stays real.
 */
vi.mock("@hyperidle/agent-orchestration", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@hyperidle/agent-orchestration")>();
	return {
		...actual,
		bootAgentOrchestration: async (
			options: Parameters<typeof actual.bootAgentOrchestration>[0],
		) => {
			const boot = await actual.bootAgentOrchestration(options);
			registerFixtureOrchestrationCleanup(options.db, () => {
				boot.dispose();
				return boot.joinLifecycleDrain();
			});
			return {
				...boot,
				disposeRuntime: async () => {
					await boot.disposeRuntime?.();
					await shutdown.phase("run-runtime");
					await shutdown.state.recordDurableShutdown?.();
				},
			};
		},
	};
});

vi.mock("../app.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../app.js")>();
	return {
		...actual,
		disposeApp: (app: Parameters<typeof actual.disposeApp>[0]) => {
			actual.disposeApp(app);
			shutdown.phaseSync("app-domain");
		},
	};
});

vi.mock("../routes/ws.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../routes/ws.js")>();
	return {
		...actual,
		registerWsRoute: () => () => shutdown.phaseSync("websocket"),
	};
});

vi.mock("@hono/node-server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@hono/node-server")>();
	return {
		...actual,
		serve: () => ({
			close: (done?: (error?: Error) => void) => {
				void shutdown.phase("http").then(
					() => done?.(),
					(error: Error) => done?.(error),
				);
			},
			address: () => ({ address: "127.0.0.1", family: "IPv4", port: 0 }),
			// `createServer` awaits the socket being bound before it returns a
			// handle (binding is async whenever a hostname is given). This fake
			// stands in for an already-listening server, so it reports the state
			// a real one would — otherwise the fake, not the server, would decide
			// the disposal order these tests assert.
			listening: true,
		}),
	};
});

vi.mock("@hyperidle/db", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@hyperidle/db")>();
	return {
		...actual,
		createPgliteDb: async () => {
			if (!shutdown.state.nextOwnedDb) throw new Error("owned test database not supplied");
			return {
				db: shutdown.state.nextOwnedDb,
				close: async () => {
					await shutdown.state.verifyDurableShutdown?.();
					await shutdown.phase("owned-db");
				},
			};
		},
	};
});

afterAll(() => {
	vi.doUnmock("@hyperidle/agent-orchestration");
	vi.doUnmock("../app.js");
	vi.doUnmock("../routes/ws.js");
	vi.doUnmock("@hono/node-server");
	vi.doUnmock("@hyperidle/db");
	vi.resetModules();
});

import { createServer, type ServerHandle } from "@hyperidle/remote-server/create-server";

type AsyncServerHandle = Omit<ServerHandle, "dispose"> & {
	dispose(): Promise<void>;
};

const expectedPhases = ["run-runtime", "app-domain", "websocket", "http", "owned-db"] as const;

async function bootOwnedServer(db: HyperIdleDb): Promise<AsyncServerHandle> {
	shutdown.state.nextOwnedDb = db;
	return createServer(0, {
		topology: "disabled",
		sandboxBasePath: "/tmp/server-disposal",
	}) as Promise<AsyncServerHandle>;
}

describe("ordered asynchronous server disposal", () => {
	beforeEach(() => {
		shutdown.state.events.length = 0;
		shutdown.state.failures.clear();
		shutdown.state.nextOwnedDb = null;
		shutdown.state.recordDurableShutdown = null;
		shutdown.state.verifyDurableShutdown = null;
		shutdown.state.ownedDbSawDurableShutdown = false;
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-server-disposal");
	});

	afterEach(async () => {
		await new Promise<void>((resolve) => setImmediate(resolve));
		await new Promise<void>((resolve) => setImmediate(resolve));
		vi.unstubAllEnvs();
	});

	test("runs all six shutdown phases exactly once in the required order", async ({ db }) => {
		const server = await bootOwnedServer(db);

		await server.dispose();

		expect(shutdown.state.events).toEqual(expectedPhases);
	});

	test("returns one shared promise and does not repeat phases across concurrent disposal", async ({
		db,
	}) => {
		const server = await bootOwnedServer(db);

		const first = server.dispose();
		const second = server.dispose();

		expect(first).toBeInstanceOf(Promise);
		expect(second).toBe(first);
		await first;
		expect(shutdown.state.events).toEqual(expectedPhases);
	});

	test("continues after failures and rejects one ordered phase-tagged AggregateError", async ({
		db,
	}) => {
		const server = await bootOwnedServer(db);
		shutdown.state.failures.add("app-domain");
		shutdown.state.failures.add("http");

		const error = await Promise.resolve()
			.then(() => server.dispose())
			.catch((cause: unknown) => cause);

		expect(shutdown.state.events).toEqual(expectedPhases);
		expect(error).toBeInstanceOf(AggregateError);
		expect((error as AggregateError).errors).toEqual([
			{ phase: "app-domain", cause: expect.any(Error) },
			{ phase: "http", cause: expect.any(Error) },
		]);
	});

	test("never closes an injected database", async ({ db }) => {
		shutdown.state.events.length = 0;
		const server = (await createServer(0, {
			db,
			topology: "disabled",
			sandboxBasePath: "/tmp/server-disposal-injected",
		})) as AsyncServerHandle;

		await server.dispose();
		expect(shutdown.state.events).toEqual(expectedPhases.slice(0, -1));
		await expect(db.execute(sql`select 1`)).resolves.toBeDefined();
	});

	test("awaits the durable runtime shutdown write before closing its owned database", async ({
		db,
	}) => {
		await db.execute(sql`create temporary table shutdown_proof (value text not null)`);
		shutdown.state.recordDurableShutdown = async () => {
			await db.execute(sql`insert into shutdown_proof (value) values ('shutdown')`);
		};
		shutdown.state.verifyDurableShutdown = async () => {
			const result = (await db.execute(sql`select value from shutdown_proof`)) as {
				rows: Array<{ value: string }>;
			};
			shutdown.state.ownedDbSawDurableShutdown =
				JSON.stringify(result.rows) === JSON.stringify([{ value: "shutdown" }]);
		};
		const server = await bootOwnedServer(db);

		await server.dispose();

		expect(shutdown.state.ownedDbSawDurableShutdown).toBe(true);
	});
});
