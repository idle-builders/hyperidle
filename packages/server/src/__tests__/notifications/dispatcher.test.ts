import type { Notification, NotificationAdapter, Recipient, SendResult } from "@hyperidle/core-app";
import {
	dispatchDigest,
	enqueueNotification,
	findNotificationById,
	flushQueue,
	insertNotification,
	listAll,
	loadNotificationConfig,
	type NotificationConfigPatch,
	recoverStuckLeases,
	registerNotificationDispatcher,
	tryFloodReserve,
	updateNotificationConfig,
	updateServerConfig,
} from "@hyperidle/core-app";
import {
	createTestDb,
	type HyperIdleDb,
	items as itemsTable,
	type TestDbHandle,
	threads,
} from "@hyperidle/db";
import {
	type CostCapBreachedEvent,
	type CostCapWarningEvent,
	EventBus,
	type ItemCreatedEvent,
} from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AdapterCall {
	recipient: Recipient;
	notification: Notification;
}

function createFakeAdapter(
	name: "console" | "ntfy" | "smtp" = "console",
	override?: (c: AdapterCall) => SendResult,
): NotificationAdapter & { calls: AdapterCall[] } {
	const calls: AdapterCall[] = [];
	return {
		name,
		calls,
		async send(recipient, notification): Promise<SendResult> {
			const call = { recipient, notification };
			calls.push(call);
			if (override) return override(call);
			return { ok: true, channel: name, sentAt: new Date().toISOString() };
		},
	};
}

// @lore AU18: seeds via updateNotificationConfig (server_config-backed) instead
// of raw factorySettings KV rows — same observable outcome, new storage.
// `silenceMode` is a separate top-level option (not part of
// NotificationConfigPatch) because factory-wide silence lives at
// `server_config.notifications.silence.mode`, a distinct sub-section.
async function enableNotifications(
	db: HyperIdleDb,
	overrides: NotificationConfigPatch & { silenceMode?: boolean } = {},
): Promise<void> {
	const { silenceMode, ...deliveryOverrides } = overrides;
	await updateNotificationConfig(db, {
		enabled: true,
		primaryChannel: "console",
		digestChannel: "console",
		floodMaxPerMinute: 100,
		floodCoalesceWindowMs: 60_000,
		...deliveryOverrides,
	});
	if (silenceMode !== undefined) {
		await updateServerConfig(db, { notifications: { silence: { mode: silenceMode } } });
	}
}

async function seedThread(db: HyperIdleDb): Promise<string> {
	const threadId = "thread-dispatch";
	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: "2026-04-18T00:00:00.000Z",
		createdAt: "2026-04-18T00:00:00.000Z",
	});

	return threadId;
}

async function createItem(
	db: HyperIdleDb,
	params: {
		id: string;
		blocking?: boolean;
		riskTier?: string | null;
		title?: string;
		threadId: string;
	},
): Promise<void> {
	await db.insert(itemsTable).values({
		id: params.id,
		kind: "approval",
		title: params.title ?? `Item ${params.id}`,
		body: `Body for ${params.id}`,
		blocking: params.blocking ?? false,
		riskTier: params.riskTier ?? null,
		threadId: params.threadId,
		createdAt: "2026-04-18T00:00:00.000Z",
	});
}

async function emitItemCreated(bus: EventBus, itemId: string): Promise<void> {
	const event: ItemCreatedEvent = {
		type: "item_created",
		streamId: "stream-1",
		itemId,
		conversationId: "thread-dispatch",
		kind: "approval",
		timestamp: Date.now(),
	};
	bus.emit(event);
}

