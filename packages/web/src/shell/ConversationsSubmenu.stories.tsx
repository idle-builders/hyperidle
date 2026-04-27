/*
 * @lore L3 review (design D2): The /designsystem route already lives
 * inside the app's BrowserRouter, so wrapping these stories in a
 * MemoryRouter throws React Router's "cannot render a Router inside a
 * Router" error and the stories rendered as a red error stack. We rely
 * on the outer router for `useSearchParams` and pre-seed the URL with
 * window.history.replaceState so the chip-state demo (`PopulatedMineFilter`)
 * still demonstrates the active-filter visual.
 */
import type { ThreadListEntry } from "@hyperidle/shared";
import { useEffect } from "react";
import { ConversationsSubmenu } from "./ConversationsSubmenu";

export default {
	title: "ConversationsSubmenu",
	tier: "3" as const,
	uses: ["BlockingCounter", "RoutingFilterChips"],
};

const NOW = Date.parse("2026-04-26T12:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

const ME = { id: "actor:ceo", role: "CEO" as const, domain_tags: [] };

function thread(over: Partial<ThreadListEntry> & { id: string }): ThreadListEntry {
	return {
		id: over.id,
		kind: over.kind ?? "review",
		pinned: over.pinned ?? false,
		participants: over.participants ?? [],
		routedToActorId: over.routedToActorId ?? null,
		routedToActorRole: over.routedToActorRole ?? null,
		domainTag: over.domainTag ?? null,
		createdAt: over.createdAt ?? iso(NOW - 60_000),
		lastActivityAt: over.lastActivityAt ?? iso(NOW - 60_000),
		blocking: over.blocking ?? false,
		resolvedAt: over.resolvedAt ?? null,
		title: over.title ?? over.id,
		snippet: over.snippet ?? "",
		unread: over.unread ?? false,
	};
}

const FIXTURE: ThreadListEntry[] = [
	thread({
		id: "Coach checkpoint",
		pinned: true,
		kind: "chat",
		participants: ["seed-agent-cos"],
		snippet: "Daily focus + blockers",
	}),
	thread({ id: "Pinned other", pinned: true, snippet: "Pricing decision tracker" }),
	thread({
		id: "Blocking review",
		blocking: true,
		snippet: "PR #421 blocked on credentials",
	}),
	thread({
		id: "Blocking chat",
		kind: "chat",
		blocking: true,
		snippet: "Customer escalation needs reply",
	}),
	thread({ id: "Review one", snippet: "Pricing copy change" }),
	thread({ id: "Review two", snippet: "Onboarding flow tweak" }),
	thread({ id: "Chat one", kind: "chat", snippet: "Standup notes" }),
];

export const Populated = (): React.JSX.Element => (
	<div className="w-60 p-2">
		<ConversationsSubmenu threads={FIXTURE} me={ME} now={NOW} />
	</div>
);

export const Empty = (): React.JSX.Element => (
	<div className="w-60 p-2">
		<ConversationsSubmenu threads={[]} me={ME} now={NOW} />
	</div>
);

export const NoMeIdentity = (): React.JSX.Element => (
	<div className="w-60 p-2">
		<ConversationsSubmenu threads={FIXTURE} me={null} now={NOW} />
	</div>
);

/**
 * Pre-seeds the URL with `?routedTo=mine` via history.replaceState before
 * the component mounts so the chip-active state is demoable inside the
 * existing /designsystem route. The reset effect keeps subsequent stories
 * from inheriting the search param.
 */
export const PopulatedMineFilter = (): React.JSX.Element => {
	useEffect(() => {
		const original = window.location.search;
		window.history.replaceState(null, "", "?routedTo=mine");
		return () => {
			window.history.replaceState(null, "", original);
		};
	}, []);
	return (
		<div className="w-60 p-2">
			<ConversationsSubmenu threads={FIXTURE} me={ME} now={NOW} />
		</div>
	);
};
