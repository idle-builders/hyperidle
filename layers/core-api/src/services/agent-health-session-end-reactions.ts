/**
 * The degraded-agent notice, event-driven.
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
 * last core-api read of an `agent-orchestration` table, and the remaining
 * acceptance criterion.
 *
 * Shape copied from `work-session-end-reactions.ts`: a per-eventBus-instance
 * `registeredBuses` WeakSet idempotency guard, and the explicit
 * `register*(db, eventBus)` wiring convention wired at `service-bootstrap.ts`.
 *
 * ## The notification queue is gone — this writes `health` now
 *
 * The old trigger was a RATIO — `failureRate7d > 0.5 || lastSessionCrashed`
 * (`deriveHealthLevel`, `framework/domain-model/src/agent-run-view.ts`), computed from
 * the agent's raw run rows; the team page's own health dots still compute it
 * that way, browser-side, off `agent-orchestration`'s own API — untouched
 * here. What this reaction drives is the NOTICE, and the notice moved onto
 * the user module: a crashed session writes `edit_user({ id: agentId,
 * health })`, which lands as an ordinary `user.changed` change row. Whoever
 * subscribes to `user.changed` in reach (the agent's owner, its team) sees
 * it, the same door a mention uses — no separate notification vocabulary,
 * no queue.
 *
 * Every crash writes a `health` note — no threshold decides whether it is
 * written. The note text carries how many crashes happened in the trailing
 * 7-day window, so a human reading it sees "N failures in 7 days".
 *
 * @lore review fix: the count used to be EVERY `user` change row on the
 * agent in the window — a plain rename or a team move counted as a
 * "failure" alongside an actual crash. This reaction is the only writer of
 * `health` on an `edit_user` call (grep confirms no UI or route sets it),
 * so `after.health` present on a row is exactly "this row is one of this
 * reaction's own crash notes" — the filter below counts only those.
 */

import { listChanges } from "@hyperidle/changes";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus, SessionEndedEvent } from "@hyperidle/event-bus";
import { findUser, getTeam } from "@hyperidle/user";
import type { ActionContext, EditUserRunFn } from "../actions/action.js";

export type { EditUserRunFn };

const logger = createLogger({ pkg: "core-api.agent-health-session-end-reactions" });
const registeredBuses = new WeakSet<EventBus>();

/**
 * The window the count is taken over. Kept at 7 days so the notice says the
 * same thing the team page's own health dots say — `computeHealthSignals`
 * is a 7-day view too.
 */
export const AGENT_FAILURE_WINDOW_DAYS = 7;

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
	// @lore AU44 B1: agent.teamId now references teams.id directly (no two-hop).
	const team = await getTeam(db, { id: agent.teamId });
	return { name: agent.name, teamName: team?.name ?? null };
}

async function recordAgentFailure(
	db: HyperIdleDb,
	eventBus: EventBus,
	editUser: EditUserRunFn,
	agentId: string,
	now: Date,
): Promise<void> {
	const agent = await describeAgent(db, agentId);
	if (!agent) {
		logger.warn("crashed run for an unknown agent — not recorded", { agentId });
		return;
	}

	const since = new Date(now.getTime() - AGENT_FAILURE_WINDOW_DAYS * MS_PER_DAY).toISOString();
	// This reaction's own prior crash notes in the window — not every `user`
	// change row (a rename or a team move is not a crash). `after` is the
	// change row's JSON-encoded diff; `health` is present on it only when a
	// call set `health`, which only this reaction does. `+ 1` is this crash.
	const priorChanges = await listChanges(db, { object: "user", objectId: agentId, after: since });
	const priorCrashNotes = priorChanges.filter((c) => {
		const after = JSON.parse(c.after) as Record<string, unknown>;
		return after.health !== undefined;
	});
	const failureCount = priorCrashNotes.length + 1;

	const subject = agent.teamName === null ? agent.name : `${agent.name} on team ${agent.teamName}`;
	const health = `${subject}: ${failureCount} failures in the last ${AGENT_FAILURE_WINDOW_DAYS} days`;

	// `eventBus` MUST be the real, shared bus this reaction was registered on
	// — `edit_user` emits `user.changed` straight off `ctx.eventBus`
	// (`user-actions.ts`), so a throwaway instance here would silently drop
	// the wake every subscriber in reach depends on.
	const ctx: ActionContext = { actor: agentId, db, eventBus, now: now.toISOString() };
	const result = await editUser(ctx, { id: agentId, health });
	if (!result.ok) {
		logger.error("failed to write agent health", {
			agentId,
			problems: result.problems,
		});
	}
}

function reactToSessionEnded(
	db: HyperIdleDb,
	eventBus: EventBus,
	editUser: EditUserRunFn,
	event: SessionEndedEvent,
): Promise<void> | undefined {
	if (event.outcome !== "crashed") return undefined;
	return recordAgentFailure(db, eventBus, editUser, event.agentId, new Date(event.timestamp));
}

/**
 * Register core-api's crashed-run health reaction on `eventBus`. Returns an
 * unsubscribe function. Safe to call more than once with the SAME `eventBus`
 * instance — only the first registration takes effect.
 */
export function registerAgentHealthSessionEndReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
	editUser: EditUserRunFn,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {
			// Already registered for this bus — nothing new to dispose.
		};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("session_ended", (event) => {
		void reactToSessionEnded(db, eventBus, editUser, event)?.catch((error: unknown) => {
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
