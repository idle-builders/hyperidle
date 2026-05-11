/**
 * Shared helpers for integration tests that spawn a real server subprocess
 * and communicate over HTTP/WebSocket.
 *
 * Extracted from node-server.integration.test.ts,
 * node-ws-e2e.integration.test.ts, and server-factory.integration.test.ts
 * to avoid duplication.
 */

import type { ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { createDb } from "@hyperidle/db";

/**
 * Migrate a SQLite database at `dbPath` using the bundled migration folder.
 * Does NOT insert any fixtures — callers add their own seed data.
 */
export async function createMigratedDb(dbPath: string): Promise<void> {
	const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
	const migrationsFolder = resolve(__dirname, "../../../db/drizzle");
	const db = createDb(dbPath);
	migrate(db, { migrationsFolder });
}

/**
 * Poll the server health endpoint until it responds 200 or the timeout
 * fires. Attaches to both stdout/stderr data events and a polling interval
 * so the wait is not purely timer-driven.
 */
export async function waitForReady(
	proc: ChildProcess,
	port: number,
	timeoutMs = 12000,
): Promise<void> {
	await new Promise<void>((resolveReady, rejectReady) => {
		const timer = setTimeout(
			() => rejectReady(new Error(`Server start timeout after ${timeoutMs}ms`)),
			timeoutMs,
		);
		let ready = false;

		const maybeReady = async (): Promise<void> => {
			if (ready) return;
			try {
				const res = await fetch(`http://localhost:${port}/api/health`);
				if (res.ok) {
					ready = true;
					clearTimeout(timer);
					resolveReady();
				}
			} catch {
				// not ready yet
			}
		};

		proc.stdout?.on("data", () => {
			void maybeReady();
		});
		proc.stderr?.on("data", () => {
			void maybeReady();
		});
		proc.on("error", (err) => {
			clearTimeout(timer);
			rejectReady(err);
		});

		const pollTimer = setInterval(() => {
			void maybeReady().then(() => {
				if (ready) clearInterval(pollTimer);
			});
		}, 250);
		proc.on("exit", () => clearInterval(pollTimer));
	});
}

/**
 * Build standard auth + content-type headers for integration test requests.
 */
export function authHeaders(
	apiKey: string,
	extra?: Record<string, string>,
): Record<string, string> {
	return { "X-API-Key": apiKey, "Content-Type": "application/json", ...extra };
}
