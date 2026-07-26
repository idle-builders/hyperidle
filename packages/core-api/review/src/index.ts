/**
 * Barrel for @hyperidle/review (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `proposedCalls`/`operationOutcomes`/`tailoredGrants` pgTable objects — that
 * would let a consumer obtain a table transitively and defeat Table ACL
 * (Mechanism A). Consumers get typed functions; the tables stay private to
 * this Service.
 *
 * @lore AU20 Am9: collapsed from 48 exports to ~13. The practice-meeting
 * workflow (11 exports) relocated to `@hyperidle/knowledge` (its actual data
 * owner). The `PracticeMeetingKnowledgeStore` port + 9 `Raw*` mirror types
 * (~14 exports) evaporated with it. The residual fragmentation — 3 use-case
 * finders + 4 use-case mutators + 8 individual DI-port types — collapsed to
 * `findProposedCall`/`recordProposedCall`/`transitionProposedCall` (one
 * state machine) + `createReviewItem`/`registerReviewSubscriptions` (one
 * boot entry-point) + `ReviewPorts` (one composite deps bag).
 *
 * @lore AU19 Increment 1j: `proposedCalls`/`operationOutcomes`/`tailoredGrants`
 * are `review`'s confirmed owned table set (Table ACL, Mechanism A).
 *
 * @lore AU19 Increment 1k: `taskPlanningSignals`'s real owner is `work`;
 * `review` reads it through `ReviewPorts.work.getRiskTierByTaskId`.
 *
 * @lore AU19 Increment 5 item 4 (review sub-item): `findProposedCall` subsumes
 * the `routes/threads.ts` verdict-handler's raw `proposedCalls` access that was
 * added to close the Table ACL violation in that increment.
 */

// -- composite DI-port bag + recorder payload type --
export type { ReviewAgentWorkIntentInput, ReviewPorts } from "./ports.js";
// -- proposed-call state machine (AL7 trust-first two-session loop) --
export type {
	ProposedCallQuery,
	ProposedCallTransition,
	ProposedCallView,
} from "./proposed-call-workflow.js";
export {
	findProposedCall,
	recordProposedCall,
	transitionProposedCall,
} from "./proposed-call-workflow.js";
// -- review-item creator (attention-engine knowledge-review items) --
export type { CreateReviewItemInput, CreateReviewItemResult } from "./review-item-factory.js";
export { attentionReviewReasoningMarker, createReviewItem } from "./review-item-factory.js";
// -- subscription registrar (session_ended → review item + liveness net) --
export { registerReviewSubscriptions } from "./session-review-creator.js";
