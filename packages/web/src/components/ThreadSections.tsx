import { EmptyState, type Status, ThreadRow } from "@hyperidle/design-system";
import type { HostKind } from "@hyperidle/shared";
import type { JSX } from "react";

/**
 * @lore L1a (T17): the legacy `kind: 'review' | 'chat'` literal is gone;
 * the new shape carries `hostKind` + `hasUnresolvedReview` (a derived flag
 * the page computes from `headCollapsePredicate`). Section routing:
 *  - blocking → Blocking section regardless of host_kind
 *  - pinned   → Pinned section regardless of host_kind
 *  - hasUnresolvedReview → Reviews section
 *  - resolvedAt within 24h → Resolved section
 *  - otherwise → Chats section
 */
export interface ThreadItem {
	id: string;
	title: string;
	snippet: string;
	timestamp: string;
	avatarUrl: string;
	hostKind: HostKind;
	hasUnresolvedReview: boolean;
	blocking: boolean;
	pinned: boolean;
	/** ISO timestamp; if present and within the 24h window this thread surfaces in "Resolved". */
	resolvedAt?: string;
	status?: Status;
	tag?: string;
	unread?: boolean;
}

export type ThreadSectionId = "pinned" | "blocking" | "reviews" | "chats" | "resolved";

export interface ThreadSection {
	id: ThreadSectionId;
	label: string;
	items: ThreadItem[];
}

const SECTION_ORDER: readonly ThreadSectionId[] = [
	"pinned",
	"blocking",
	"reviews",
	"chats",
	"resolved",
] as const;

const SECTION_LABEL: Record<ThreadSectionId, string> = {
	pinned: "Pinned",
	blocking: "Blocking",
	reviews: "Reviews",
	chats: "Chats",
	resolved: "Resolved",
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function classifyThread(thread: ThreadItem, now: number): ThreadSectionId | null {
	if (thread.resolvedAt) {
		const ts = Date.parse(thread.resolvedAt);
		if (Number.isNaN(ts)) return null;
		if (now - ts > TWENTY_FOUR_HOURS_MS) return null;
		return "resolved";
	}
	if (thread.pinned) return "pinned";
	if (thread.blocking) return "blocking";
	return thread.hasUnresolvedReview ? "reviews" : "chats";
}

export function groupThreadsIntoSections(
	threads: ThreadItem[],
	opts: { now: number },
): ThreadSection[] {
	const buckets: Record<ThreadSectionId, ThreadItem[]> = {
		pinned: [],
		blocking: [],
		reviews: [],
		chats: [],
		resolved: [],
	};
	for (const t of threads) {
		const section = classifyThread(t, opts.now);
		if (section) buckets[section].push(t);
	}
	return SECTION_ORDER.filter((id) => buckets[id].length > 0).map((id) => ({
		id,
		label: SECTION_LABEL[id],
		items: buckets[id],
	}));
}

export interface ThreadSectionsProps {
	threads: ThreadItem[];
	/** Milliseconds since epoch. Defaults to Date.now() at render time. */
	now?: number;
	onSelect?: (id: string) => void;
}

export function ThreadSections({
	threads,
	now = Date.now(),
	onSelect,
}: ThreadSectionsProps): JSX.Element {
	const sections = groupThreadsIntoSections(threads, { now });
	if (sections.length === 0) {
		return (
			<EmptyState
				title="No threads"
				description="Conversations with agents will appear here once started."
				dataTestId="thread-sections-empty"
			/>
		);
	}
	return (
		<div className="flex flex-col gap-2" data-testid="thread-sections">
			{sections.map((section) => (
				<section key={section.id} data-thread-section={section.id}>
					<h3 className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-[var(--text-lo)]">
						{section.label}
						<span className="ml-2 text-[var(--text-lo)] normal-case">{section.items.length}</span>
					</h3>
					<ul className="flex flex-col">
						{section.items.map((t) => (
							<li key={t.id}>
								<ThreadRow
									avatarUrl={t.avatarUrl}
									title={t.title}
									snippet={t.snippet}
									timestamp={t.timestamp}
									status={t.status}
									tag={t.tag}
									unread={t.unread}
									blocking={t.blocking}
									kind={t.hasUnresolvedReview ? "review" : "chat"}
									onClick={onSelect ? () => onSelect(t.id) : undefined}
								/>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
