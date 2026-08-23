/**
 * L16: BetDetail is the shape the WorkBet page consumes. It MIRRORS —
 * but is not literally — the `bets` row from the API; if the wire shape
 * diverges, this type is the page-side normalisation surface.
 *
 * @lore L16: BetDetail lives here (not in __fixtures__, not in WorkBet.tsx,
 * not in framework/domain-model) because it is a page-shape type, not a wire type.
 * The fixtures file imports the type from here. The runtime page imports it
 * from here. The hook imports it from here. All non-fixture imports are clean.
 */

import type {
	BetOutcomeVerdict,
	BetStatus,
	SessionOutcome,
	TaskOutcomeVerdict,
	TaskState,
	TokenUsage,
} from "@hyperidle/domain-model";

/**
 * @lore AU21 Increment 14a: `costAppetite`/`costActual` (bet-level, WireMoney|null)
 * and `tasks[].costActual` are HARD-DELETED along with the rest of the
 * cost-cap/accounting feature — the backing DB columns are dropped, no
 * replacement. `tokenAppetite`/`tokensActual` are a separate, non-cost
 * concern (token usage) and are untouched.
 */
export interface BetDetail {
	id: string;
	title: string;
	team: string;
	/** AK3: team id used by the "Add an agent" recovery link (→ /work/team/:teamId). */
	teamId?: string;
	status: BetStatus;
	/** @lore U5: atRisk boolean added; signals the bet is at risk of missing its appetite. */
	atRisk: boolean;
	tokenAppetite: TokenUsage | null;
	tokensActual: TokenUsage | null;
	/** AF16 T1: optional for API older shape (older API may omit progress). */
	progress?: { done: number; total: number };
	/** Markdown description body (renamed from 'pitch' in L16, aligned with API in T3). */
	description: string;
	/** AC2: The bet hypothesis text. Null if no hypothesis was recorded. */
	hypothesis?: string | null;
	/** AC1: Structured bet outcome verdict. Null = not evaluated. */
	outcomeVerdict?: BetOutcomeVerdict | null;
	/** AC1: Free-text explanation of the outcome. */
	outcomeSummary?: string | null;
	/** AC1: ISO 8601 timestamp when the outcome was last recorded. */
	outcomeRecordedAt?: string | null;
	/** AC1: User ID of the actor who last recorded the outcome. */
	outcomeRecordedBy?: string | null;
	/**
	 * AK5: provenance backlink — the knowledge item this bet was promoted from.
	 * null = hand-typed / assistant-drafted bet (no source).
	 * Absent on legacy bets that predate AK5 (treated identically to null by UI).
	 */
	sourceKnowledge?: { id: string; title: string } | null;
	tasks: Array<{
		id: string;
		title: string;
		owner: string;
		state: TaskState;
		// L19: latest session metadata (nullable — no session yet)
		latestSessionOutcome?: SessionOutcome | null;
		latestSessionHarnessUrl?: string | null;
		latestSessionModelTier?: string | null;
		/**
		 * M3 D4: agent participant id for HostThreadSection on the per-task thread.
		 * Null means no agent assigned.
		 */
		ownerAgentId?: string | null;
		/** W3 AC-28: ISO timestamp when this task was started (from API). */
		startedAt?: string | null;
		/** AC1: Task outcome verdict. Null = not evaluated. */
		outcomeVerdict?: TaskOutcomeVerdict | null;
	}>;
}
