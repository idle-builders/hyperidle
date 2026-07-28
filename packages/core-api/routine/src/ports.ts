import type {
	AgentWorkIntent,
	Bet,
	HyperIdleDb,
	NewItem,
	NewThread,
	WriteExecutor,
} from "@hyperidle/db";
import type { EventBus, ModelGatewayConfig } from "@hyperidle/shared";

/**
 * AU21 §9 Increment 4 — the routine scheduler (relocated from
 * `@hyperidle/dispatch`, see `routine-scheduler.ts`) is a `@hyperidle/routine`
 * Service; per Mechanism C (`composition-boundary-guard`, mechanically
 * enforced, no allowlist) a Service package may depend on nothing but
 * `@hyperidle/db`/`@hyperidle/shared` — every OTHER Service it needs
 * (`work`/`conversation`/`knowledge`/`review`/`settings`, all core-api
 * same-layer) is an injected port here, exactly like `DispatchPorts` used to
 * carry them. `workIntents`/`cost` are the two genuinely against-grain
 * (`core-api → agent-orchestration`) dependencies
 * (`@hyperidle/session-requests`/`@hyperidle/cost`). All are wired at the
 * composition root, `packages/core-api/src/services/
 * routine-scheduler-bindings.ts` — never imported directly here.
 */
export interface RoutineSchedulerPorts {
	readonly work: {
		getBetById(db: HyperIdleDb, id: string): Promise<Bet | undefined>;
		createItem(exec: WriteExecutor, values: NewItem): Promise<void>;
		findRetroItemByThreadIds(
			db: HyperIdleDb,
			threadIds: string[],
			marker: string,
		): Promise<{ readonly id: string } | undefined>;
	};
	readonly conversation: {
		getThreadIdsByHost(db: HyperIdleDb, hostKind: string, hostId: string): Promise<string[]>;
		insertThread(db: HyperIdleDb, values: NewThread): Promise<void>;
	};
	readonly knowledge: {
		runAutoPromotionSweep(
			db: HyperIdleDb,
			eventBus: EventBus,
		): Promise<{
			readonly promotedIds: readonly string[];
			readonly flaggedForReviewIds: readonly string[];
			readonly skippedIds: readonly string[];
			readonly scanned: number;
		}>;
		runStaleSweep(
			db: HyperIdleDb,
			eventBus: EventBus,
			nowMs: number,
			thresholdMs: number | undefined,
			options: { readonly silent: boolean },
		): Promise<{ readonly markedIds: readonly string[] }>;
		listRecentByLayers(
			db: HyperIdleDb,
			layers: readonly string[],
			updatedSince: string,
		): Promise<
			readonly {
				readonly title: string;
				readonly updatedAt: string;
				readonly layer: string | null;
			}[]
		>;
		recomputeAttentionForCandidates(
			db: HyperIdleDb,
			eventBus: EventBus,
			candidateIds: readonly string[],
		): Promise<
			| { readonly ok: true }
			| { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
		>;
	};
	readonly review: {
		createPracticeMeeting(
			db: HyperIdleDb,
			input: { readonly scopeId: string; readonly title: string; readonly nowMs: number },
		): Promise<{ readonly meetingId: string }>;
	};
	readonly settings: {
		readServerConfig(db: HyperIdleDb): Promise<{
			readonly cost: { readonly capMinor: number };
			readonly modelGateway?: ModelGatewayConfig;
		}>;
	};
	readonly workIntents: {
		enqueueWorkIntent(
			exec: WriteExecutor,
			input: {
				readonly kind: "routine_run";
				readonly sourceKind: "routine_run";
				readonly sourceId: string;
				readonly requestedBy?: string;
				readonly idempotencyKey: string;
			},
		): Promise<AgentWorkIntent>;
	};
	readonly cost: { getFactoryCostActual(db: HyperIdleDb): Promise<number> };
}
