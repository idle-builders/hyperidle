/**
 * @hyperidle/api-contract — type-only API contract definitions.
 *
 * Created by M2 (replacement contracts architecture pass). These types pin
 * the wire shapes for API endpoints so server and client stay in sync.
 * No runtime code — only TypeScript interfaces and type aliases.
 */

export type {
	// Sub-port interfaces reachable as AgentOrchestrationPort["<member>"] —
	// not named-imported by anyone; removed from barrel, kept in source.
	AgentOrchestrationAddFolderResult,
	// BC5 §6 (T4): folders/connections — named imports on both sides of the seam.
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
// @lore BC5 T11: `CoreApiPort` and every type it carried
// (`CoreApiOrgPort`/`CoreApiTransport`/`CoreApiUsersPort`/`CreateOrgTeamRequest`/
// `OrgTeamMembershipView`/`OrgTeamView`/`PersistScaffoldedAgentsResponse`/
// `ScaffoldFromRequestInput`/`UpdateOrgTeamRequest`/`UserView`) are DELETED —
// `create_team`/`add_agent`, the seam's last two tools, are gone with the
// `org` package they wrote through. Only the wire-protocol header both sides
// of that seam agreed on survives, moved to its own file.
export { CORE_API_ACTOR_OVERRIDE_HEADER } from "./actor-override-header.js";
