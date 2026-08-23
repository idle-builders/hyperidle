import type { HyperIdleDb } from "@hyperidle/db";
import type { ItemCreatedEvent, NotificationEvent } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { computeApprovalRate } from "./approval-rate.js";
import type { PolicyDeps } from "./ports.js";

/**
 * @lore AU43: silence removed from PolicyEngineDeps — isSilenced had no
 * writer for its config (constant-false in every real install). The silence
 * branch in determineAction is deleted; db and nowFn are no longer needed
 * there, so determineAction is now synchronous.
 */
type PolicyEngineDeps = Pick<PolicyDeps, "work" | "conversation">;

type PolicyAction = "push" | "queue" | "auto_resolve";

interface TrustSignal {
	approvalRate: number;
	totalVerdicts: number;
}

/**
 * Registers the policy engine event handler.
 * Subscribes to `item_created` events and applies trust rules.
 * Returns an unsubscribe function.
 */
function registerPolicyEngine(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: PolicyEngineDeps,
): () => void {
	const handler = (event: ItemCreatedEvent): void => {
		void (async () => {
			await evaluateItem(db, eventBus, event.itemId, deps);
		})().catch(
			// @lore AU44 batch6: propagation_log table dropped (AU20 Ruling 2).
			// Policy evaluation failures are NOT lifecycle-propagation hops so
			// propagation_failed is not appropriate (its levels are session/task/
			// bet/team/portfolio, not "item"/"policy"). The error is intentionally
			// swallowed here; a plugin can subscribe to "item_created" and wrap
			// registerPolicy with its own error capture if observability is needed.
			(_error: unknown) => {},
		);
	};

	return eventBus.on("item_created", handler);
}

export { registerPolicyEngine };

async function evaluateItem(
	db: HyperIdleDb,
	eventBus: EventBus,
	itemId: string,
	deps: PolicyEngineDeps,
): Promise<void> {
	// 1. Load the item
	const item = await deps.work.getItemById(db, itemId);
	if (!item) return;

	// 2. Load the source agent's trust signal (approval rate from verdict history)
	const trust = await getAgentTrustSignal(db, item.sourceAgentId, deps);

	// 3. Determine action (priority order)
	const action = determineAction(item, trust);

	// 4. Execute the action
	await executeAction(db, eventBus, itemId, action, deps);
}

/** @lore AU18: was settable via `factory_settings.trust_window_days` — now the fixed default. */
const TRUST_WINDOW_DAYS = 30;
/** @lore AU18: was settable via `factory_settings.trust_auto_resolve_threshold` — now fixed. */
const TRUST_AUTO_RESOLVE_THRESHOLD = 0.9;
/** @lore AU18: was settable via `factory_settings.trust_auto_resolve_min_verdicts` — now fixed. */
const TRUST_AUTO_RESOLVE_MIN_VERDICTS = 10;
/** @lore AU18: was settable via `factory_settings.trust_queue_threshold` — now fixed. */
const TRUST_QUEUE_THRESHOLD = 0.7;

async function getAgentTrustSignal(
	db: HyperIdleDb,
	sourceAgentId: string | null,
	deps: PolicyEngineDeps,
): Promise<TrustSignal> {
	if (!sourceAgentId) return { approvalRate: 0, totalVerdicts: 0 };

	const result = await computeApprovalRate(db, sourceAgentId, TRUST_WINDOW_DAYS, deps);

	return {
		approvalRate: result.approvalRate,
		totalVerdicts: result.totalVerdicts,
	};
}

function determineAction(
	item: {
		riskTier: string | null;
		kind: string | null;
	},
	trust: TrustSignal,
): PolicyAction {
	// a. High-risk: ALWAYS push
	if (item.riskTier === "high") return "push";

	// b. Skill-change: ALWAYS push
	if (item.kind === "skill_change") return "push";

	// c. Trust-based rules (replaces autonomy level rules)
	// @lore AU18: thresholds were settable via factory_settings; now fixed defaults.
	const autoResolveThreshold = TRUST_AUTO_RESOLVE_THRESHOLD;
	const autoResolveMinVerdicts = TRUST_AUTO_RESOLVE_MIN_VERDICTS;
	const queueThreshold = TRUST_QUEUE_THRESHOLD;

	// @lore AD4: Cold-start protection applies to both auto_resolve and queue.
	// Insufficient verdicts → always push regardless of rate, so new agents
	// always see maximum oversight until they accumulate enough history.
	if (trust.totalVerdicts < autoResolveMinVerdicts) {
		return "push";
	}

	if (trust.approvalRate >= autoResolveThreshold && item.riskTier === "low") {
		return "auto_resolve";
	}

	if (trust.approvalRate >= queueThreshold && item.riskTier === "low") {
		return "queue";
	}

	return "push";
}

async function executeAction(
	db: HyperIdleDb,
	eventBus: EventBus,
	itemId: string,
	action: PolicyAction,
	deps: PolicyEngineDeps,
): Promise<void> {
	switch (action) {
		case "auto_resolve": {
			// L1a M4: write a `verdict`-typed message instead of a row in the
			// dropped `responses` table. The item carries a `threadId`; the
			// verdict targets the most recent review-typed message in that
			// thread (or the legacy item id when no review message exists).
			const item = await deps.work.getItemById(db, itemId);
			if (!item) break;
			// L1 step5 (W5): push the type filter into SQL and limit to the
			// most recent review-typed message — the previous query loaded
			// every message in the thread to JS just to find one.
			const [reviewMessage] = await deps.conversation.listMessagesByThread(db, item.threadId, {
				type: "review",
				order: "createdAt",
				dir: "desc",
				limit: 1,
			});

			const messageId = crypto.randomUUID();
			const respondedAt = new Date().toISOString();
			const verdictPayload = {
				decision: "approve",
				resolvesMessageId: reviewMessage?.id ?? itemId,
			};
			await deps.conversation.insertMessage(db, {
				id: messageId,
				senderId: "policy_engine",
				threadId: item.threadId,
				type: "verdict",
				payload: JSON.stringify(verdictPayload),
				clientKey: `__l1_policy_${itemId}`,
				legacyItemId: itemId,
				createdAt: respondedAt,
			});
			if (reviewMessage) {
				await deps.conversation.resolveMessageIfUnresolved(db, reviewMessage.id, respondedAt);
			}
			await deps.conversation.updateThread(db, item.threadId, { resolvedAt: respondedAt });
			break;
		}
		case "queue": {
			// @lore I6: append to auditTrail instead of overwriting to preserve
			// prior entries (e.g. from re-evaluation after an unqueue).
			const existing = await deps.work.getItemById(db, itemId);
			// @lore I6: old data may have a plain object instead of an array.
			// Guard with Array.isArray to avoid crashing on legacy audit trails.
			const parsed: unknown = existing?.auditTrail ? JSON.parse(existing.auditTrail) : [];
			const trail: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
			trail.push({ action: "policy_queued", timestamp: new Date().toISOString() });
			await deps.work.updateItemById(db, itemId, { auditTrail: JSON.stringify(trail) });
			break;
		}
		case "push": {
			const notification: NotificationEvent = {
				type: "notification",
				streamId: crypto.randomUUID(),
				targetId: itemId,
				// AF8: MANDATORY kind discriminator — policy-engine push is "attention"
				// so the notification listener can distinguish it from dep-watcher
				// auto_unblock events (concept hard rule #6).
				kind: "attention",
				message: `Item ${itemId} requires attention`,
				timestamp: Date.now(),
			};
			eventBus.emit(notification);
			break;
		}
	}
}
