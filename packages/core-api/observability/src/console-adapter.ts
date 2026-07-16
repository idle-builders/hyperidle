import { createLogger, type Logger, type ObservabilityEvent } from "@hyperidle/shared";
import type { ObservabilityAdapter } from "./types.js";

/**
 * Emits one structured log line per event through the shared logger.
 * The shared logger already produces JSON-shaped lines with an
 * `msg` + `pkg` + `ts` prefix and the `extra` payload serialized via
 * `JSON.stringify`. We never use `console.log` directly — the logger is
 * the single process-wide stdout sink.
 */
export function createConsoleObservabilityAdapter(logger?: Logger): ObservabilityAdapter {
	const log = logger ?? createLogger({ pkg: "observability" });
	return {
		name: "console",
		record(events: readonly ObservabilityEvent[]): Promise<void> {
			for (const ev of events) {
				log.info(ev.kind, serialize(ev));
			}
			return Promise.resolve();
		},
		flush(): Promise<void> {
			return Promise.resolve();
		},
	};
}

/**
 * Strip the `kind` discriminant from the extra payload (it's already
 * the `msg`) and unwrap readonly arrays/records into a plain object so
 * the logger's JSON.stringify path is stable.
 */
function serialize(ev: ObservabilityEvent): Record<string, unknown> {
	const out: Record<string, unknown> = {
		traceId: ev.traceId,
		sessionId: ev.sessionId,
		ts: ev.ts,
	};
	switch (ev.kind) {
		case "session_started":
			out.agentId = ev.agentId;
			out.taskId = ev.taskId;
			break;
		case "session_ended":
			out.agentId = ev.agentId;
			out.taskId = ev.taskId;
			out.outcome = ev.outcome;
			break;
		case "tool_call":
			out.toolName = ev.toolName;
			out.argsSummary = ev.argsSummary;
			break;
		case "cost_incurred":
			out.level = ev.level;
			out.capLevel = ev.capLevel;
			out.entityId = ev.entityId;
			out.spend = ev.spend;
			out.cap = ev.cap;
			break;
		case "task_state_changed":
			out.taskId = ev.taskId;
			out.fromState = ev.fromState;
			out.toState = ev.toState;
			break;
		case "bet_state_changed":
			out.betId = ev.betId;
			out.fromState = ev.fromState;
			out.toState = ev.toState;
			break;
		case "knowledge_write":
			out.itemId = ev.itemId;
			out.action = ev.action;
			break;
	}
	return out;
}