describe("H2 Dispatcher (AC4 silence + AC5 policy)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let bus: EventBus;
	let unsubscribe: () => void;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		bus = new EventBus();
	});

	afterEach(async () => {
		unsubscribe?.();
	});

	it("AC5a: blocking item → pushes via adapter", async () => {
		await enableNotifications(db);
		const threadId = await seedThread(db);
		await createItem(db, { id: "it-blocking", blocking: true, riskTier: "medium", threadId });
		const adapter = createFakeAdapter();
		unsubscribe = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});

		await emitItemCreated(bus, "it-blocking");
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));

		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");
		expect(adapter!.calls[0]!.notification.title).toContain("it-blocking");
	});

	it("AC5b: cost_cap_breached (hard) → pushes via adapter", async () => {
		await enableNotifications(db);
		const adapter = createFakeAdapter();
		unsubscribe = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});

		const event: CostCapBreachedEvent = {
			type: "cost_cap_breached",
			streamId: "s",
			level: "hard",
			capLevel: "factory",
			entityId: "factory",
			spend: 200,
			cap: 100,
			timestamp: Date.now(),
		};
		bus.emit(event);
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));

		expect(adapter!.calls[0]!.notification.severity).toBe("cost_breach");
		expect(adapter!.calls[0]!.notification.title).toContain("factory");
	});

	it("AC5c: cost_cap_warning (warning) → enqueued as digest, NOT pushed", async () => {
		await enableNotifications(db);
		const adapter = createFakeAdapter();
		unsubscribe = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});

		const event: CostCapWarningEvent = {
			type: "cost_cap_warning",
			streamId: "s",
			level: "warning",
			capLevel: "team",
			entityId: "team-1",
			spend: 80,
			cap: 100,
			timestamp: Date.now(),
		};
		bus.emit(event);
		await vi.waitFor(async () => {
			const rows = await listAll(db);
			expect(rows).toHaveLength(1);
		});

		expect(adapter.calls).toHaveLength(0);
		const rows = await listAll(db);
		expect(rows[0]!.severity).toBe("digest");
		expect(rows[0]!.reason).toBe("digest");
	});

	it("AC5d: low-risk non-blocking item → dropped (no push, no queue)", async () => {
		await enableNotifications(db);
		const threadId = await seedThread(db);
		await createItem(db, { id: "it-low", blocking: false, riskTier: "low", threadId });
		const adapter = createFakeAdapter();
		unsubscribe = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});

		await emitItemCreated(bus, "it-low");
		// Event subscribers run synchronously; a single microtask flush is
		// sufficient to observe the final "dropped" state.
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await listAll(db);
		expect(rows).toHaveLength(0);
	});

	it("AC4: silence mode queues blocking items without pushing", async () => {
		await enableNotifications(db, { silenceMode: true });
		const threadId = await seedThread(db);
		await createItem(db, { id: "it-sil", blocking: true, riskTier: "medium", threadId });
		const adapter = createFakeAdapter();
		unsubscribe = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});

		await emitItemCreated(bus, "it-sil");
		await vi.waitFor(async () => {
			const rows = await listAll(db);
			expect(rows).toHaveLength(1);
		});

		expect(adapter.calls).toHaveLength(0);
		const rows = await listAll(db);
		expect(rows[0]!.reason).toBe("silence");
		expect(rows[0]!.subjectId).toBe("it-sil");
		expect(rows[0]!.severity).toBe("blocking");
	});

	it("AC4: flushQueue drains pending rows → adapter receives one send per row", async () => {
		await enableNotifications(db, { silenceMode: true });
		const threadId = await seedThread(db);
		await createItem(db, { id: "it-a", blocking: true, threadId });
		await createItem(db, { id: "it-b", blocking: true, threadId });
		const adapter = createFakeAdapter();
		unsubscribe = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});
		await emitItemCreated(bus, "it-a");
		await emitItemCreated(bus, "it-b");
		await vi.waitFor(async () => {
			const rows = await listAll(db);
			expect(rows).toHaveLength(2);
		});
		expect(adapter.calls).toHaveLength(0);

		// Lift silence via updateServerConfig (server_config-backed).
		await updateServerConfig(db, { notifications: { silence: { mode: false } } });

		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("config unexpectedly disabled");
		const result = await flushQueue(db, () => adapter, cfg, new Date());
		expect(result.flushed).toBe(2);
		expect(result.failed).toBe(0);
		expect(result.deferred).toBe(0);
		expect(adapter.calls).toHaveLength(2);
		const rows = await listAll(db);
		expect(rows.every((r) => r.status === "sent")).toBe(true);
	});

	it("disabled config → dispatcher is a no-op; no queue writes, no sends", async () => {
		// enabled=false
		const adapter = createFakeAdapter();
		unsubscribe = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});
		const threadId = await seedThread(db);
		await createItem(db, { id: "it-x", blocking: true, threadId });
		await emitItemCreated(bus, "it-x");
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		expect(await listAll(db)).toHaveLength(0);
	});

	it("flood policy coalesces the 4th push in a window into queue with reason=flood_coalesce", async () => {
		// Tight flood window to exercise the true path.
		await enableNotifications(db, {
			floodMaxPerMinute: 3,
			floodCoalesceWindowMs: 60_000,
		});
		const threadId = await seedThread(db);
		for (let i = 0; i < 4; i += 1) {
			await createItem(db, { id: `flood-${i}`, blocking: true, threadId });
		}
		const adapter = createFakeAdapter();
		unsubscribe = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});
		for (let i = 0; i < 4; i += 1) await emitItemCreated(bus, `flood-${i}`);

		await vi.waitFor(() => expect(adapter.calls).toHaveLength(3));

		const coalesced = (await listAll(db)).filter((r) => r.reason === "flood_coalesce");
		expect(coalesced).toHaveLength(1);
		expect(coalesced[0]!.severity).toBe("blocking");
	});
});

