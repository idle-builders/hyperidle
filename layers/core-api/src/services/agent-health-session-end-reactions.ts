/**
 * AU26 — the degraded-agent notification, event-driven.
 *
 * Founder ruling: *"shouldn't the notification system anyhow allow to be event
 * based and then the notification system just keeps track of how many of the
 * notification events it got from the orchestration that something broke and
 * the notification system then just say 5 notification about this in the last 7
 * days"*.
 *
 * This module is the literal replacement for `routes/teams-routes.ts`'s deleted
 * `maybeNotifyAgentError`. That producer had two faults the ruling fixes at
 * once: it only ran when a human happened to open the team page (so a crash at
 * 03:00 notified nobody until someone looked), and it made a GET perform a
 * write. Deleting it also removed the route's batched `sessions` read — the
 * last core-api read of an `agent-orchestration` table, and AU26's remaining
 * acceptance criterion.
 *
 * Shape copied from `work-session-end-reactions.ts`: a per-eventBus-instance
 * `registeredBuses` WeakSet idempotency guard, and the explicit
 * `register*(db, eventBus)` wiring convention wired at `service-bootstrap.ts`.
 *
 * ## The rule changed, deliberately
 *
 * The old trigger was a RATIO — `failureRate7d > 0.5 || lastSessionCrashed`
 * (`deriveHealthLevel`, `framework/shared/src/agent-run-view.ts`), computed from
 * the agent's raw run rows. A ratio is structurally unexpressible here: the
 * notification system is told when a run CRASHES and is never told when one
 * succeeds, so it has no denominator and must never invent one. With founder
 * approval the rule becomes a COUNT:
 *
 *     notify once an agent has AGENT_FAILURE_NOTIFY_THRESHOLD crashed runs
 *     inside AGENT_FAILURE_WINDOW_DAYS.
 *
 * `deriveHealthLevel` / `computeHealthSignals` / `deriveHealthDetail` stay in
 * `@hyperidle/shared` untouched — the team page still uses them for its own
 * health dots, computed browser-side from `agent-orchestration`'s own API. What
 * changed is what drives the NOTIFICATION, not what drives the screens.
 *
 * ## Why every crash is written down, even the ones nobody sees
 *
 * The count is taken over `notification_queue` rows — the notification system
 * counting its own events, no new table and no tally state, exactly as the
 * ruling describes. That only works if every crash leaves a row: if a row were
 * written only when we notify, the count could never climb past zero and a
 * threshold above 1 would be unreachable. So a crash below the threshold is
 * RECORDED as a retired row — `status: "dropped"` (the queue's existing "in the
 * queue, never delivered" terminal state, already used by the enqueue cap
 * eviction) with `readAt`/`seenAt` stamped at insert.
 *
 * @lore AU26: the `readAt`/`seenAt` stamp is load-bearing, not cosmetic. The
 * inbox popover reads `readAt IS NULL` with NO status filter
 * (`listNotifications({kind:"unread"})` → `routes/notifications-routes.ts` GET
 * /inbox), so an unstamped ledger row would show up in the user's inbox as a
 * real notification. Stamping both makes the row invisible to every delivery
 * surface — the dispatcher only claims `status = 'pending'`, the digest only
 * reads pending, the popover only reads unread — while it still counts. The
 * retention reaper GCs it with the other terminal rows at
 * `TERMINAL_LOG_TTL_MS` = 30 days, comfortably outside the 7-day window.
 *
 * @lore AU26: the read-then-insert count is NOT transactional, so two crashes
 * landing at the same instant can both read the same count. This is the exact
 * race the deleted `maybeNotifyAgentError` had (it too did a check-then-insert
 * dedup probe), and the consequence is bounded and benign: at worst one
 * duplicate pending row, which the throttle collapses on the next crash. A
 * lock was rejected as machinery the product does not need.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { enqueue, listNotifications } from "@hyperidle/notifications";
import { getTeam, getTeamMembers } from "@hyperidle/org";
import type { EventBus, SessionEndedEvent } from "@hyperidle/shared";
import { createLogger } from "@hyperidle/shared";
import { findUser } from "@hyperidle/users";

const logger = createLogger({ pkg: "core-api.agent-health-session-end-reactions" });
const registeredBuses = new WeakSet<EventBus>();

/** The queue `eventType` this reaction both writes and counts. */
export const AGENT_HEALTH_DEGRADED_EVENT_TYPE = "agent.health.degraded";

