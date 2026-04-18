import {
	type HyperIdleDb,
	agentSkills,
	agents,
	factorySettings,
	items,
	responses,
	teams,
} from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent, NotificationEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

interface PolicyEngineOptions {
	/** Inject current time for testability. Defaults to () => new Date(). */
	nowFn?: () => Date;
}

type PolicyAction = "push" | "queue" | "auto_resolve";

/**
 * Registers the policy engine event handler.
 * Subscribes to `item_created` events and applies autonomy/silence rules.
 * Returns an unsubscribe function.
 */
export function registerPolicyEngine(
	db: HyperIdleDb,
	eventBus: EventBus,
	options?: PolicyEngineOptions,
): () => void {
	const nowFn = options?.nowFn ?? (() => new Date());

	const handler = (event: ItemCreatedEvent): void => {
		evaluateItem(db, eventBus, event.itemId, nowFn);
	};

	return eventBus.on("item_created", handler);
}

function evaluateItem(
	db: HyperIdleDb,
	eventBus: EventBus,
	itemId: string,
	nowFn: () => Date,
): void {
	// 1. Load the item
	const item = db.select().from(items).where(eq(items.id, itemId)).get();
	if (!item) return;

	// 2. Load the source agent's autonomy level
	const autonomyLevel = getAutonomyLevel(db, item.sourceAgentId);

	// 3. Determine action (priority order)
	const action = determineAction(db, item, autonomyLevel, nowFn);

	// 4. Execute the action
	executeAction(db, eventBus, itemId, action);
}

function getAutonomyLevel(db: HyperIdleDb, sourceAgentId: string | null): number {
	if (!sourceAgentId) return 1;

	const skills = db.select().from(agentSkills).where(eq(agentSkills.agentId, sourceAgentId)).all();

	if (skills.length === 0) return 1;

	// Return max autonomy level across all skills
	return Math.max(...skills.map((s) => s.autonomyLevel));
}

function determineAction(
	db: HyperIdleDb,
	item: {
		riskTier: string | null;
		kind: string | null;
		blocking: number | null;
		sourceAgentId: string | null;
	},
	autonomyLevel: number,
	nowFn: () => Date,
): PolicyAction {
	// a. High-risk: ALWAYS push
	if (item.riskTier === "high") return "push";

	// b. Skill-change: ALWAYS push
	if (item.kind === "skill_change") return "push";

	const isBlocking = (item.blocking ?? 0) !== 0;

	// c. Check silence modes (only for non-blocking items)
	if (!isBlocking) {
		if (isSilenced(db, item, nowFn)) return "queue";
	}

	// d. Autonomy-based rules
	if (autonomyLevel >= 4 && item.riskTier === "low") return "auto_resolve";
	if (autonomyLevel === 3 && item.riskTier === "low") return "queue";
	// L2 or L1 -> push
	return "push";
}

function isSilenced(
	db: HyperIdleDb,
	item: { sourceAgentId: string | null },
	nowFn: () => Date,
): boolean {
	// Factory-wide silence mode
	const silenceMode = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "silence_mode"))
		.get();
	if (silenceMode?.value === "true") return true;

	// Per-product silence
	if (item.sourceAgentId) {
		const agent = db.select().from(agents).where(eq(agents.id, item.sourceAgentId)).get();
		if (agent?.teamId) {
			const team = db.select().from(teams).where(eq(teams.id, agent.teamId)).get();
			if (team) {
				const productSilence = db
					.select()
					.from(factorySettings)
					.where(eq(factorySettings.key, `silence_product_${team.productId}`))
					.get();
				if (productSilence?.value === "true") return true;
			}
		}
	}

	// Silence window
	const windowStart = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "silence_window_start"))
		.get();
	const windowEnd = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "silence_window_end"))
		.get();

	if (windowStart && windowEnd) {
		if (isInSilenceWindow(windowStart.value, windowEnd.value, nowFn())) return true;
	}

	return false;
}

function isInSilenceWindow(startStr: string, endStr: string, now: Date): boolean {
	const [startH, startM] = startStr.split(":").map(Number);
	const [endH, endM] = endStr.split(":").map(Number);

	const startMinutes = startH * 60 + startM;
	const endMinutes = endH * 60 + endM;
	const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

	if (startMinutes <= endMinutes) {
		// Same-day window (e.g. 09:00–17:00)
		return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
	}
	// Overnight window (e.g. 22:00–07:00)
	return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

function executeAction(
	db: HyperIdleDb,
	eventBus: EventBus,
	itemId: string,
	action: PolicyAction,
): void {
	switch (action) {
		case "auto_resolve": {
			const responseId = crypto.randomUUID();
			const respondedAt = new Date().toISOString();
			db.insert(responses)
				.values({
					id: responseId,
					itemId,
					decision: "approve",
					approverId: "policy_engine",
					respondedAt,
				})
				.run();
			break;
		}
		case "queue": {
			db.update(items)
				.set({ auditTrail: JSON.stringify({ action: "policy_queued" }) })
				.where(eq(items.id, itemId))
				.run();
			break;
		}
		case "push": {
			const notification: NotificationEvent = {
				type: "notification",
				streamId: crypto.randomUUID(),
				targetId: itemId,
				message: `Item ${itemId} requires attention`,
				timestamp: Date.now(),
			};
			eventBus.emit(notification);
			break;
		}
	}
}
