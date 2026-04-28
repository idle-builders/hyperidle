/**
 * L1a — `ReviewVerdictBar` stories (stub).
 */

import { ReviewVerdictBar } from "./ReviewVerdictBar.js";

export default {
	title: "ReviewVerdictBar",
	tier: "3" as const,
	order: ["Idle", "Disabled"],
};

export const Idle = (): React.JSX.Element => <ReviewVerdictBar onAction={() => {}} />;
export const Disabled = (): React.JSX.Element => (
	<ReviewVerdictBar onAction={() => {}} disabled={true} />
);
