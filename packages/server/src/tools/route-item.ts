import * as work from "@hyperidle/work";
import { routeItem } from "@hyperidle/work";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const RISK_TIERS = ["low", "medium", "high"] as const;

/**
 * `route_item` — Route an EXISTING item to its correct view by computing the
 * view via `routeItem(...)`. G1 provides a state-transitioning shim: G2 will
 * wire additional routing semantics (view-column persistence, event emission).
 */
const routeItemInputSchema = z.object({
	itemId: z.string().min(1),
	riskTier: z.enum(RISK_TIERS).optional(),
	kind: z.string().optional(),
	verb: z.string().optional(),
});

type RouteItemInput = z.infer<typeof routeItemInputSchema>;

interface RouteItemData {
	readonly itemId: string;
	readonly view: "conversations" | "work" | "knowledge";
	readonly riskTier: string | null;
	readonly kind: string | null;
	readonly verb: string | null;
}

async function handler(
	input: RouteItemInput,
	ctx: ToolContext,
): Promise<ToolResult<RouteItemData>> {
	const row = await work.getItemById(ctx.db, input.itemId);
	if (!row) {
		return err("NOT_FOUND", `Item not found: ${input.itemId}`);
	}

	const effectiveRiskTier = input.riskTier ?? row.riskTier ?? null;
	const effectiveKind = input.kind ?? row.kind ?? null;
	const effectiveVerb = input.verb ?? row.verb ?? null;

	const view = routeItem({
		riskTier: effectiveRiskTier,
		kind: effectiveKind,
		verb: effectiveVerb,
	});

	// Persist only overridden fields — non-overridden columns stay untouched.
	const updates: Partial<{ riskTier: string; kind: string; verb: string }> = {};
	if (input.riskTier !== undefined) updates.riskTier = input.riskTier;
	if (input.kind !== undefined) updates.kind = input.kind;
	if (input.verb !== undefined) updates.verb = input.verb;
	if (Object.keys(updates).length > 0) {
		await work.updateItemById(ctx.db, input.itemId, updates);
	}

	return ok<RouteItemData>({
		itemId: input.itemId,
		view,
		riskTier: effectiveRiskTier,
		kind: effectiveKind,
		verb: effectiveVerb,
	});
}

export const routeItemTool: ToolDefinition<RouteItemInput> = {
	name: "route_item",
	description:
		"Route an existing item to its correct view (conversations | work | knowledge) based on risk tier and kind. Accepts optional overrides for riskTier, kind, or verb; returns the resolved view.",
	inputSchema: routeItemInputSchema,
	handler,
	// @lore G3 may add an `item_routed` event when other subscribers need it;
	// G1 intentionally omits the emit so the shim stays idempotent.
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	// @lore AD8c: role string "practice_facilitator" renamed to "facilitator".
	roles: ["assistant", "facilitator", "product_manager"],
};
