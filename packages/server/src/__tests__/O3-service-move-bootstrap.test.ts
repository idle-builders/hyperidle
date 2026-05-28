/**
 * O3 — Service Move and Bootstrap: RED phase tests
 *
 * These tests define the acceptance criteria for workpackage O3.
 * They must FAIL before implementation and PASS after.
 *
 * ACs covered:
 *  AC-5: bootstrapFabric exists and returns disposers
 *  AC-6: AppOptions gains strategyBootstrap
 *  AC-7: app.ts replaces 7 hardwired register* calls with strategyBootstrap
 *  AC-8: Kernel-only boot (createApp without strategyBootstrap) boots and returns 200
 *  AC-9: Full boot with bootstrapFabric passes
 *  AC-1/AC-2: Moved service files exist at new fabric locations (structural)
 *  AC-3: Notifications subtree moved to fabric
 *  AC-4: Observability stays in server/src/services/
 *  No-reverse-dep: fabric never imports from @hyperidle/server
 *  AC-10: /api/knowledge/L3 not used in web
 *  AC-11: Frontend imports strategy types from @hyperidle/fabric not @hyperidle/shared
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createTestDb } from "@hyperidle/db";
import { bootstrapFabric } from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import type { AppOptions } from "../app.js";
import { createApp } from "../app.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

// __dirname = packages/server/src/__tests__
// 4 levels up = worktree root (packages/server/src/__tests__ -> packages/server/src -> packages/server -> packages -> .)
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const FABRIC_SERVICES = path.join(REPO_ROOT, "packages/fabric/src/services");
const SERVER_SERVICES = path.join(REPO_ROOT, "packages/server/src/services");
const WEB_SRC = path.join(REPO_ROOT, "packages/web/src");

// ── AC-5: bootstrapFabric exists and returns disposers ───────────────────────

describe("O3 AC-5: bootstrapFabric", () => {
	it("is exported from @hyperidle/fabric", () => {
		expect(typeof bootstrapFabric).toBe("function");
	});

	it("returns an array of disposer functions when called with db and eventBus", async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();
		const disposers = bootstrapFabric({ db: handle.db, eventBus });

		expect(Array.isArray(disposers)).toBe(true);
		expect(disposers.length).toBeGreaterThan(0);
		for (const d of disposers) {
			expect(typeof d).toBe("function");
		}

		// Cleanup: call disposers to unsubscribe event handlers
		for (const d of disposers) {
			d();
		}
	});

	it("returns exactly 7 disposers (one per disposer-registered service)", async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();
		const disposers = bootstrapFabric({ db: handle.db, eventBus });

		// 7 disposer-registered services:
		// session-review-creator, policy-engine, lifecycle-propagation,
		// builtin-routines, cost-cap-dedup-releaser, git-export-handler,
		// notification-dispatcher
		expect(disposers).toHaveLength(7);

		for (const d of disposers) {
			d();
		}
	});
});

// ── AC-6: AppOptions gains strategyBootstrap ─────────────────────────────────

describe("O3 AC-6: AppOptions.strategyBootstrap type field", () => {
	it("AppOptions accepts strategyBootstrap as a function", async () => {
		// TypeScript compile-time check: if AppOptions does not have strategyBootstrap
		// the @ts-expect-error above would not suppress an error (they'd show as
		// unexpected suppression). We verify at runtime via an actual createApp call.
		const handle = await createTestDb();
		const eventBus = new EventBus();

		// This must NOT throw a type error at compile time and must NOT throw at runtime.
		const options: AppOptions = {
			db: handle.db,
			eventBus,
			strategyBootstrap: ({ db: d, eventBus: eb }) => {
				// Stub bootstrap: return one disposer.
				void d;
				void eb;
				return [() => {}];
			},
		};
		expect(typeof options.strategyBootstrap).toBe("function");
	});

	it("AppOptions accepts strategyBootstrap: undefined (kernel-only mode)", () => {
		const options: AppOptions = {
			strategyBootstrap: undefined,
		};
		expect(options.strategyBootstrap).toBeUndefined();
	});
});

// ── AC-7: app.ts replaces 7 hardwired register* calls with strategyBootstrap ─

describe("O3 AC-7: app.ts no longer hardwires register* calls", () => {
	it("app.ts does not contain hardwired registerPolicyEngine call", () => {
		const appTs = fs.readFileSync(path.join(SERVER_SERVICES, "../app.ts"), "utf-8");
		expect(appTs).not.toMatch(/registerPolicyEngine\(/);
	});

	it("app.ts does not contain hardwired registerSessionReviewCreator call", () => {
		const appTs = fs.readFileSync(path.join(SERVER_SERVICES, "../app.ts"), "utf-8");
		expect(appTs).not.toMatch(/registerSessionReviewCreator\(/);
	});

	it("app.ts does not contain hardwired registerLifecyclePropagation call", () => {
		const appTs = fs.readFileSync(path.join(SERVER_SERVICES, "../app.ts"), "utf-8");
		expect(appTs).not.toMatch(/registerLifecyclePropagation\(/);
	});

	it("app.ts does not contain hardwired registerBuiltinRoutineHandlers call", () => {
		const appTs = fs.readFileSync(path.join(SERVER_SERVICES, "../app.ts"), "utf-8");
		expect(appTs).not.toMatch(/registerBuiltinRoutineHandlers\(/);
	});

	it("app.ts does not contain hardwired registerCostCapDedupReleaser call", () => {
		const appTs = fs.readFileSync(path.join(SERVER_SERVICES, "../app.ts"), "utf-8");
		expect(appTs).not.toMatch(/registerCostCapDedupReleaser\(/);
	});

	it("app.ts does not contain hardwired registerGitExportHandler call", () => {
		const appTs = fs.readFileSync(path.join(SERVER_SERVICES, "../app.ts"), "utf-8");
		expect(appTs).not.toMatch(/registerGitExportHandler\(/);
	});

	it("app.ts does not contain hardwired registerNotificationDispatcher call", () => {
		const appTs = fs.readFileSync(path.join(SERVER_SERVICES, "../app.ts"), "utf-8");
		expect(appTs).not.toMatch(/registerNotificationDispatcher\(/);
	});

	it("app.ts uses strategyBootstrap to invoke strategy wiring", () => {
		const appTs = fs.readFileSync(path.join(SERVER_SERVICES, "../app.ts"), "utf-8");
		expect(appTs).toMatch(/strategyBootstrap/);
	});
});

// ── AC-8: Kernel-only boot ───────────────────────────────────────────────────

describe("O3 AC-8: kernel-only boot (no strategyBootstrap)", () => {
	it("createApp() without any options boots without throwing", async () => {
		await expect(createApp()).resolves.not.toThrow();
	}, 15_000);

	it("createApp({ strategyBootstrap: undefined }) boots without throwing", async () => {
		await expect(createApp({ strategyBootstrap: undefined })).resolves.not.toThrow();
	}, 15_000);

	it("GET /api/health returns 200 in kernel-only mode", async () => {
		const app = await createApp({ strategyBootstrap: undefined });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 15_000);
});

// ── AC-9: Full boot with bootstrapFabric ─────────────────────────────────────

describe("O3 AC-9: full boot with bootstrapFabric", () => {
	it("createApp({ db, eventBus, strategyBootstrap: bootstrapFabric }) boots without throwing", async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();

		const app = await createApp({ db: handle.db, eventBus, strategyBootstrap: bootstrapFabric });

		// GET /api/health must work
		void app?.request("/api/health");
	}, 15_000);

	it("GET /api/health returns 200 with full strategy bootstrap", async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();
		const app = await createApp({ db: handle.db, eventBus, strategyBootstrap: bootstrapFabric });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 15_000);
});

// ── AC-1: Disposer services moved to fabric/src/services/ ────────────────────

describe("O3 AC-1: disposer-registered service files exist in fabric/src/services/", () => {
	const disposerServices = [
		"session-review-creator.ts",
		"policy-engine.ts",
		"lifecycle-propagation.ts",
		"builtin-routines.ts",
		"cost-cap.ts",
		"git-export.ts",
		"git-export-config.ts",
		"git-export-runner.ts",
	];

	for (const file of disposerServices) {
		it(`${file} exists in fabric/src/services/`, () => {
			expect(fs.existsSync(path.join(FABRIC_SERVICES, file))).toBe(true);
		});

		it(`${file} no longer exists in server/src/services/`, () => {
			expect(fs.existsSync(path.join(SERVER_SERVICES, file))).toBe(false);
		});
	}
});

// ── AC-2: Non-disposer services moved to fabric/src/services/ ────────────────

describe("O3 AC-2: non-disposer strategy service files exist in fabric/src/services/", () => {
	const strategyServices = [
		"founder-router.ts",
		"item-router.ts",
		"relevance-service.ts",
		"attention-service.ts",
		"review-item-factory.ts",
		"silence-policy.ts",
		"daily-digest.ts",
		"practice-meeting.ts",
		"routine-scheduler.ts",
	];

	for (const file of strategyServices) {
		it(`${file} exists in fabric/src/services/`, () => {
			expect(fs.existsSync(path.join(FABRIC_SERVICES, file))).toBe(true);
		});

		it(`${file} no longer exists in server/src/services/`, () => {
			expect(fs.existsSync(path.join(SERVER_SERVICES, file))).toBe(false);
		});
	}
});

// ── AC-3: Notifications subtree moved to fabric ───────────────────────────────

describe("O3 AC-3: notifications subtree moved to fabric/src/services/notifications/", () => {
	const notificationFiles = [
		"config.ts",
		"console-adapter.ts",
		"digest.ts",
		"dispatcher.ts",
		"ntfy-adapter.ts",
		"redact.ts",
		"smtp-adapter.ts",
		"types.ts",
	];

	for (const file of notificationFiles) {
		it(`notifications/${file} exists in fabric/src/services/notifications/`, () => {
			expect(fs.existsSync(path.join(FABRIC_SERVICES, "notifications", file))).toBe(true);
		});
	}

	it("server/src/services/notifications/ directory no longer exists", () => {
		expect(fs.existsSync(path.join(SERVER_SERVICES, "notifications"))).toBe(false);
	});
});

// ── AC-4: Observability stays in server/src/services/ ────────────────────────

describe("O3 AC-4: observability/ stays in server/src/services/", () => {
	const observabilityFiles = ["config.ts", "console-adapter.ts", "dispatcher.ts", "types.ts"];

	for (const file of observabilityFiles) {
		it(`observability/${file} still exists in server/src/services/observability/`, () => {
			expect(fs.existsSync(path.join(SERVER_SERVICES, "observability", file))).toBe(true);
		});
	}

	it("observability/ does NOT exist in fabric/src/services/", () => {
		expect(fs.existsSync(path.join(FABRIC_SERVICES, "observability"))).toBe(false);
	});
});

// ── No-reverse-dep: fabric never imports from @hyperidle/server ───────────────

describe("O3 No-reverse-dep: fabric does not import from @hyperidle/server", () => {
	it("grep for @hyperidle/server imports in fabric/src returns zero matches", () => {
		const fabricSrc = path.join(REPO_ROOT, "packages/fabric/src");
		// Recursively search all .ts files in fabric/src for @hyperidle/server
		const matches = findInFiles(fabricSrc, /@hyperidle\/server/);
		expect(matches).toHaveLength(0);
	});
});

// ── AC-10: Frontend no longer uses /api/knowledge/L3 ─────────────────────────

describe("O3 AC-10: frontend knowledge URL shape", () => {
	it("no file in packages/web/src uses /api/knowledge/L3", () => {
		const matches = findInFiles(WEB_SRC, /\/api\/knowledge\/L3/);
		expect(matches).toHaveLength(0);
	});
});

// ── AC-11: Frontend imports strategy types from @hyperidle/fabric not @hyperidle/shared ──

describe("O3 AC-11: frontend strategy type imports use @hyperidle/fabric", () => {
	const strategyTypePatterns = [
		/KnowledgeScope/,
		/KnowledgeLayer/,
		/KNOWLEDGE_LAYERS/,
		/KnowledgeKind/,
		/KnowledgeStatus/,
		/KNOWLEDGE_STATUSES/,
		/KnowledgeSortOption/,
		/KNOWLEDGE_SORT_OPTIONS/,
		/KnowledgeTopicHealth/,
	];

	for (const pattern of strategyTypePatterns) {
		it(`no web/src file imports ${pattern.source} from @hyperidle/shared`, () => {
			// Find any file that has both the pattern AND "@hyperidle/shared" on the same import line
			const matches = findInFiles(WEB_SRC, /@hyperidle\/shared/, (content) => {
				// Check if this file imports the strategy type from @hyperidle/shared
				// (not just any use of @hyperidle/shared for unrelated things)
				const lines = content.split("\n");
				return lines.some(
					(line) =>
						line.includes("@hyperidle/shared") &&
						pattern.test(line) &&
						(line.trim().startsWith("import") || line.includes("from")),
				);
			});
			expect(matches).toHaveLength(0);
		});
	}
});

// ── Helper: recursive grep in files ──────────────────────────────────────────

type FilePredicate = (content: string) => boolean;

/** Collect all .ts/.tsx files under `dir` (skipping node_modules). */
function collectSourceFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	const collected: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory() && entry.name !== "node_modules") {
			collected.push(...collectSourceFiles(fullPath));
		} else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
			collected.push(fullPath);
		}
	}
	return collected;
}

/**
 * Return paths of source files in `dir` matching `pattern` (or custom predicate).
 * Directories named `node_modules` are skipped.
 */
function findInFiles(dir: string, pattern: RegExp, predicate?: FilePredicate): string[] {
	const files = collectSourceFiles(dir);
	const matches: string[] = [];
	for (const filePath of files) {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			const matched = predicate ? predicate(content) : pattern.test(content);
			if (matched) matches.push(filePath);
		} catch {
			// Ignore unreadable files
		}
	}
	return matches;
}
