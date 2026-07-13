import {
	buildToolRegistry,
	makeContext,
	NOW,
	routeItemTool,
	seedBase,
} from "@hyperidle/agent-layer";
import { type HyperIdleDb, items } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";

async function seedItem(
	db: HyperIdleDb,
	overrides: {
		id?: string;
		kind?: string | null;
		verb?: string | null;
		riskTier?: string | null;
	} = {},
): Promise<string> {
	const id = overrides.id ?? `item-${Math.random().toString(36).slice(2, 10)}`;
	await db.insert(items).values({
		id,
		sourceAgentId: "agent-fac",
		title: "Seeded item",
		kind: overrides.kind ?? null,
		verb: overrides.verb ?? null,
		riskTier: overrides.riskTier ?? null,
		threadId: "th1",
		createdAt: NOW,
	});
	return id;
}

describe("route_item tool", () => {
	test("returns NOT_FOUND for unknown itemId", async ({ db }) => {
		await seedBase(db);
		const result = await routeItemTool.handler({ itemId: "does-not-exist" }, makeContext(db));
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("returns INVALID_INPUT for missing itemId via registry dispatch", async ({ db }) => {
		await seedBase(db);
		// I2 B1-B4: registry now requires an explicit role. Use
		// chief_of_staff so the full tool set remains visible (route_item // @lore AD8a: role string renamed to "assistant" in AD8b
		// is facilitator-only).
		const registry = buildToolRegistry(makeContext(db), { role: "assistant" }); // @lore AD8a: role string renamed to "assistant" in AD8b
		const result = await registry.invoke("route_item", {});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("routes a low-risk knowledge item to the knowledge view", async ({ db }) => {
		await seedBase(db);
		const id = await seedItem(db, { kind: "knowledge", riskTier: "low" });
		const result = await routeItemTool.handler({ itemId: id }, makeContext(db));
		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { view: string };
		expect(data.view).toBe("knowledge");
	});

	test("high-risk item routes to conversations", async ({ db }) => {
		await seedBase(db);
		const id = await seedItem(db, { kind: "knowledge", riskTier: "low" });
		const result = await routeItemTool.handler({ itemId: id, riskTier: "high" }, makeContext(db));
		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { view: string };
		expect(data.view).toBe("conversations");
	});

	test("overrides persist on the items row", async ({ db }) => {
		await seedBase(db);
		const id = await seedItem(db, { kind: "knowledge", riskTier: "low" });
		await routeItemTool.handler({ itemId: id, riskTier: "high" }, makeContext(db));
		const [row] = await db.select().from(items).where(eq(items.id, id));
		expect(row?.riskTier).toBe("high");
	});

	test("non-overridden fields remain unchanged", async ({ db }) => {
		await seedBase(db);
		const id = await seedItem(db, { kind: "knowledge", verb: "propose", riskTier: "low" });
		await routeItemTool.handler({ itemId: id, riskTier: "high" }, makeContext(db));
		const [row] = await db.select().from(items).where(eq(items.id, id));
		expect(row?.kind).toBe("knowledge");
		expect(row?.verb).toBe("propose");
	});
});
