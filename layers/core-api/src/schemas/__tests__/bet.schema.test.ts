/**
 * B. Composite Schema Tests — bet schemas
 *
 * @lore U1: Status simplified to draft|active|completed|killed.
 * pitch -> description, productId -> teamId, shippedAt -> completedAt.
 */

import { describe, expect, it } from "vitest";
import {
	betDetailResponseSchema,
	betListResponseSchema,
	betProgressSchema,
	betTaskRowSchema,
} from "../bet.schema.js";

describe("B1. betDetailResponseSchema", () => {
	const validBetDetail = {
		id: "bet-1",
		title: "Build feature X",
		product: "My Product",
		team: "Team Alpha",
		// @lore U1: status is "draft" (formerly "shaped")
		status: "draft",
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 0, total: 3 },
		// @lore U1: `description` (formerly `pitch`)
		description: "# Build feature X\n\nThis is the description.",
		tasks: [
			{
				id: "task-1",
				title: "Implement endpoint",
				owner: "Agent Alpha",
				state: "open",
				latestSessionOutcome: null,
				latestSessionHarnessUrl: null,
				latestSessionModelTier: null,
				ownerAgentId: "agent-1",
			},
		],
	};

	it("betDetailResponseSchema is defined and has parse/safeParse", () => {
		expect(betDetailResponseSchema).toBeDefined();
		expect(typeof betDetailResponseSchema.parse).toBe("function");
		expect(typeof betDetailResponseSchema.safeParse).toBe("function");
	});

	it("accepts a valid bet detail payload", () => {
		const result = betDetailResponseSchema.safeParse(validBetDetail);
		expect(result.success).toBe(true);
	});

	it("rejects payload missing required fields", () => {
		const result = betDetailResponseSchema.safeParse({
			id: "bet-1",
			// missing title, product, team, status, progress, description, tasks
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid status value", () => {
		const result = betDetailResponseSchema.safeParse({
			...validBetDetail,
			status: "invalid-status",
		});
		expect(result.success).toBe(false);
	});

	it("rejects tasks with invalid state", () => {
		const result = betDetailResponseSchema.safeParse({
			...validBetDetail,
			tasks: [
				{
					id: "task-1",
					title: "Task",
					owner: "Agent",
					state: "not-a-real-state",
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("validates nested progress schema", () => {
		const result = betDetailResponseSchema.safeParse({
			...validBetDetail,
			progress: { done: -1, total: 3 },
		});
		// progress.done must be >= 0
		expect(result.success).toBe(false);
	});
});

describe("B2. betListResponseSchema", () => {
	// @lore U1: Status groups simplified: shaped->draft, committed|in_progress->active, shipped->completed.
	const validList = {
		draft: [],
		active: [],
		completed: [],
		killed: [],
	};

	it("betListResponseSchema is defined and has parse/safeParse", () => {
		expect(betListResponseSchema).toBeDefined();
		expect(typeof betListResponseSchema.parse).toBe("function");
		expect(typeof betListResponseSchema.safeParse).toBe("function");
	});

	it("accepts a valid empty grouped bet list", () => {
		const result = betListResponseSchema.safeParse(validList);
		expect(result.success).toBe(true);
	});

	// @lore AU30: the wire item, not the DB row — `atRisk` is the boolean the route
	// emits (normalizeBet in routes/bets.ts) and `sourceKnowledgeItemId` is always
	// present because the route returns whole rows.
	const validListItem = {
		id: "bet-2",
		teamId: "prod-1",
		description: "Description",
		appetite: null,
		doneCondition: null,
		hypothesis: null,
		// @lore U1: status is "draft" (formerly "shaped")
		status: "draft",
		revisionLog: null,
		createdAt: "2025-01-01T00:00:00.000Z",
		completedAt: null,
		atRisk: true,
		tokensActualJson: null,
		// AC1: outcome fields — nullable, default null
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		// AK5: provenance backlink — present on every wire row, nullable
		sourceKnowledgeItemId: null,
	};

	it("accepts a list with bets in each group", () => {
		const result = betListResponseSchema.safeParse({
			draft: [validListItem],
			active: [],
			completed: [],
			killed: [],
		});
		expect(result.success).toBe(true);
	});

	// @lore AU30: the schema describes the WIRE shape, not the `bets` row. The column
	// is integer 0/1; the route normalizes it to a boolean before responding. A raw
	// DB-shaped row must therefore be rejected — that is what distinguishes this
	// hand-written schema from the drizzle-zod generated one it replaced.
	it("rejects a raw DB-shaped row whose atRisk is the integer column value", () => {
		const result = betListResponseSchema.safeParse({
			draft: [{ ...validListItem, atRisk: 0 }],
			active: [],
			completed: [],
			killed: [],
		});
		expect(result.success).toBe(false);
	});

	it("rejects payload missing a group", () => {
		const result = betListResponseSchema.safeParse({
			draft: [],
			active: [],
			// missing completed, killed
		});
		expect(result.success).toBe(false);
	});
});

describe("B3. betTaskRowSchema", () => {
	it("betTaskRowSchema is defined", () => {
		expect(betTaskRowSchema).toBeDefined();
		expect(typeof betTaskRowSchema.safeParse).toBe("function");
	});

	it("accepts a valid task row", () => {
		const result = betTaskRowSchema.safeParse({
			id: "task-1",
			title: "Implement API",
			owner: "Agent Alpha",
			state: "open",
			latestSessionOutcome: null,
			latestSessionHarnessUrl: null,
			latestSessionModelTier: null,
			ownerAgentId: null,
		});
		expect(result.success).toBe(true);
	});
});

describe("B4. betProgressSchema", () => {
	it("betProgressSchema is defined", () => {
		expect(betProgressSchema).toBeDefined();
		expect(typeof betProgressSchema.safeParse).toBe("function");
	});

	it("accepts valid progress", () => {
		const result = betProgressSchema.safeParse({ done: 2, total: 5 });
		expect(result.success).toBe(true);
	});

	it("rejects negative done count", () => {
		const result = betProgressSchema.safeParse({ done: -1, total: 5 });
		expect(result.success).toBe(false);
	});

	it("rejects negative total count", () => {
		const result = betProgressSchema.safeParse({ done: 0, total: -1 });
		expect(result.success).toBe(false);
	});
});
