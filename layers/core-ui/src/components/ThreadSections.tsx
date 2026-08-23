import type { HostKind } from "@hyperidle/domain-model";
import type { CSSProperties, JSX } from "react";
import { EmptyState, ErrorState, SkeletonList, type Status, ThreadRow } from "../ds";

/**
 * @lore L1a (T17) / L8 §3.2: ThreadItem carries `hostKind` + the derived
 * `hasUnresolvedReview` flag. The Conversations section (L8) renders three
 * buckets only — blocking | active | resolved — per approved.md §2.
 */
export interface ThreadItem {
	id: string;
	title: string;
	snippet: string;
	timestamp: string;
	/** M3 E1: null means no avatar — renders initials chip instead of <img>. */
	avatarUrl: string | null;
	/**
	 * UI-061: right-side overlapping participant avatar circles.
	 * Shape is structurally compatible with ThreadRow's ThreadAvatarItem.
	 * Omit to show no avatars; supply initials to render participant chips.
	 */
	avatars?: ReadonlyArray<{ initials: string; agent?: boolean }>;
	hostKind: HostKind;
	hasUnresolvedReview: boolean;
	blocking: boolean;
	pinned: boolean;
	/** ISO timestamp; if present and within the 24h window this thread surfaces in "Resolved". */
	resolvedAt?: string;
	status?: Status;
	tag?: string;
	unread?: boolean;
	/**
	 * AF14 AC1: ISO sort key for the flat-list comparator (distinct from display `timestamp`).
	 * `timestamp` is a relative display string (e.g. "5m") — Date.parse("5m") → NaN → wrong order.
	 * `lastActiveAt` is an ISO 8601 string (e.g. "2026-06-11T10:00:00.000Z") → stable sort.
	 *
	 * @lore AF14: The flat-list comparator previously used `Date.parse(a.timestamp)` which
	 * always returned NaN for relative strings, falling through to id.localeCompare (wrong order).
	 */
	lastActiveAt: string;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * AF14 AC1: Sort comparator for the flat thread list.
 * Sorts by ISO `lastActiveAt` DESC; falls back to `id.localeCompare` when either
 * timestamp is missing or unparseable (NaN).
 *
 * Exported so tests can assert directly on the production sort path rather than
 * reimplementing the comparator inline (which would be a tautology).
 */
export function compareThreadsByLastActive(a: ThreadItem, b: ThreadItem): number {
	const at = Date.parse(a.lastActiveAt);
	const bt = Date.parse(b.lastActiveAt);
	if (!(Number.isNaN(at) || Number.isNaN(bt))) return bt - at;
	return a.id.localeCompare(b.id);
}

/**
 * Closed vocabulary for the Conversations filter chips (legacy string form).
 * Still used in AppShell OutletContext for backwards compatibility.
 *
 * @lore W3: The W3 test spec defines a new toggle-object form
 * `{ blocking: boolean; unread: boolean }` used when groupBySection=false.
 * The legacy string form is kept for the existing section-grouped path.
 */
export type ConversationsFilter = "all" | "blocking" | "async";

/**
 * Single source of truth for the filter predicate. Reused by ThreadSections
 * (filter before sectioning) and AppShell (post-filter count badge) so the
 * rendered list and the count badge cannot drift.
 */
export function predicateFor(f: ConversationsFilter): (t: ThreadItem) => boolean {
	switch (f) {
		case "all":
			return () => true;
		case "blocking":
			return (t) => t.blocking === true;
		case "async":
			return (t) => t.blocking === false;
	}
}

const FILTER_EMPTY_COPY: Record<Exclude<ConversationsFilter, "all">, { description: string }> = {
	blocking: { description: "No blocking threads right now." },
	async: { description: "No async conversations." },
};

export type ConversationsSectionId = "blocking" | "active" | "resolved";

export interface ConversationsSection {
	id: ConversationsSectionId;
	label: string;
	tone: "danger" | "neutral";
	items: ThreadItem[];
}

const CONVERSATIONS_SECTION_LABEL: Record<ConversationsSectionId, string> = {
	blocking: "Blocking",
	active: "Active",
	resolved: "Resolved · 24h",
};

const CONVERSATIONS_SECTION_ORDER: readonly ConversationsSectionId[] = [
	"blocking",
	"active",
	"resolved",
] as const;

function classifyForConversations(thread: ThreadItem, now: number): ConversationsSectionId {
	// approved.md §2 ladder: resolved within 24h → resolved; else if blocking
	// → blocking; else → active. Re-opened blocking thread (resolved past 24h,
	// blocking false) lands in Active.
	if (thread.resolvedAt) {
		const ts = Date.parse(thread.resolvedAt);
		if (!Number.isNaN(ts) && now - ts <= TWENTY_FOUR_HOURS_MS) {
			return "resolved";
		}
	}
	if (thread.blocking) return "blocking";
	return "active";
}

function sortById(a: ThreadItem, b: ThreadItem): number {
	// L8: ThreadItem doesn't yet carry lastActiveAt; deterministic id sort is
	// the placeholder until that field lands.
	return a.id.localeCompare(b.id);
}

function sortActive(a: ThreadItem, b: ThreadItem): number {
	// approved.md §2 — Active sorts: pinned desc → hasUnresolvedReview desc → id asc.
	if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
	if (a.hasUnresolvedReview !== b.hasUnresolvedReview) return a.hasUnresolvedReview ? -1 : 1;
	return a.id.localeCompare(b.id);
}

function sortResolved(a: ThreadItem, b: ThreadItem): number {
	// approved.md §2 — Resolved sorts by resolvedAt desc.
	const at = a.resolvedAt ? Date.parse(a.resolvedAt) : 0;
	const bt = b.resolvedAt ? Date.parse(b.resolvedAt) : 0;
	return bt - at;
}

export function groupThreadsForConversations(
	threads: ReadonlyArray<ThreadItem>,
	opts: { now: number },
): ConversationsSection[] {
	const buckets: Record<ConversationsSectionId, ThreadItem[]> = {
		blocking: [],
		active: [],
		resolved: [],
	};
	for (const t of threads) {
		buckets[classifyForConversations(t, opts.now)].push(t);
	}
	buckets.blocking.sort(sortById);
	buckets.active.sort(sortActive);
	buckets.resolved.sort(sortResolved);
	return CONVERSATIONS_SECTION_ORDER.map((id) => ({
		id,
		label: CONVERSATIONS_SECTION_LABEL[id],
		tone: id === "blocking" ? "danger" : "neutral",
		items: buckets[id],
	}));
}

// ── Render ──────────────────────────────────────────────────────────────

export interface ThreadSectionsProps {
	threads: ReadonlyArray<ThreadItem>;
	/** Milliseconds since epoch. Defaults to Date.now() at render time. */
	now?: number;
	/**
	 * @deprecated Navigation is now handled by ThreadRow's href prop.
	 * Retained so existing callers compile without changes.
	 *
	 * @lore UI-080: ThreadRow renders as <a href> — the selected state updates
	 * via selectedId (URL-derived), so onSelect is no longer needed for navigation.
	 */
	onSelect?: (id: string) => void;
	/** L8: lifted-selection target — at most one row carries aria-current. */
	selectedId?: string | null;
	/** L8: when set, render the ErrorState in place of the list. */
	errorMessage?: string | null;
	onRetry?: () => void;
	/**
	 * L8 review (Architecture C1): when true the list renders skeleton rows
	 * instead of falling through to EmptyState while the fetch resolves.
	 */
	loading?: boolean;
	/** When provided, threads are filtered before sectioning. Defaults to `'all'`. */
	activeFilter?: ConversationsFilter;
	/** Handler for the filter-empty `Clear filter` action. Only fires when `activeFilter !== 'all'`. */
	onClearFilter?: () => void;
	/**
	 * AF14 AC4: when false, renders a flat chronological list ordered by lastActiveAt DESC.
	 * Filter chips (Blocking, Unread) have been removed — they never matched real state.
	 * The blocking/unread fields on ThreadItem remain for forward-compatibility (AF7).
	 * Defaults to true for backwards compatibility.
	 */
	groupBySection?: boolean;
}

export function ThreadSections({
	threads,
	now = Date.now(),
	onSelect: _onSelect,
	selectedId = null,
	errorMessage,
	onRetry,
	loading = false,
	activeFilter = "all",
	onClearFilter,
	groupBySection = true,
}: ThreadSectionsProps): JSX.Element {
	// Flat list mode (W3 AC-5, AC-6)
	if (!groupBySection) {
		if (errorMessage) {
			return (
				<ErrorState
					title="Couldn't load threads"
					description={errorMessage}
					onRetry={onRetry}
					dataTestId="thread-sections-error"
				/>
			);
		}
		if (loading) {
			return (
				<div data-testid="thread-sections-loading">
					<SkeletonList rows={3} ariaLabel="Loading threads" />
				</div>
			);
		}

		// AF14 AC4: chip filtering removed — render the full list directly.
		// The blocking/unread fields remain on ThreadItem (forward-compatible for AF7).
		const flatFiltered = [...threads];
		// AF14 AC1: sort by ISO lastActiveAt DESC (not display timestamp — "5m" → NaN).
		flatFiltered.sort(compareThreadsByLastActive);

		return (
			<div className="flex flex-col flex-1 overflow-y-auto">
				{/* AF14 AC4: Blocking/Unread chip bar removed — neither chip matched real state.
				    The blocking/unread FIELDS remain on ThreadItem for AF7 forward-compat. */}
				{flatFiltered.length === 0 ? (
					<div className="flex flex-1 items-center justify-center p-[48px_24px]">
						<EmptyState
							title="No threads"
							description="No threads match the current filters."
							dataTestId="thread-sections-empty"
						/>
					</div>
				) : (
					<div className="flex flex-col w-full" data-testid="flat-thread-list">
						{flatFiltered.map((t) => (
							<ThreadRow
								key={t.id}
								avatarUrl={t.avatarUrl}
								avatars={t.avatars as import("../ds").ThreadRowProps["avatars"]}
								title={t.title}
								snippet={t.snippet}
								timestamp={t.timestamp}
								status={t.status}
								unread={t.unread}
								blocking={t.blocking}
								pinned={t.pinned}
								hostTag={t.hostKind}
								selected={selectedId === t.id}
								href={`/conversations/${encodeURIComponent(t.id)}`}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	if (errorMessage) {
		return (
			<ErrorState
				title="Couldn't load threads"
				description={errorMessage}
				onRetry={onRetry}
				dataTestId="thread-sections-error"
			/>
		);
	}

	if (loading) {
		// @lore L8 review (Architecture C1): skeleton rows render until the
		// hook resolves so the EmptyState does not flash on first paint.
		return (
			<div data-testid="thread-sections-loading">
				<SkeletonList rows={3} ariaLabel="Loading threads" />
			</div>
		);
	}

	// Filter before the empty branches so the filter-empty surface is distinct
	// from L8's globally-empty "No threads yet".
	const filtered = activeFilter === "all" ? threads : threads.filter(predicateFor(activeFilter));
	if (threads.length === 0 && activeFilter === "all") {
		return (
			<EmptyState
				title="No threads yet"
				description="Conversations with agents will appear here once started."
				dataTestId="thread-sections-empty"
			/>
		);
	}
	if (filtered.length === 0 && activeFilter !== "all") {
		const copy = FILTER_EMPTY_COPY[activeFilter];
		return (
			<EmptyState
				title="No threads match this filter"
				description={copy.description}
				dataTestId="thread-sections-filter-empty"
				action={
					onClearFilter ? (
						// L10 Design C2 / approved mockup: flat text-link, not a solid button.
						// Mirrors `.empty-state__action-btn` in
						// plans/L10/design/variant-a-pure-axis/mockup.html
						// (color: var(--accent-primary); background: transparent; border: 0; padding: 0).
						<button
							type="button"
							className="type-control border-none bg-transparent  p-0  text-[var(--accent-deep)] hover:underline cursor-pointer"
							aria-label="Clear filter"
							onClick={onClearFilter}
						>
							Clear filter
						</button>
					) : undefined
				}
			/>
		);
	}

	const sections = groupThreadsForConversations(filtered, { now });
	return (
		<div className="flex flex-col gap-[9px]" data-testid="thread-sections">
			{sections.map((section) => {
				// approved.md §5.5: Blocking and Resolved silently absent when empty.
				// Active renders its header plus a "Quiet" line when empty —
				// EXCEPT when L10 §3.5 hides Active for the 'blocking' filter
				// (the filter restricts the visible domain to blocking threads
				// only; an empty Active "Quiet" line would be misleading).
				if (section.items.length === 0) {
					if (section.id !== "active") return null;
					if (activeFilter === "blocking") return null;
				}
				const headerToneClass =
					section.tone === "danger" ? "text-[var(--status-error)]" : "text-[var(--text-tertiary)]";
				// @lore L8 review (Design B1+B2 / approved.md §2 + §5.6 + §7):
				// the Blocking section gets a sticky header (top:0, z:2), a
				// 10% danger-tinted background, and a 3px left-edge danger
				// accent. Tint + accent encode danger without relying on color
				// alone — approved.md §7 (a11y).
				// @lore U9 (AI1 update): --danger migrated to --status-error in AI1.
				// The previously-stale lore claimed protected tests forbade this migration —
				// that was incorrect. ThreadSections.conversations.test.tsx L210 was updated
				// in lockstep (AC5) to assert var(--status-error) instead of var(--danger).
				// --danger was never defined in tokens.css; --status-error is the defined
				// error status token. The test now asserts against a defined token (strengthened).
				const isBlocking = section.id === "blocking";
				const sectionStyle: CSSProperties | undefined = isBlocking
					? {
							background: "color-mix(in srgb, var(--status-error) 10%, var(--surface-container))",
						}
					: undefined;
				const headerStickyClass = isBlocking
					? "sticky top-0 z-[2] bg-[var(--surface-container)]"
					: "";
				return (
					<section key={section.id} data-thread-section={section.id} style={sectionStyle}>
						<h3
							className={`type-label ${`flex items-center gap-[9px] px-3 py-1   uppercase  ${headerToneClass} ${headerStickyClass}`}`}
						>
							<span>{section.label}</span>
							<span data-thread-section-count className="normal-case">
								{section.items.length}
							</span>
						</h3>
						{section.items.length === 0 ? (
							<p
								className="type-metadata px-3 py-2  text-[var(--text-tertiary)]"
								data-testid="thread-section-active-quiet"
							>
								Quiet — nothing in flight.
							</p>
						) : (
							<ul className="flex flex-col">
								{section.items.map((t) => (
									<li key={t.id} className={section.id === "resolved" ? "opacity-70" : undefined}>
										<ThreadRow
											avatarUrl={t.avatarUrl}
											avatars={t.avatars as import("../ds").ThreadRowProps["avatars"]}
											title={t.title}
											snippet={t.snippet}
											timestamp={t.timestamp}
											status={t.status}
											unread={t.unread}
											blocking={t.blocking}
											pinned={t.pinned}
											hostTag={t.hostKind}
											selected={selectedId === t.id}
											href={`/conversations/${encodeURIComponent(t.id)}`}
										/>
									</li>
								))}
							</ul>
						)}
					</section>
				);
			})}
		</div>
	);
}
