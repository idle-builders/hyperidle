import { MAX_BODY_BYTES } from "@hyperidle/shared";
import type { BetDetail } from "../types/bet";
import { FALLBACK_BET, MOCK_BETS } from "./__fixtures__/work-bet-fixtures";
import { WorkBet } from "./WorkBet";

export default { title: "Page: Work/Bet" };

export const KnownBet = (): React.JSX.Element => <WorkBet overrideBet={MOCK_BETS.b1} />;

export const ShapedBet = (): React.JSX.Element => <WorkBet overrideBet={MOCK_BETS.b2} />;

export const UnknownBet = (): React.JSX.Element => <WorkBet overrideBet={FALLBACK_BET} />;

export const Loading = (): React.JSX.Element => <WorkBet loading />;

/**
 * WithRichPitch — exercises H1, H2, paragraph, unordered list,
 * fenced code block, blockquote, table, and divider in a single pitch.
 */
export const WithRichPitch = (): React.JSX.Element => <WorkBet overrideBet={MOCK_BETS.b_rich} />;

/** EmptyPitch — pitch field is empty string; the pitch section must not render. */
export const EmptyPitch = (): React.JSX.Element => (
	<WorkBet overrideBet={{ ...MOCK_BETS.b1, pitch: "" }} />
);

/**
 * MalformedPitch — pitch content that maps to an unknown block kind.
 * Uses content sized over MAX_BODY_BYTES to trigger the body-too-large
 * unknown block path, exercising the UnknownPayload fallback visually.
 * Sized at cap + 1 byte to stay as small as possible while reliably
 * triggering the fallback.
 */
const MALFORMED_BET: BetDetail = {
	...MOCK_BETS.b1,
	id: "b_malformed",
	title: "Malformed Pitch (body-too-large fallback)",
	// Slightly over MAX_BODY_BYTES triggers the body-too-large unknown block.
	pitch: "x".repeat(MAX_BODY_BYTES + 1),
};

export const MalformedPitch = (): React.JSX.Element => <WorkBet overrideBet={MALFORMED_BET} />;

/**
 * L14 action bar stories — verify each status exposes the correct set of action buttons.
 *
 * @lore L14: BetActionsBar is co-located in WorkBet.tsx. These stories exercise
 * each status bucket so the action bar states can be verified visually at /designsystem.
 */

/** InProgress — Pause, Kill, Adjust Appetite are shown. Resume is hidden. */
export const InProgressActions = (): React.JSX.Element => (
	<WorkBet overrideBet={MOCK_BETS.b_in_progress} />
);

/** Paused — Resume, Kill, Adjust Appetite are shown. Pause is hidden. */
export const PausedActions = (): React.JSX.Element => <WorkBet overrideBet={MOCK_BETS.b_paused} />;

/**
 * Blocked — Unblock, Kill, Adjust Appetite are shown. Pause is NOT shown.
 * @lore L14: blocked → paused is not a valid state machine transition.
 */
export const BlockedActions = (): React.JSX.Element => (
	<WorkBet overrideBet={MOCK_BETS.b_blocked} />
);

/** Behind — Pause, Kill, Adjust Appetite are shown (same as in_progress). */
export const BehindActions = (): React.JSX.Element => <WorkBet overrideBet={MOCK_BETS.b_behind} />;
