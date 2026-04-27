import type { RoutingFilter } from "@hyperidle/shared";
import { useState } from "react";
import { RoutingFilterChips } from "./RoutingFilterChips";

export default {
	title: "RoutingFilterChips",
	tier: "3" as const,
};

const ME = { id: "actor:ceo", role: "CEO" as const, domain_tags: [] };

export const AllSelected = (): React.JSX.Element => {
	const [active, setActive] = useState<RoutingFilter>("all");
	return <RoutingFilterChips active={active} onChange={setActive} me={ME} />;
};

export const MineSelected = (): React.JSX.Element => {
	const [active, setActive] = useState<RoutingFilter>("mine");
	return <RoutingFilterChips active={active} onChange={setActive} me={ME} />;
};

export const HiddenWhenMeNull = (): React.JSX.Element => (
	<div className="text-xs">Chip bar hidden when me=null:</div>
);
