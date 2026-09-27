// @vitest-environment jsdom

/**
 * K2 acceptance gate: every Tier 1+2 component spreads `dsProps(name, tier)` on its outermost element.
 * @lore BetCard does not exist — tasks are the one work primitive.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DocRow } from "../DocRow";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { KeyValue } from "../KeyValue";
import { NavItem } from "../NavItem";
import { NotificationRow } from "../NotificationRow";
// U8: PitchCard deleted from design-system — import removed.
import { SearchField } from "../SearchField";
import { SkeletonCard, SkeletonList } from "../Skeleton";
import { StatusChip } from "../StatusChip";
import { Tag } from "../Tag";
import { TaskCard } from "../TaskCard";
import { ThreadRow } from "../ThreadRow";

// Silence React 19 act() warnings for sync render+assert pattern below.
// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface ComponentCase {
	name: string;
	tier: "1" | "2";
	render: () => ReturnType<typeof createElement>;
}

const TIER_1: ComponentCase[] = [
	{
		name: "KeyValue",
		tier: "1",
		render: () => createElement(KeyValue, { label: "label", value: "value" }),
	},
	{
		name: "NavItem",
		tier: "1",
		render: () => createElement(NavItem, { label: "Home" }),
	},
	{
		name: "SearchField",
		tier: "1",
		render: () => createElement(SearchField, {}),
	},
	{
		name: "StatusChip",
		tier: "1",
		render: () => createElement(StatusChip, { status: "healthy" }),
	},
	{
		name: "Tag",
		tier: "1",
		render: () => createElement(Tag, { label: "tag" }),
	},
];

const TIER_2: ComponentCase[] = [
	{
		name: "EmptyState",
		tier: "2",
		render: () => createElement(EmptyState, { title: "Empty", description: "Nothing here" }),
	},
	{
		name: "ErrorState",
		tier: "2",
		render: () =>
			createElement(ErrorState, { title: "Error", description: "Something went wrong" }),
	},
	{
		name: "DocRow",
		tier: "2",
		render: () =>
			createElement(DocRow, {
				title: "Item",
				status: "active",
				timestamp: "now",
			}),
	},
	{
		name: "NotificationRow",
		tier: "2",
		render: () =>
			createElement(NotificationRow, {
				severity: "healthy",
				message: "Hello",
				timestamp: "now",
			}),
	},
	// U8: PitchCard deleted from design-system — removed from ds-attrs test.
	{
		name: "SkeletonCard",
		tier: "2",
		render: () => createElement(SkeletonCard, { ariaLabel: "Loading" }),
	},
	{
		name: "SkeletonList",
		tier: "2",
		render: () => createElement(SkeletonList, { ariaLabel: "Loading" }),
	},
	{
		name: "TaskCard",
		tier: "2",
		render: () =>
			createElement(TaskCard, {
				title: "Task",
				owner: "Alice",
				state: "in_progress",
			}),
	},
	{
		name: "ThreadRow",
		tier: "2",
		render: () =>
			createElement(ThreadRow, {
				avatarUrl: "https://example.com/a.png",
				title: "Thread",
				snippet: "Snippet",
				timestamp: "now",
			}),
	},
];

const ALL_CASES: ComponentCase[] = [...TIER_1, ...TIER_2];

describe("design-system DOM markers", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
	});

	for (const c of ALL_CASES) {
		it(`${c.name} exposes data-ds-component / data-ds-tier="${c.tier}" / data-ds-source="design-system"`, async () => {
			await act(async () => {
				root.render(c.render());
			});

			expect(
				container.children.length,
				`${c.name}: expected exactly one root element, got ${container.children.length}`,
			).toBe(1);
			const outer = container.firstElementChild as HTMLElement | null;
			expect(outer, `${c.name}: rendered no element`).not.toBeNull();
			expect(
				outer?.getAttribute("data-ds-component"),
				`${c.name}: missing data-ds-component on outer element`,
			).toBe(c.name);
			expect(
				outer?.getAttribute("data-ds-tier"),
				`${c.name}: missing or wrong data-ds-tier on outer element`,
			).toBe(c.tier);
			expect(
				outer?.getAttribute("data-ds-source"),
				`${c.name}: missing or wrong data-ds-source on outer element`,
			).toBe("design-system");
		});
	}
});