describe("tryFloodReserve (unit)", () => {
	it("returns true until max is reached, then false within the window", () => {
		const state = { windowStart: 0, count: 0 };
		expect(tryFloodReserve(state, 2, 1000, 100)).toBe(true);
		expect(tryFloodReserve(state, 2, 1000, 200)).toBe(true);
		expect(tryFloodReserve(state, 2, 1000, 300)).toBe(false);
		expect(tryFloodReserve(state, 2, 1000, 900)).toBe(false);
	});

	it("resets counter once the window elapses", () => {
		const state = { windowStart: 0, count: 0 };
		expect(tryFloodReserve(state, 1, 1000, 100)).toBe(true);
		expect(tryFloodReserve(state, 1, 1000, 500)).toBe(false);
		expect(tryFloodReserve(state, 1, 1000, 1500)).toBe(true);
	});

	it("rolls counter over across multiple consecutive windows", () => {
		// Adversary review #16 asked for multi-window rollover coverage.
		const state = { windowStart: 0, count: 0 };
		// Window 1 (t=0): fill the bucket.
		expect(tryFloodReserve(state, 3, 1000, 0)).toBe(true);
		expect(tryFloodReserve(state, 3, 1000, 100)).toBe(true);
		expect(tryFloodReserve(state, 3, 1000, 200)).toBe(true);
		expect(tryFloodReserve(state, 3, 1000, 300)).toBe(false);
		// Window 2 (t=1100): bucket resets, fills again.
		expect(tryFloodReserve(state, 3, 1000, 1100)).toBe(true);
		expect(tryFloodReserve(state, 3, 1000, 1200)).toBe(true);
		expect(tryFloodReserve(state, 3, 1000, 1300)).toBe(true);
		expect(tryFloodReserve(state, 3, 1000, 1400)).toBe(false);
		// Window 3 (t=2500): still rolling over cleanly.
		expect(tryFloodReserve(state, 3, 1000, 2500)).toBe(true);
	});
});

