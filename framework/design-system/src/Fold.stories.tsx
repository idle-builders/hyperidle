import type { JSX } from "react";
import { Fold } from "./Fold.js";

export default {
	title: "Fold",
	group: "Conversations" as const,
	tier: "1" as const,
	order: ["WorkFold", "SessionFold"],
};

export const WorkFold = (): JSX.Element => <Fold label="Worked for 1m 12s" cta="Show" />;

export const SessionFold = (): JSX.Element => <Fold cta="Show session" />;
