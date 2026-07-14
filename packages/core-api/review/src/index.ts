/**
 * Barrel for @hyperidle/review (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `proposedCalls`/`operationOutcomes`/`tailoredGrants`/`taskStrategyFabric`
 * pgTable objects — that would let a consumer obtain a table transitively
 * and defeat Table ACL (Mechanism A). Consumers get typed functions; the
 * tables stay private to this Service.
 *
 * @lore AU19 Increment 1j: this is the real cut-over — the four review
 * seed files (`review-item-factory.ts`, `session-review-creator.ts`,
 * `proposed-call-workflow.ts`, `practice-meeting.ts`) moved here from
 * `packages/server/src/services/` (behavior-preserving move; every raw
 * cross-Service table/function access became an injected DI port,
 * `ports.ts`). This closes Increment 1 — `review` was the last unmigrated
 * core-api SQL-owning Service in the list.
 *
 * Table ownership confirmed (architecture §4's `⛁*` "review ⛁* reviews /
 * proposed-calls (confirm table at migration)"): there is no dedicated
 * `reviews` table — the AL7 trust-first proposed-call/tailored-grant/
 * operation-outcome trio (`proposedCalls`/`tailoredGrants`/
 * `operationOutcomes`) IS the confirmed owned table set, plus
 * `taskStrategyFabric` (session-review-creator.ts's risk-tier read — its
 * only accessor anywhere in the repo).
 */

// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	ArchiveKnowledgeItemInput,
	CapturedProjectedItem,
	KnowledgeAppProjectionRow,
	PracticeMeetingKnowledgeStore,
	RawKnowledgeAppProjectionInsert,
	RawKnowledgeEditLogInsert,
	RawKnowledgeItemInsert,
	RawKnowledgeItemRow,
	ReviewAgentWorkIntentInput,
	ReviewAgentWorkIntentKind,
	ReviewAgentWorkIntentRecord,
	ReviewAgentWorkIntentRecorder,
	ReviewConversationStore,
	ReviewOrgRouting,
	ReviewRoutingContext,
	ReviewTaskPatch,
	ReviewUserDirectory,
	ReviewWorkStore,
} from "./ports.js";
// -- practice-meeting (TRACK-G §G3: 3-turn proposal/reaction/synthesis workflow) --
export type {
	CreatePracticeMeetingInput,
	CreatePracticeMeetingResult,
	PracticeMeetingTurnInput,
	PracticeMeetingTurnResult,
	ProposalInput,
	ReactionInput,
	RunPracticeMeetingTurnInput,
	SynthesisInput,
} from "./practice-meeting.js";
export {
	createPracticeMeeting,
	PRACTICE_MEETING_ANCHOR_ROLE,
	runPracticeMeetingTurn,
} from "./practice-meeting.js";
// -- proposed-call-workflow (AL7 trust-first two-session loop) --
export type { ProposedCallWithOutcomeRow } from "./proposed-call-workflow.js";
export {
	composeTailoredGrant,
	findProposedCallWithOutcomeByReviewMessageId,
	handleUnconsumedGrantOnSessionEnd,
} from "./proposed-call-workflow.js";
// -- review-item-factory (attention-engine knowledge-review items) --
export type {
	CreateReviewItemForKnowledgeInput,
	CreateReviewItemForKnowledgeResult,
	ReviewItemFactoryDeps,
} from "./review-item-factory.js";
export {
	ATTENTION_REVIEW_SOURCE,
	attentionReviewReasoningMarker,
	buildCreateReviewItemForKnowledge,
} from "./review-item-factory.js";
// -- session-review-creator (AD1: session_ended -> review item + human routing) --
export type { SessionReviewCreatorDeps } from "./session-review-creator.js";
export { registerSessionReviewCreator } from "./session-review-creator.js";