describe("enqueueNotification queue cap (QUEUE_CAP eviction)", () => {
	// @lore The cap defaults to QUEUE_CAP (10k). Each test below passes a
	// small cap as the optional `cap` argument to exercise the eviction
	// branches deterministically. This replaces the earlier tautological
	// tests noted by the adversary review (#15).

	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle?.close();
	});

	async function seedPending(
		spec: Array<{ id: string; severity: "blocking" | "digest" | "cost_breach"; offsetMs: number }>,
	): Promise<void> {
		const baseIso = "2026-04-18T00:00:00.000Z";
		for (const row of spec) {
			await insertNotification(db, {
				id: row.id,
				eventType: "item_created",
				subjectId: null,
				severity: row.severity,
				title: row.id,
				body: "",
				reason: row.severity === "digest" ? "digest" : "silence",
				channel: row.severity === "digest" ? "console" : null,
				status: "pending",
				attempts: 0,
				createdAt: new Date(Date.parse(baseIso) + row.offsetMs).toISOString(),
			});
		}
	}

	it("blocking enqueue at cap evicts the oldest DIGEST row", async () => {
		await seedPending([
			{ id: "digest-1", severity: "digest", offsetMs: 0 },
			{ id: "digest-2", severity: "digest", offsetMs: 1 },
			{ id: "block-1", severity: "blocking", offsetMs: 2 },
		]);

		// Cap = 3 → inserting a 4th blocking row must evict digest-1.
		await enqueueNotification(
			db,
			{
				eventType: "item_created",
				subjectId: "new",
				severity: "blocking",
				title: "new-blocking",
				body: "",
				reason: "silence",
				channel: null,
				now: new Date("2026-04-18T00:00:00.010Z"),
			},
			3,
		);

		const allRows = await listAll(db);
		const pending = allRows.filter((r) => r.status === "pending");
		expect(pending).toHaveLength(3);
		// Oldest digest row was dropped.
		const dropped = allRows.filter((r) => r.status === "dropped");
		expect(dropped).toHaveLength(1);
		expect(dropped[0]!.id).toBe("digest-1");
		// The new blocking row is present.
		const newRow = pending.find((r) => r.title === "new-blocking");
		expect(newRow).toBeDefined();
	});

	it("digest enqueue at cap is dropped silently (never evicts blocking rows)", async () => {
		await seedPending([
			{ id: "block-1", severity: "blocking", offsetMs: 0 },
			{ id: "block-2", severity: "blocking", offsetMs: 1 },
			{ id: "block-3", severity: "blocking", offsetMs: 2 },
		]);

		await enqueueNotification(
			db,
			{
				eventType: "item_created",
				subjectId: "new",
				severity: "digest",
				title: "new-digest",
				body: "",
				reason: "digest",
				channel: "console",
				now: new Date("2026-04-18T00:00:00.010Z"),
			},
			3,
		);

		const allRows = await listAll(db);
		// The digest enqueue was dropped; no new row was inserted, no
		// blocking row was evicted.
		expect(allRows).toHaveLength(3);
		expect(allRows.map((r) => r.id).sort()).toEqual(["block-1", "block-2", "block-3"]);
	});

	it("blocking enqueue with no digest to evict drops the oldest row", async () => {
		await seedPending([
			{ id: "block-1", severity: "blocking", offsetMs: 0 },
			{ id: "block-2", severity: "blocking", offsetMs: 1 },
		]);

		await enqueueNotification(
			db,
			{
				eventType: "item_created",
				subjectId: "new",
				severity: "cost_breach",
				title: "new-cost",
				body: "",
				reason: "retry",
				channel: null,
				now: new Date("2026-04-18T00:00:00.010Z"),
			},
			2,
		);

		const allRows2 = await listAll(db);
		const pending = allRows2.filter((r) => r.status === "pending");
		expect(pending).toHaveLength(2);
		// The oldest (block-1) was dropped.
		const dropped = allRows2.filter((r) => r.status === "dropped");
		expect(dropped.map((r) => r.id)).toEqual(["block-1"]);
	});
});

