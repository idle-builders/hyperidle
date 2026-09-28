/**
 * Bind-address invariant for the embedded server.
 *
 * `createServer` is shared by two Applications with opposite exposure needs:
 *
 *   - `desktop` embeds it in the Electron shell. The desktop app must bind
 *     loopback only — a laptop on a café network must not be serving its
 *     owner's team data to the LAN.
 *   - `remote-server` is the hosted deployment. It runs behind an ingress in a
 *     container and MUST keep binding every interface, or nothing can reach it.
 *
 * So the bind address is a parameter, and this test pins both sides of it:
 * passing `hostname` binds exactly there, omitting it keeps the all-interfaces
 * default the hosted path depends on. `httpServer.address()` is the OS's own
 * report of what the socket is bound to — not a proxy for it.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, vi } from "vitest";
import { createServer, type ServerHandle } from "../create-server.js";

const ALL_INTERFACES = new Set(["::", "0.0.0.0"]);

function boundAddress(handle: ServerHandle): string {
	const addr = handle.httpServer.address();
	if (typeof addr !== "object" || addr === null) {
		throw new Error(`server is not listening on a TCP socket: ${String(addr)}`);
	}
	return addr.address;
}

describe("createServer bind address", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-bind-address");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "bind-address-invariant-secret-32!!");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	const deps = (db: HyperIdleDb, hostname?: string) => ({
		db,
		topology: "disabled" as const,
		sandboxBasePath: path.join(os.tmpdir(), "bind-address-invariant"),
		...(hostname === undefined ? {} : { hostname }),
	});

	test("binds exactly the requested hostname — the desktop's loopback guarantee", async ({
		db,
	}) => {
		const handle = await createServer(0, deps(db, "127.0.0.1"));
		try {
			expect(boundAddress(handle)).toBe("127.0.0.1");
		} finally {
			await handle.dispose();
		}
	}, 30_000);

	test("binds all interfaces when no hostname is given — the hosted default", async ({ db }) => {
		const handle = await createServer(0, deps(db));
		try {
			expect(ALL_INTERFACES).toContain(boundAddress(handle));
		} finally {
			await handle.dispose();
		}
	}, 30_000);
});
