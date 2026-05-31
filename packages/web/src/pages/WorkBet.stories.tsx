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
 * WithRichDescription — exercises H1, H2, paragraph, unordered list,
 * fenced code block, blockquote, table, and divider in a single description.
 */
export const WithRichDescription = (): React.JSX.Element => (
	<WorkBet overrideBet={MOCK_BETS.b_rich} />
);

/** EmptyDescription — description field is empty string; the pitch section must not render. */
export const EmptyDescription = (): React.JSX.Element => (
	<WorkBet overrideBet={{ ...MOCK_BETS.b1, description: "" }} />
);

/**
 * MalformedDescription — description content that maps to an unknown block kind.
 * Uses content sized over MAX_BODY_BYTES to trigger the body-too-large
 * unknown block path, exercising the UnknownPayload fallback visually.
 * Sized at cap + 1 byte to stay as small as possible while reliably
 * triggering the fallback.
 */
const MALFORMED_BET: BetDetail = {
	...MOCK_BETS.b1,
	id: "b_malformed",
	title: "Malformed Description (body-too-large fallback)",
	// Slightly over MAX_BODY_BYTES triggers the body-too-large unknown block.
	description: "x".repeat(MAX_BODY_BYTES + 1),
};

export const MalformedDescription = (): React.JSX.Element => (
	<WorkBet overrideBet={MALFORMED_BET} />
);

/**
 * @lore U1: Active bet — shows Pause, Kill, Adjust Appetite, Unblock buttons.
 */
export const ActiveActions = (): React.JSX.Element => <WorkBet overrideBet={MOCK_BETS.b_active} />;
