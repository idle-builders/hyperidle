import { type HyperIdleDb, createTestDb, items } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { routeItemTool } from "../route-item.js";
import { buildToolRegistry } from "../tool-registry.js";
import { NOW, makeContext, seedBase } from "./_helpers.js";

function seedItem(
	db: HyperIdleDb,
	overrides: {
		id?: string;
		kind?: string | null;
		verb?: string | null;
		riskTier?: string | null;
	} = {},
): string {
	const id = overrides.id ?? `item-${Math.random().toString(36).slice(2, 10)}`;
	db.insert(items)
		.values({
			id,
			sourceAgentId: "agent-fac",
			title: "Seeded item",
			kind: overrides.kind ?? null,
			verb: overrides.verb ?? null,
			riskTier: overrides.riskTier ?? null,
			threadId: "th1",
			createdAt: NOW,
		})
		.run();
	return id;
}

describe("route_item tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedBase(db);
	});

	it("returns NOT_FOUND for unknown itemId", async () => {
		const result = await routeItemTool.handler({ itemId: "does-not-exist" }, makeContext(db));
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	it("returns INVALID_INPUT for missing itemId via registry dispatch", async () => {
		// I2 B1-B4: registry now requires an explicit role. Use
		// chief_of_staff so the full tool set remains visible (route_item
		// is facilitator-only).
		const registry = buildToolRegistry(makeContext(db), { role: "chief_of_staff" });
		const result = await registry.invoke("route_item", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	it("routes a low-risk knowledge item to the knowledge view", async () => {
		const id = seedItem(db, { kind: "knowledge", riskTier: "low" });
		const result = await routeItemTool.handler({ itemId: id }, makeContext(db));
		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { view: string };
		expect(data.view).toBe("knowledge");
	});

	it("high-risk item routes to conversations", async () => {
		const id = seedItem(db, { kind: "knowledge", riskTier: "low" });
		const result = await routeItemTool.handler({ itemId: id, riskTier: "high" }, makeContext(db));
		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { view: string };
		expect(data.view).toBe("conversations");
	});

	it("overrides persist on the items row", async () => {
		const id = seedItem(db, { kind: "knowledge", riskTier: "low" });
		await routeItemTool.handler({ itemId: id, riskTier: "high" }, makeContext(db));
		const row = db.select().from(items).where(eq(items.id, id)).get();
		expect(row?.riskTier).toBe("high");
	});

	it("non-overridden fields remain unchanged", async () => {
		const id = seedItem(db, { kind: "knowledge", verb: "propose", riskTier: "low" });
		await routeItemTool.handler({ itemId: id, riskTier: "high" }, makeContext(db));
		const row = db.select().from(items).where(eq(items.id, id)).get();
		expect(row?.kind).toBe("knowledge");
		expect(row?.verb).toBe("propose");
	});
});