describe("H2 Daily digest (AC6)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	it("dispatchDigest sends one batched notification for three pending rows", async () => {
		await enableNotifications(db);
		const now = "2026-04-18T08:00:00.000Z";
		for (const id of ["q-a", "q-b", "q-c"]) {
			await insertNotification(db, {
				id,
				eventType: "item_created",
				subjectId: id,
				severity: "digest",
				title: `Title ${id}`,
				body: `Body ${id}`,
				reason: "digest",
				channel: "console",
				status: "pending",
				attempts: 0,
				createdAt: now,
			});
		}

		const adapter = createFakeAdapter();
		const result = await dispatchDigest(db, { adapterFactory: () => adapter });
		expect(result.status).toBe("sent");
		expect(result.notificationsIncluded).toBe(3);
		expect(adapter.calls).toHaveLength(1);
		const batched = adapter!.calls[0]!.notification;
		expect(batched.title).toContain("3");
		expect(batched.body).toContain("Title q-a");
		expect(batched.body).toContain("Title q-b");
		expect(batched.body).toContain("Title q-c");

		const rows = await listAll(db);
		expect(rows.every((r) => r.status === "sent")).toBe(true);
	});

	it("dispatchDigest with zero pending rows → noop, no adapter calls", async () => {
		await enableNotifications(db);
		const adapter = createFakeAdapter();
		const result = await dispatchDigest(db, { adapterFactory: () => adapter });
		expect(result.status).toBe("noop");
		expect(result.notificationsIncluded).toBe(0);
		expect(adapter.calls).toHaveLength(0);
	});
});

describe("flushQueue silence gating (adversary review #2)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	it("keeps blocking rows queued when silence_mode is active; digest flushes", async () => {
		await enableNotifications(db, { silenceMode: true });
		const baseIso = "2026-04-18T00:00:00.000Z";
		await insertNotification(db, {
			id: "block-sil",
			eventType: "item_created",
			subjectId: null,
			severity: "blocking",
			title: "held",
			body: "",
			reason: "silence",
			channel: "console",
			status: "pending",
			attempts: 0,
			createdAt: baseIso,
		});

		await insertNotification(db, {
			id: "digest-sil",
			eventType: "item_created",
			subjectId: null,
			severity: "digest",
			title: "batched",
			body: "",
			reason: "digest",
			channel: "console",
			status: "pending",
			attempts: 0,
			createdAt: baseIso,
		});

		const adapter = createFakeAdapter();
		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("cfg unexpectedly null");
		const result = await flushQueue(db, () => adapter, cfg, new Date());
		expect(result.flushed).toBe(1); // digest only
		expect(result.deferred).toBe(1); // blocking kept
		expect(adapter.calls).toHaveLength(1);
		expect(adapter!.calls[0]!.notification.severity).toBe("digest");
		const block = await findNotificationById(db, "block-sil");
		expect(block?.status).toBe("pending");
	});

	it("cost_breach severity pages through even during silence", async () => {
		await enableNotifications(db, { silenceMode: true });
		await insertNotification(db, {
			id: "cost-1",
			eventType: "cost_cap_breached",
			subjectId: null,
			severity: "cost_breach",
			title: "factory cap",
			body: "",
			reason: "silence",
			channel: "console",
			status: "pending",
			attempts: 0,
			createdAt: "2026-04-18T00:00:00.000Z",
		});

		const adapter = createFakeAdapter();
		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("cfg unexpectedly null");
		const result = await flushQueue(db, () => adapter, cfg, new Date());
		expect(result.flushed).toBe(1);
		expect(adapter.calls).toHaveLength(1);
		expect(adapter!.calls[0]!.notification.severity).toBe("cost_breach");
	});
});

describe("flushQueue channel routing (adversary review #18)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	it("picks the adapter per row.channel, not the default", async () => {
		// Enable notifications with primary=console but seed a row whose
		// channel is 'ntfy' — flushQueue must build a ntfy adapter via
		// the factory, not send on console.
		await enableNotifications(db, {
			primaryChannel: "console",
			recipientNtfyTopic: "alerts",
		});
		await insertNotification(db, {
			id: "q-ntfy",
			eventType: "item_created",
			subjectId: null,
			severity: "blocking",
			title: "routed by channel",
			body: "",
			reason: "retry",
			channel: "ntfy",
			status: "pending",
			attempts: 0,
			createdAt: "2026-04-18T00:00:00.000Z",
		});

		const builtChannels: string[] = [];
		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("cfg unexpectedly null");
		const result = await flushQueue(
			db,
			(c) => {
				builtChannels.push(c.primaryChannel);
				return createFakeAdapter(c.primaryChannel);
			},
			cfg,
			new Date(),
		);
		expect(result.flushed).toBe(1);
		// The factory was called with primaryChannel === "ntfy" because
		// the stored row.channel was "ntfy".
		expect(builtChannels).toContain("ntfy");
	});
});

