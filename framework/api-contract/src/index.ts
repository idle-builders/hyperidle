/**
 * @hyperidle/api-contract — type-only API contract definitions.
 *
 * Created by M2 (replacement contracts architecture pass). These types pin
 * the wire shapes for API endpoints so server and client stay in sync.
 * No runtime code — only TypeScript interfaces and type aliases.
 */

// Orchestration reaches core only through actions; the actor-override header
// is the one wire constant both sides share.
export { CORE_API_ACTOR_OVERRIDE_HEADER } from "./actor-override-header.js";
export type {
	// Sub-port interfaces reachable as AgentOrchestrationPort["<member>"] —
	// not named-imported by anyone; removed from barrel, kept in source.
	AgentOrchestrationAddFolderResult,
	// folders/connections — named imports on both sides of the seam.
	AgentOrchestrationConnectionCreateInput,
	AgentOrchestrationConnectionsListView,
	AgentOrchestrationConnectionView,
	AgentOrchestrationCreateConnectionResult,
	AgentOrchestrationFolderCreateInput,
	AgentOrchestrationFolderListQuery,
	AgentOrchestrationFolderView,
	AgentOrchestrationPersistInjectionResult,
	AgentOrchestrationPort,
	AgentOrchestrationRemoveResult,
	AgentOrchestrationReviewVerdictInput,
	AgentOrchestrationReviewVerdictOutcome,
	AgentOrchestrationRunConfigPatch,
	AgentOrchestrationRunConfigView,
	AgentOrchestrationSessionWireRow,
	AgentOrchestrationStoppedRun,
	AgentOrchestrationTransport,
	AgentOrchestrationWorkIntentInput,
	AgentOrchestrationWorkIntentKind,
	AgentOrchestrationWorkIntentReceipt,
} from "./agent-orchestration-port.js";
