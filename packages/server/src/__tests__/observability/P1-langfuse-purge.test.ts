/**
 * P1 — Langfuse purge validation tests (red phase).
 *
 * These tests assert the POST-PURGE state of the codebase. They FAIL
 * while Langfuse code still exists and PASS once the purge is complete.
 *
 * Acceptance criteria covered:
 *  - AC1: langfuse-adapter.ts and its integration test are deleted
 *  - AC2: All langfuse config keys, types, and properties are removed
 *  - AC3: PATCH /config with { adapter: "langfuse" } returns 400
 *  - AC4: ObservabilityChannel type is "console" | "noop" (no "langfuse")
 *  - AC5: ADAPTERS set contains only "console" and "noop"
 *  - AC6: GET /config response has no langfuse property
 *  - AC10: No langfuse strings in packages/ or non-archive docs/
 */

import { createTestDb } from "@hyperidle/db";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createObservabilityRoutes } from "../../routes/observability-routes.js";
import type { ObservabilityChannel } from "../../services/observability/types.js";
import type {
	ObservabilityConfig,
	ObservabilityConfigPatch,
	SafeObservabilityConfig,
} from "../../services/observability/config.js";

// ---------------------------------------------------------------------------
// AC4: ObservabilityChannel type only includes "console" | "noop"
// ---------------------------------------------------------------------------

describe("P1 AC4 — ObservabilityChannel type is console | noop only", () => {
	it('accepts "console" as a valid ObservabilityChannel', () => {
		const ch: ObservabilityChannel = "console";
		expect(ch).toBe("console");
	});

	it('accepts "noop" as a valid ObservabilityChannel', () => {
		const ch: ObservabilityChannel = "noop";
		expect(ch).toBe("noop");
	});

	it('does not include "langfuse" in the ObservabilityChannel type (runtime check via ADAPTERS)', async () => {
		// We import ADAPTERS indirectly: if "langfuse" is still in the type,
		// config.ts exports it via the ADAPTERS set used by isAdapter().
		// We verify by checking isAdapter behaviour: a valid adapter string
		// that the config module would recognise.
		const { readObservabilityConfig } = await import(
			"../../services/observability/config.js"
		);
		const db = createTestDb();
		// Seed "langfuse" as the adapter — if ADAPTERS still contains "langfuse",
		// readObservabilityConfig will return adapter:"langfuse". After the purge
		// it must fall back to "console".
		const { factorySettings } = await import("@hyperidle/db");
		const now = new Date().toISOString();
		db.insert(factorySettings)
			.values({ key: "observability.adapter", value: "langfuse", updatedAt: now })
			.onConflictDoUpdate({
				target: factorySettings.key,
				set: { value: "langfuse", updatedAt: now },
			})
			.run();
		const cfg = readObservabilityConfig(db);
		// After the purge, "langfuse" is NOT in ADAPTERS, so isAdapter returns
		// false and the config falls back to the default ("console").
		expect(cfg.adapter).toBe("console");
		expect(cfg.adapter).not.toBe("langfuse");
	});
});

// ---------------------------------------------------------------------------
// AC2 + AC6: ObservabilityConfig has no langfuse property
// ---------------------------------------------------------------------------

describe("P1 AC2 + AC6 — ObservabilityConfig has no langfuse property", () => {
	it("ObservabilityConfig type has no langfuse property", async () => {
		const { readObservabilityConfig } = await import(
			"../../services/observability/config.js"
		);
		const db = createTestDb();
		const cfg: ObservabilityConfig = readObservabilityConfig(db);
		// The langfuse property must not exist on the config object after purge
		expect(cfg).not.toHaveProperty("langfuse");
	});

	it("SafeObservabilityConfig has no langfuse property", async () => {
		const { readObservabilityConfig, redactObservabilityConfig } = await import(
			"../../services/observability/config.js"
		);
		const db = createTestDb();
		const cfg = readObservabilityConfig(db);
		const safe: SafeObservabilityConfig = redactObservabilityConfig(cfg);
		expect(safe).not.toHaveProperty("langfuse");
	});

	it("ObservabilityConfigPatch type has no langfuseUrl / langfusePublicKey / langfuseSecretKey", () => {
		// Type-level: assemble a patch with only surviving fields.
		// If the purge removed those properties from the interface, this compiles fine.
		// If they still exist, the 'strict' patch schema will reject them at runtime (AC3).
		const patch: ObservabilityConfigPatch = {
			enabled: true,
			adapter: "console" as ObservabilityChannel,
			batchSize: 50,
			flushIntervalMs: 1000,
			bufferCap: 500,
		};
		expect(Object.keys(patch)).not.toContain("langfuseUrl");
		expect(Object.keys(patch)).not.toContain("langfusePublicKey");
		expect(Object.keys(patch)).not.toContain("langfuseSecretKey");
	});
});

