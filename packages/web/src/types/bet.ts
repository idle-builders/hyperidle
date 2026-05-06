/**
 * L16: BetDetail is the shape the WorkBet page consumes. It MIRRORS —
 * but is not literally — the `bets` row from the API; if the wire shape
 * diverges, this type is the page-side normalisation surface.
 *
 * @lore L16: BetDetail lives here (not in __fixtures__, not in WorkBet.tsx,
 * not in packages/shared) because it is a page-shape type, not a wire type.
 * The fixtures file imports the type from here. The runtime page imports it
 * from here. The hook imports it from here. All non-fixture imports are clean.
 */

import type { BetStatus, SessionOutcome, TaskState } from "@hyperidle/shared";

/**
 * @deprecated L18: BetComment is replaced by the L1 Thread primitive.
 * `HostThreadSection hostKind="bet"` renders the real thread.
 * This type is kept temporarily to avoid breaking any callers that have
 * not been updated yet; delete after the next cleanup pass.
 */
export interface BetComment {
	id: string;
	author: string;
	body: string;
}

export interface BetDetail {
	id: string;
	title: string;
	product: string;
	team: string;
	status: BetStatus;
	appetite: string;
	progress: { done: number; total: number };
	/** Markdown pitch body (renamed from 'body' in L16). */
	pitch: string;
	tasks: Array<{
		id: string;
		title: string;
		owner: string;
		state: TaskState;
		cost: string;
		// L19: latest session metadata (nullable — no session yet)
		latestSessionOutcome?: SessionOutcome | null;
		latestSessionCost?: number | null;
		latestSessionTokensInput?: number | null;
		latestSessionTokensOutput?: number | null;
		latestSessionHarnessUrl?: string | null;
	}>;
}
