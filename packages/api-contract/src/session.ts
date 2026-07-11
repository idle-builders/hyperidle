export interface PendingSessionStart {
	readonly status: "pending";
	readonly startId: string;
	readonly taskId: string;
	readonly requestedAgentId: string;
	readonly requestedModelTier: "reasoning" | "workhorse" | "fast";
	readonly idempotencyKey: string;
	readonly pollUrl: `/api/sessions/starts/${string}`;
}

export type CreateSessionAcceptedResponse<TSession = Record<string, unknown>> =
	| TSession
	| PendingSessionStart;

export function isPendingSessionStart(value: unknown): value is PendingSessionStart {
	return (
		!!value && typeof value === "object" && (value as { status?: unknown }).status === "pending"
	);
}
