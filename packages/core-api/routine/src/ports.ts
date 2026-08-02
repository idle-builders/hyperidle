import type {
	AgentWorkIntent,
	Bet,
	HyperIdleDb,
	NewItem,
	NewThread,
	Team,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type {
	BakedFilesystemForProvisioning,
	BakedWorkIntentRequest,
	EventBus,
	ModelGatewayConfig,
	SessionKnowledgeItemLike,
} from "@hyperidle/shared";

/**
 * AU21 §9 Increment 4 — the routine scheduler (relocated from
 * `@hyperidle/dispatch`, see `routine-scheduler.ts`) is a `@hyperidle/routine`
 * Service; per Mechanism C (`composition-boundary-guard`, mechanically
 * enforced, no allowlist) a Service package may depend on nothing but
 * `@hyperidle/db`/`@hyperidle/shared` — every OTHER Service it needs
 * (`work`/`conversation`/`knowledge`/`settings`, all core-api same-layer) is
 * an injected port here, exactly like `DispatchPorts` used to carry them.
 * `workIntents`/`cost` are the two genuinely against-grain
 * (`core-api → agent-orchestration`) dependencies
 * (`@hyperidle/session-requests`/`@hyperidle/cost`). All are wired at the
 * composition root, `packages/core-api/src/services/
 * routine-scheduler-bindings.ts` — never imported directly here.
 *
 * @lore AU21 §9 Increment 5: the `review` field (`createPracticeMeeting`, the
 * builtin practice-meeting routine's sole dependency) is deleted along with
 * the routine itself (AC #7) — no other capability in this package ever
 * needed a `review` edge.
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
	readonly settings: {
		readServerConfig(db: HyperIdleDb): Promise<{
			readonly cost: { readonly capMinor: number };
			readonly modelGateway?: ModelGatewayConfig;
			/**
			 * AU21 §9 Increment 12 (Decision H3), Wave E — widened so
			 * `fireGenericRoutine` can forward this SAME read into
			 * `resolveRoutineRunRequest`'s `readServerConfig` dep for the
			 * `harnessDisabled` bake, instead of a second `settings` read.
			 */
			readonly harnessDisabled: readonly string[];
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
				/** See `BakedWorkIntentRequest`. Populated at emit time by `routine-service.ts`'s `resolveRoutineRunRequest` (AU21 Increment 4). */
				readonly bakedRequest?: BakedWorkIntentRequest;
			},
		): Promise<AgentWorkIntent>;
	};
	readonly cost: { getFactoryCostActual(db: HyperIdleDb): Promise<number> };
	/**
	 * AU21 §9 Increment 4, Wave B — the `routine_run` emit-time resolver's own
	 * deps (`resolveRoutineRunRequest`'s `RoutineRunResolverDeps`), injected
	 * here so `fireGenericRoutine` can fold resolution into its own emit
	 * transaction. Same Mechanism C shape as every other field on this
	 * interface — `agentSelection` (capacity + delegate selection) and
	 * `requireRunnableAgent` (the shared ast-`<userId>` invariant) are both
	 * cross-Service from this package's point of view.
	 */
	readonly agentSelection: {
		isAtCapacity(db: HyperIdleDb, agentId: string): Promise<boolean>;
		selectAgent(input: {
			readonly surface: "routine_delegate";
			readonly db: HyperIdleDb;
			readonly teamId: string | null;
			readonly workKey: string;
			readonly excludeAgentId: string;
			readonly skillId: string;
		}): Promise<{ readonly agentId: string | null }>;
	};
	/**
	 * Widened `Promise<unknown>` → `Promise<User>` in Increment 12 Wave B (H2
	 * precedent, matching `RoutineRunResolverDeps`'s own widening) — the real
	 * wired implementation (`@hyperidle/users`' `requireRunnableAgent`,
	 * `routine-scheduler-bindings.ts:149`) already returns `Promise<User>`; this
	 * is a type-only widening, no behavior change.
	 */
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	/**
	 * AU21 §9 Increment 12 (Decision H3) — optional: not yet wired at the
	 * composition root (`routine-scheduler-bindings.ts`) — that wiring, plus
	 * `fireGenericRoutine`'s own forwarding of these two fields into
	 * `resolveRoutineRunRequest`'s deps, is a later wave. Declared here so this
	 * interface can carry them once wired, matching `RoutineRunResolverDeps`'s
	 * shape exactly.
	 */
	getTeamById?(db: HyperIdleDb, id: string): Promise<Team | undefined>;
	assembleSessionKnowledge?(
		db: HyperIdleDb,
		input: {
			readonly teamId: string;
			readonly agentRole: string;
			readonly taskDescription: string;
		},
	): Promise<readonly SessionKnowledgeItemLike[]>;
	/**
	 * AU21 §9 Increment 12 follow-up (F2 gap closure) — optional:
	 * `@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent`, injected
	 * (Mechanism C — `@hyperidle/routine` cannot import `@hyperidle/filesystems`
	 * directly) for the `injectedFilesystems` bake `resolveRoutineRunRequest`
	 * forwards onto every `routine_run` request.
	 */
	resolveInjectedFilesystemsForAgent?(
		db: HyperIdleDb,
		agentId: string,
	): Promise<readonly BakedFilesystemForProvisioning[]>;
}
