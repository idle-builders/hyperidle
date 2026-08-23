/**
 * L1a — `Composer` stories (stub).
 */

import { Composer } from "./Composer.js";

export default {
	title: "Composer",
	tier: "3" as const,
	order: ["Default", "WithUnresolvedReviewLink"],
};

export const Default = (): React.JSX.Element => (
	<Composer threadId="t-1" onSubmit={async () => {}} />
);
export const WithUnresolvedReviewLink = (): React.JSX.Element => (
	<Composer threadId="t-1" onSubmit={async () => {}} unresolvedReviewLink={{ onClick: () => {} }} />
);
