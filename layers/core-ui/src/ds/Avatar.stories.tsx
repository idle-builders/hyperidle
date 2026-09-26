/**
 * Avatar stories.
 */

import type { JSX } from "react";
import { Avatar } from "./Avatar.js";

export default { title: "Avatar" };

export function Sizes(): JSX.Element {
	return (
		<div className="flex items-center gap-[12px] p-[18px]">
			<Avatar initials="AB" size="sm" />
			<Avatar initials="AB" size="md" />
			<Avatar initials="AB" size="lg" />
		</div>
	);
}

export function AgentVariant(): JSX.Element {
	return (
		<div className="flex items-center gap-[12px] p-[18px]">
			<Avatar initials="AI" agent size="sm" />
			<Avatar initials="AI" agent size="md" />
			<Avatar initials="AI" agent size="lg" />
		</div>
	);
}