describe("At-least-once delivery (claim lease)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	it("claims row as 'sending' before adapter; marks 'sent' after success", async () => {
		await enableNotifications(db);
		await insertNotification(db, {
			id: "aq-1",
			eventType: "item_created",
			subjectId: null,
			severity: "digest",
			title: "digest-alo",
			body: "",
			reason: "digest",
			channel: "console",
			status: "pending",
			attempts: 0,
			createdAt: "2026-04-18T00:00:00.000Z",
		});

		let observedStatus: string | null = null;
		const adapter: NotificationAdapter & { calls: AdapterCall[] } = {
			name: "console",
			calls: [],
			async send(recipient, notification): Promise<SendResult> {
				this.calls.push({ recipient, notification });
				// Peek at the row state mid-send — should be `sending`.
				const midSendRow = await findNotificationById(db, "aq-1");
				observedStatus = midSendRow?.status ?? null;
				return { ok: true, channel: "console", sentAt: new Date().toISOString() };
			},
		};
		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("cfg unexpectedly null");
		const result = await flushQueue(db, () => adapter, cfg, new Date());
		expect(result.flushed).toBe(1);
		expect(observedStatus).toBe("sending");
		const row = await findNotificationById(db, "aq-1");
		expect(row?.status).toBe("sent");
		expect(row?.claimedAt).toBeNull();
	});

	it("recoverStuckLeases requeues rows whose 'sending' lease expired", async () => {
		const now = new Date("2026-04-18T01:00:00.000Z");
		const oldClaim = new Date("2026-04-18T00:00:00.000Z").toISOString(); // 1h ago
		await insertNotification(db, {
			id: "stuck-1",
			eventType: "item_created",
			subjectId: null,
			severity: "digest",
			title: "lost row",
			body: "",
			reason: "digest",
			channel: "console",
			status: "sending",
			attempts: 1,
			createdAt: oldClaim,
			claimedAt: oldClaim,
		});

		const recovered = await recoverStuckLeases(db, now);
		expect(recovered).toBe(1);
		const row = await findNotificationById(db, "stuck-1");
		expect(row?.status).toBe("pending");
		expect(row?.claimedAt).toBeNull();
	});

	it("does not requeue rows whose 'sending' lease is still fresh", async () => {
		const now = new Date("2026-04-18T00:01:00.000Z");
		const freshClaim = new Date("2026-04-18T00:00:30.000Z").toISOString(); // 30s ago
		await insertNotification(db, {
			id: "fresh-1",
			eventType: "item_created",
			subjectId: null,
			severity: "digest",
			title: "fresh lease",
			body: "",
			reason: "digest",
			channel: "console",
			status: "sending",
			attempts: 1,
			createdAt: freshClaim,
			claimedAt: freshClaim,
		});

		const recovered = await recoverStuckLeases(db, now);
		expect(recovered).toBe(0);
		const row = await findNotificationById(db, "fresh-1");
		expect(row?.status).toBe("sending");
	});

	it("simulates crash-after-adapter-success-before-DB-update → next flush re-sends", async () => {
		await enableNotifications(db);
		const oldClaim = new Date("2026-04-18T00:00:00.000Z").toISOString();
		await insertNotification(db, {
			id: "crash-1",
			eventType: "item_created",
			subjectId: null,
			severity: "digest",
			title: "interrupted",
			body: "",
			reason: "digest",
			channel: "console",
			status: "sending",
			attempts: 1,
			createdAt: oldClaim,
			claimedAt: oldClaim, // lease > 5 min ago
		});

		const adapter = createFakeAdapter();
		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("cfg unexpectedly null");
		const now = new Date("2026-04-18T01:00:00.000Z");
		const result = await flushQueue(db, () => adapter, cfg, now);
		// The row was requeued by recoverStuckLeases and then flushed.
		expect(result.flushed).toBe(1);
		expect(adapter.calls).toHaveLength(1);
		const row = await findNotificationById(db, "crash-1");
		expect(row?.status).toBe("sent");
	});
});
