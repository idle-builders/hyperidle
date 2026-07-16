import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const RISK_TIERS = ["low", "medium", "high"] as const;

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

async function handler<TDb>(
	input: RouteItemInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult<RouteItemData>> {
	const row = await ports.work.getItemById(ctx.db, input.itemId);
	if (!row) {
		return err("NOT_FOUND", `Item not found: ${input.itemId}`);
	}

	const effectiveRiskTier = input.riskTier ?? row.riskTier ?? null;
	const effectiveKind = input.kind ?? row.kind ?? null;
	const effectiveVerb = input.verb ?? row.verb ?? null;

	const view = ports.work.routeItem({
		riskTier: effectiveRiskTier,
		kind: effectiveKind,
		verb: effectiveVerb,
	});

	const updates: Partial<{ riskTier: string; kind: string; verb: string }> = {};
	if (input.riskTier !== undefined) updates.riskTier = input.riskTier;
	if (input.kind !== undefined) updates.kind = input.kind;
	if (input.verb !== undefined) updates.verb = input.verb;
	if (Object.keys(updates).length > 0) {
		await ports.work.updateItemById(ctx.db, input.itemId, updates);
	}

	return ok<RouteItemData>({
		itemId: input.itemId,
		view,
		riskTier: effectiveRiskTier,
		kind: effectiveKind,
		verb: effectiveVerb,
	});
}

export function createRouteItemTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<RouteItemInput, TDb> {
	return {
		name: "route_item",
		description:
			"Route an existing item to its correct view (conversations | work | knowledge) based on risk tier and kind. Accepts optional overrides for riskTier, kind, or verb; returns the resolved view.",
		inputSchema: routeItemInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		roles: ["assistant", "facilitator", "product_manager"],
	};
}