/**
 * The window the count is taken over. Kept at 7 days so the notification says
 * the same thing the team page's own health dots say — `computeHealthSignals`
 * is a 7-day view too.
 */
export const AGENT_FAILURE_WINDOW_DAYS = 7;

/**
 * How many crashed runs inside the window surface a notification.
 *
 * Three, not one. Going event-driven removed an accidental throttle: the old
 * producer only ran when someone opened the team page, so in practice most
 * crashes never notified at all. Firing on every single crash instead would be
 * strictly noisier than what shipped, and one crashed run is ordinary
 * operational weather — a dropped connection, a harness hiccup, a rate limit.
 * Three inside a week is not weather, it is a pattern, and a pattern is the
 * only thing worth interrupting a human for. The first two are still written
 * down; they simply do not ring the bell.
 */
export const AGENT_FAILURE_NOTIFY_THRESHOLD = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * "Agent Ada on team Hearth" when the agent is on a team, "Agent Ada" when the
 * lookup cannot resolve one. Preserves the subject line the deleted
 * `maybeNotifyAgentError` produced from its roster context.
 */
async function describeAgent(
	db: HyperIdleDb,
	agentId: string,
): Promise<{ readonly name: string; readonly teamName: string | null } | undefined> {
	const agent = await findUser(db, { id: agentId });
	if (!agent) return undefined;
	if (!agent.teamId) return { name: agent.name, teamName: null };
	const memberGroup = await getTeamMembers(db, { id: agent.teamId });
	if (!memberGroup) return { name: agent.name, teamName: null };
	const team = await getTeam(db, { id: memberGroup.teamId });
	return { name: agent.name, teamName: team?.name ?? null };
}

async function recordAgentFailure(db: HyperIdleDb, agentId: string): Promise<void> {
	const agent = await describeAgent(db, agentId);
	if (!agent) {
		logger.warn("crashed run for an unknown agent — not recorded", { agentId });
		return;
	}

	const now = new Date();
	const since = new Date(now.getTime() - AGENT_FAILURE_WINDOW_DAYS * MS_PER_DAY).toISOString();

	// The notification system counting its own events. `+ 1` is this crash.
	const priorFailures = await listNotifications(db, {
		kind: "by-event-since",
		eventType: AGENT_HEALTH_DEGRADED_EVENT_TYPE,
		subjectId: agentId,
		since,
	});
	const failureCount = priorFailures.length + 1;

	// The preserved throttle: never stack a second notification while one is
	// still pending. The crash is recorded either way.
	const [alreadyPending] = await listNotifications(db, {
		kind: "pending-by-event",
		eventType: AGENT_HEALTH_DEGRADED_EVENT_TYPE,
		subjectId: agentId,
	});
	const surface = failureCount >= AGENT_FAILURE_NOTIFY_THRESHOLD && alreadyPending === undefined;

	const nowIso = now.toISOString();
	const subject = agent.teamName === null ? agent.name : `${agent.name} on team ${agent.teamName}`;
	await enqueue(db, {
		id: crypto.randomUUID(),
		eventType: AGENT_HEALTH_DEGRADED_EVENT_TYPE,
		subjectId: agentId,
		severity: "blocking",
		title: `Agent ${agent.name} needs attention`,
		body: `${subject}: ${failureCount} failures in the last ${AGENT_FAILURE_WINDOW_DAYS} days`,
		reason: "agent_health_transition",
		channel: null,
		status: surface ? "pending" : "dropped",
		attempts: 0,
		createdAt: nowIso,
		// Ledger-only rows are born retired — see the @lore above.
		...(surface ? {} : { readAt: nowIso, seenAt: nowIso }),
	});
}

function reactToSessionEnded(db: HyperIdleDb, event: SessionEndedEvent): Promise<void> | undefined {
	if (event.outcome !== "crashed") return undefined;
	return recordAgentFailure(db, event.agentId);
}

/**
 * Register core-api's crashed-run health reaction on `eventBus`. Returns an
 * unsubscribe function. Safe to call more than once with the SAME `eventBus`
 * instance — only the first registration takes effect.
 */
export function registerAgentHealthSessionEndReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("session_ended", (event) => {
		void reactToSessionEnded(db, event)?.catch((error: unknown) => {
			logger.error("session_ended agent-health reaction failed", {
				sessionId: event.sessionId,
				agentId: event.agentId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}