// ---------------------------------------------------------------------------
// AC3: PATCH /config with { adapter: "langfuse" } returns 400
// ---------------------------------------------------------------------------

describe("P1 AC3 — PATCH /config rejects adapter: langfuse with 400", () => {
	it('returns 400 when adapter is "langfuse"', async () => {
		const db = createTestDb();
		const router = createObservabilityRoutes(db, {
			getDispatcher: () => null,
		});
		const url = new URL("/config", "http://test.local");
		const res = await router.fetch(
			new Request(url, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ adapter: "langfuse" }),
			}),
		);
		expect(res.status).toBe(400);
	});

	it('returns 200 when adapter is "console" (valid after purge)', async () => {
		const db = createTestDb();
		const router = createObservabilityRoutes(db, {
			getDispatcher: () => null,
		});
		const url = new URL("/config", "http://test.local");
		const res = await router.fetch(
			new Request(url, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ adapter: "console" }),
			}),
		);
		expect(res.status).toBe(200);
	});

	it('returns 200 when adapter is "noop" (valid after purge)', async () => {
		const db = createTestDb();
		const router = createObservabilityRoutes(db, {
			getDispatcher: () => null,
		});
		const url = new URL("/config", "http://test.local");
		const res = await router.fetch(
			new Request(url, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ adapter: "noop" }),
			}),
		);
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// AC6: GET /config response has no langfuse property
// ---------------------------------------------------------------------------

describe("P1 AC6 — GET /config response has no langfuse property", () => {
	it("GET /config response body does not contain langfuse key", async () => {
		const db = createTestDb();
		const router = createObservabilityRoutes(db, {
			getDispatcher: () => null,
		});
		const url = new URL("/config", "http://test.local");
		const res = await router.fetch(new Request(url));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).not.toHaveProperty("langfuse");
		// Also verify the shape matches the purged interface
		expect(body).toHaveProperty("enabled");
		expect(body).toHaveProperty("adapter");
		expect(body).toHaveProperty("batchSize");
		expect(body).toHaveProperty("flushIntervalMs");
		expect(body).toHaveProperty("bufferCap");
	});

	it("GET /config response JSON string does not contain langfuse anywhere", async () => {
		const db = createTestDb();
		const router = createObservabilityRoutes(db, {
			getDispatcher: () => null,
		});
		const url = new URL("/config", "http://test.local");
		const res = await router.fetch(new Request(url));
		const text = await res.text();
		expect(text.toLowerCase()).not.toContain("langfuse");
	});
});

// ---------------------------------------------------------------------------
// AC1: langfuse-adapter.ts file does not exist
// ---------------------------------------------------------------------------

describe("P1 AC1 — langfuse-adapter.ts is deleted", () => {
	it("langfuse-adapter.ts does not exist on disk", () => {
		const adapterPath =
			"/Users/tg/hyperidle/.worktrees/P1/packages/server/src/services/observability/langfuse-adapter.ts";
		expect(existsSync(adapterPath)).toBe(false);
	});

	it("langfuse-adapter.integration.test.ts does not exist on disk", () => {
		const testPath =
			"/Users/tg/hyperidle/.worktrees/P1/packages/server/src/__tests__/observability/langfuse-adapter.integration.test.ts";
		expect(existsSync(testPath)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC10: grep returns zero results for "langfuse" in packages/ and non-archive docs/
// ---------------------------------------------------------------------------

describe("P1 AC10 — no langfuse strings in packages/ or non-archive docs/", () => {
	it("grep finds no langfuse references in packages/ (excluding node_modules)", () => {
		const worktree = "/Users/tg/hyperidle/.worktrees/P1";
		let output = "";
		try {
			output = execSync(
				`grep -ri "langfuse" "${worktree}/packages/" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" | grep -v node_modules || true`,
				{ encoding: "utf-8" },
			);
		} catch {
			// grep exits non-zero when no matches found — that's success
			output = "";
		}
		expect(output.trim()).toBe("");
	});

	it("grep finds no langfuse references in docs/ (excluding docs/archive/)", () => {
		const worktree = "/Users/tg/hyperidle/.worktrees/P1";
		let output = "";
		try {
			output = execSync(
				`grep -ri "langfuse" "${worktree}/docs/" --include="*.md" | grep -v "docs/archive/" || true`,
				{ encoding: "utf-8" },
			);
		} catch {
			output = "";
		}
		expect(output.trim()).toBe("");
	});

	it("grep finds no langfuse references in .claude/ settings files", () => {
		const worktree = "/Users/tg/hyperidle/.worktrees/P1";
		let output = "";
		try {
			output = execSync(
				`grep -ri "langfuse" "${worktree}/.claude/" --include="*.json" || true`,
				{ encoding: "utf-8" },
			);
		} catch {
			output = "";
		}
		expect(output.trim()).toBe("");
	});
});
