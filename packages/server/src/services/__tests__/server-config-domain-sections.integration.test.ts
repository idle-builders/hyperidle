/**
 * AU18 §5 — server_config schema extension round-trip tests.
 *
 * Proves each new top-level section (observability, gitExport, cost,
 * internal) and the extended notifications sub-sections (delivery,
 * mutedTypes, silence) read/write/merge correctly, including the deepened
 * notifications merge branch (a delivery-only patch must not clobber an
 * already-set silence section, and vice versa — plan §5's merge-hazard fix).
 */

import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import { readServerConfig, updateServerConfig } from "@hyperidle/core-app";

describe("server_config — observability section", () => {
	test("readServerConfig returns observability defaults when empty", async ({ db }) => {
		const config = await readServerConfig(db);
		expect(config.observability.enabled).toBe(true);
		expect(config.observability.adapter).toBe("console");
		expect(config.observability.batchSize).toBe(100);
		expect(config.observability.flushIntervalMs).toBe(2000);
		expect(config.observability.bufferCap).toBe(10_000);
	});

	test("updateServerConfig merges a partial observability patch without losing other keys", async ({
		db,
	}) => {
		await updateServerConfig(db, { observability: { batchSize: 50 } });
		const config = await readServerConfig(db);
		expect(config.observability.batchSize).toBe(50);
		expect(config.observability.adapter).toBe("console");
	});

	test("updateServerConfig can disable observability", async ({ db }) => {
		await updateServerConfig(db, { observability: { enabled: false } });
		const config = await readServerConfig(db);
		expect(config.observability.enabled).toBe(false);
	});
});

describe("server_config — gitExport section", () => {
	test("readServerConfig returns gitExport defaults when empty", async ({ db }) => {
		const config = await readServerConfig(db);
		expect(config.gitExport.enabled).toBe(false);
		expect(config.gitExport.branch).toBe("main");
		expect(config.gitExport.authorName).toBe("HyperIdle Export");
		expect(config.gitExport.authorEmail).toBe("export@hyperidle.local");
		expect(config.gitExport.debounceMs).toBe(2000);
		expect(config.gitExport.repoRoot).toEqual([]);
		expect(config.gitExport.lastCommitAt).toBeNull();
		expect(config.gitExport.lastCommitSha).toBeNull();
		expect(config.gitExport.lastPushAt).toBeNull();
	});

	test("updateServerConfig merges a partial gitExport patch, preserving stamps", async ({ db }) => {
		await updateServerConfig(db, { gitExport: { lastCommitAt: "2026-01-01T00:00:00.000Z" } });
		await updateServerConfig(db, { gitExport: { enabled: true, repoPath: "/tmp/repo" } });

		const config = await readServerConfig(db);
		expect(config.gitExport.enabled).toBe(true);
		expect(config.gitExport.repoPath).toBe("/tmp/repo");
		// stamp from the earlier patch must survive an unrelated later patch
		expect(config.gitExport.lastCommitAt).toBe("2026-01-01T00:00:00.000Z");
	});
});

describe("server_config — cost section", () => {
	test("readServerConfig returns cost.capMinor default 20000", async ({ db }) => {
		const config = await readServerConfig(db);
		expect(config.cost.capMinor).toBe(20000);
	});

	test("updateServerConfig can set cost.capMinor", async ({ db }) => {
		await updateServerConfig(db, { cost: { capMinor: 5000 } });
		const config = await readServerConfig(db);
		expect(config.cost.capMinor).toBe(5000);
	});
});

describe("server_config — internal section (cost sentinel dedup level)", () => {
	test("readServerConfig returns internal.costSentinelLastLevel null by default", async ({
		db,
	}) => {
		const config = await readServerConfig(db);
		expect(config.internal.costSentinelLastLevel).toBeNull();
	});

	test("updateServerConfig can persist costSentinelLastLevel across reads", async ({ db }) => {
		await updateServerConfig(db, { internal: { costSentinelLastLevel: "warning" } });
		const config = await readServerConfig(db);
		expect(config.internal.costSentinelLastLevel).toBe("warning");
	});
});

describe("server_config — notifications.delivery / mutedTypes / silence", () => {
	test("readServerConfig returns delivery defaults", async ({ db }) => {
		const config = await readServerConfig(db);
		expect(config.notifications.delivery.enabled).toBe(false);
		expect(config.notifications.delivery.primaryChannel).toBe("console");
		expect(config.notifications.delivery.ntfyBaseUrl).toBe("https://ntfy.sh");
		expect(config.notifications.delivery.smtpPort).toBe(587);
		expect(config.notifications.delivery.digestCron).toBe("0 8 * * *");
	});

	test("readServerConfig returns mutedTypes empty by default; updateServerConfig can set it", async ({
		db,
	}) => {
		expect((await readServerConfig(db)).notifications.mutedTypes).toEqual([]);
		await updateServerConfig(db, { notifications: { mutedTypes: ["review_alert"] } });
		expect((await readServerConfig(db)).notifications.mutedTypes).toEqual(["review_alert"]);
	});

	test("readServerConfig returns silence defaults", async ({ db }) => {
		const config = await readServerConfig(db);
		expect(config.notifications.silence.mode).toBe(false);
		expect(config.notifications.silence.silencedTeamIds).toEqual([]);
		expect(config.notifications.silence.windowStart).toBeNull();
		expect(config.notifications.silence.windowEnd).toBeNull();
	});

	test("a delivery-only patch does not clobber an already-set silence section (merge-hazard fix)", async ({
		db,
	}) => {
		await updateServerConfig(db, {
			notifications: { silence: { mode: true, silencedTeamIds: ["prod-1"] } },
		});
		await updateServerConfig(db, { notifications: { delivery: { enabled: true } } });

		const config = await readServerConfig(db);
		expect(config.notifications.delivery.enabled).toBe(true);
		// silence must survive the delivery-only patch
		expect(config.notifications.silence.mode).toBe(true);
		expect(config.notifications.silence.silencedTeamIds).toEqual(["prod-1"]);
	});

	test("a silence-only patch does not clobber an already-set delivery section", async ({ db }) => {
		await updateServerConfig(db, {
			notifications: { delivery: { smtpHost: "smtp.example.com" } },
		});
		await updateServerConfig(db, { notifications: { silence: { mode: true } } });

		const config = await readServerConfig(db);
		expect(config.notifications.silence.mode).toBe(true);
		expect(config.notifications.delivery.smtpHost).toBe("smtp.example.com");
	});

	test("existing top-level notification prefs (reviewAlerts, mutedTeams) still merge independently of delivery/silence", async ({
		db,
	}) => {
		await updateServerConfig(db, { notifications: { reviewAlerts: false } });
		await updateServerConfig(db, { notifications: { delivery: { enabled: true } } });

		const config = await readServerConfig(db);
		expect(config.notifications.reviewAlerts).toBe(false);
		expect(config.notifications.delivery.enabled).toBe(true);
	});
});
