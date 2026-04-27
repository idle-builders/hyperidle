/**
 * L3 — Conversations submenu children: section-grouped thread queue.
 *
 * Composes BlockingCounter + RoutingFilterChips + section list (Tier-2
 * ThreadRow). Owns keyboard nav via `useThreadListKeyboard`.
 *
 * @lore L3 (CONFUSION-2): the routing chip row lives INSIDE the Submenu
 * children, not in the Submenu chrome filter slot. AppShell suppresses
 * J2's `[all|needs-review|chats|resolved]` chip set for `activeView ===
 * "conversations"` so only one filter row renders.
 *
 * @lore L3 review (adversary C5): the prior `useBlockingSection >= 2`
 * gate was nowhere in the spec — a single blocker also creates the
 * Blocking section. The Blocking section is the user's primary triage
 * affordance; if it has one row, the user wants to see it surfaced
 * separately from chat/review noise.
 *
 * @lore L3 review (adversary C3): a thread whose participants include
 * the Coach agent always routes to the Pinned section, regardless of
 * the row's `pinned` flag. Coach is sticky-by-identity, not by user
 * pin state — without this branch an unpinned Coach row was silently
 * sorted into Chats and lost its top-row affordance.
 */

import {
	type Actor,
	COACH_AGENT_ID,
	parseRoutingFilter,
	type RoutingFilter,
	SECTIONS,
	type Section,
	type ThreadListEntry,
} from "@hyperidle/shared";
import { type JSX, type KeyboardEvent, type MouseEvent, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { BlockingCounter } from "../components/BlockingCounter";
import { type FlatThreadRow, useThreadListKeyboard } from "../hooks/useThreadListKeyboard";
import { RoutingFilterChips } from "./RoutingFilterChips";

const SECTION_LABEL: Record<Section, string> = {
	pinned: "Pinned",
	blocking: "Blocking",
	reviews: "Reviews",
	chats: "Chats",
	resolved: "Resolved",
};

const RESOLVED_WINDOW_MS = 24 * 60 * 60 * 1000;

function isCoachThread(t: ThreadListEntry): boolean {
	return t.participants.includes(COACH_AGENT_ID);
}

function classify(t: ThreadListEntry, nowMs: number): Section | null {
	// Coach is pinned-by-identity (adversary C3) — must precede the
	// resolved/blocking branches so the row never silently lands in Chats.
	if (t.pinned || isCoachThread(t)) return "pinned";
	if (t.resolvedAt !== null) {
		const ageMs = nowMs - Date.parse(t.resolvedAt);
		return ageMs <= RESOLVED_WINDOW_MS ? "resolved" : null;
	}
	if (t.blocking) return "blocking";
	if (t.kind === "review") return "reviews";
	if (t.kind === "chat" || t.kind === "coach") return "chats";
	return null;
}

function compareWithinSection(a: ThreadListEntry, b: ThreadListEntry): number {
	const aCoach = isCoachThread(a) ? 0 : 1;
	const bCoach = isCoachThread(b) ? 0 : 1;
	if (aCoach !== bCoach) return aCoach - bCoach;
	if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
	return Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt);
}

function applyRoutingFilter(
	threads: readonly ThreadListEntry[],
	filter: RoutingFilter,
	me: Actor | null,
): readonly ThreadListEntry[] {
	if (filter === "all") return threads;
	// @lore L3 review (design W3): pinned and Coach rows are exempt from
	// the routing filter. Coach is unrouted by definition (no actor
	// ownership) and pinned rows are user-anchored permanent affordances —
	// the routing filter narrows the *triage queue*, not the always-on
	// surface. Plan CONFUSION-4 left this open; the design review made the
	// call.
	const exempt = (t: ThreadListEntry): boolean => t.pinned || isCoachThread(t);
	if (filter === "ceo") return threads.filter((t) => exempt(t) || t.routedToActorRole === "CEO");
	if (filter === "cpo") return threads.filter((t) => exempt(t) || t.routedToActorRole === "CPO");
	// "mine"
	if (!me) return threads.filter(exempt);
	return threads.filter((t) => exempt(t) || t.routedToActorId === me.id);
}

function groupAndSort(
	threads: readonly ThreadListEntry[],
	nowMs: number,
): Record<Section, ThreadListEntry[]> {
	const buckets: Record<Section, ThreadListEntry[]> = {
		pinned: [],
		blocking: [],
		reviews: [],
		chats: [],
		resolved: [],
	};
	for (const t of threads) {
		const sec = classify(t, nowMs);
		if (sec) buckets[sec].push(t);
	}
	for (const sec of SECTIONS) {
		buckets[sec].sort(compareWithinSection);
	}
	return buckets;
}

function flatten(
	buckets: Record<Section, ThreadListEntry[]>,
): Array<FlatThreadRow & { section: Section; threadId: string; thread: ThreadListEntry }> {
	const out: Array<
		FlatThreadRow & { section: Section; threadId: string; thread: ThreadListEntry }
	> = [];
	for (const sec of SECTIONS) {
		for (const t of buckets[sec]) {
			out.push({ section: sec, threadId: t.id, thread: t });
		}
	}
	return out;
}

function relativeTime(iso: string, nowMs: number): string {
	const ms = nowMs - Date.parse(iso);
	if (ms < 60_000) return "now";
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

/**
 * @lore L3 review (design D1): inside the 240 px Submenu we cannot afford
 * the avatar/chip/timestamp triple ThreadRow renders for the wider Main
 * column. The narrow row stacks title+timestamp on row 1 and snippet on
 * row 2 so the title is always visible. Extracted to a sub-component so
 * the parent's `rows.map` body stays under the cognitive-complexity
 * threshold.
 */
interface SubmenuRowProps {
	thread: ThreadListEntry;
	section: Section;
	isActive: boolean;
	isCoach: boolean;
	now: number;
	rowRef: (el: HTMLLIElement | null) => void;
	onSelect: () => void;
	onOpen: () => void;
}

function SubmenuRow({
	thread,
	section,
	isActive,
	isCoach,
	now,
	rowRef,
	onSelect,
	onOpen,
}: SubmenuRowProps): JSX.Element {
	// @lore L3 review (design D3 + W2): active-row visual via aria-current
	// + bg-surface-4 + 2px primary left border. Coach gets a distinct
	// primary-dim border so the sticky pin row stays recognisable when
	// scrolled. Blocking's danger border lives on ThreadRow (not here);
	// the wrapper border slot is reserved for selection/coach.
	const liClasses: string[] = [
		"flex",
		isCoach
			? "sticky top-[var(--density-row-h)] z-10 bg-[var(--surface-1)] border-l-2 border-[var(--primary-dim,var(--primary))]"
			: "border-l-2 border-transparent",
		isActive ? "bg-[var(--surface-4)] border-[var(--primary)]" : "",
	];
	const handleKeyDown = (e: KeyboardEvent<HTMLLIElement>): void => {
		if (e.key === "Enter" || e.key === " ") onSelect();
	};
	const handleButtonClick = (e: MouseEvent<HTMLButtonElement>): void => {
		e.stopPropagation();
		onOpen();
	};
	return (
		<li
			data-testid={`thread-row-${section}`}
			data-thread-id={thread.id}
			aria-current={isActive ? "true" : undefined}
			data-coach={isCoach ? "true" : undefined}
			ref={rowRef}
			onClick={onSelect}
			onKeyDown={handleKeyDown}
			className={liClasses.filter(Boolean).join(" ")}
		>
			<button
				type="button"
				data-component="ThreadRow"
				data-tier="2"
				className="flex flex-1 min-w-0 flex-col gap-0.5 px-[var(--density-pad-x)] py-[var(--density-pad-y)] text-left rounded-[var(--r1)] hover:bg-[var(--surface-4)] transition-colors duration-[var(--motion-fast)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:-outline-offset-1"
				onClick={handleButtonClick}
			>
				<div className="flex items-baseline gap-2 min-w-0">
					<span
						className={`flex-1 min-w-0 truncate text-[length:var(--density-text)] ${thread.unread ? "font-semibold" : ""}`}
						title={thread.title}
					>
						{thread.title}
					</span>
					<span className="text-[12px] text-[var(--text-lo)] whitespace-nowrap tabular-nums">
						{relativeTime(thread.lastActivityAt, now)}
					</span>
				</div>
				{thread.snippet ? (
					<p className="text-[12px] text-[var(--text-mid)] truncate">{thread.snippet}</p>
				) : null}
			</button>
		</li>
	);
}

export interface ConversationsSubmenuProps {
	threads: readonly ThreadListEntry[];
	me: Actor | null;
	now: number;
	onOpenThread?: (threadId: string, kind: ThreadListEntry["kind"]) => void;
}

export function ConversationsSubmenu({
	threads,
	me,
	now,
	onOpenThread,
}: ConversationsSubmenuProps): JSX.Element {
	const [searchParams, setSearchParams] = useSearchParams();
	const filter: RoutingFilter = parseRoutingFilter(searchParams.get("routedTo"));

	const setFilter = (next: RoutingFilter): void => {
		const p = new URLSearchParams(searchParams);
		if (next === "all") {
			p.delete("routedTo");
		} else {
			p.set("routedTo", next);
		}
		setSearchParams(p, { replace: true });
	};

	const filtered = useMemo(() => applyRoutingFilter(threads, filter, me), [threads, filter, me]);
	const buckets = useMemo(() => groupAndSort(filtered, now), [filtered, now]);
	const flat = useMemo(() => flatten(buckets), [buckets]);

	// @lore L3 review (adversary C6): the BlockingCounter "N" must reflect
	// the global blocker count across the unfiltered list — narrowing
	// to "Mine" or a routing role does NOT shrink the awareness signal,
	// only the queue position. The "X" denominator (position) is computed
	// against the filtered/visible list since that is what the active row
	// belongs to.
	const globalBlockingTotal = useMemo(() => {
		const unfilteredBuckets = groupAndSort(threads, now);
		return unfilteredBuckets.blocking.length;
	}, [threads, now]);

	const handleOpen = (threadId: string, row: FlatThreadRow): void => {
		const t = (row as { thread?: ThreadListEntry }).thread;
		if (!t) return;
		onOpenThread?.(threadId, t.kind);
	};

	const { activeRow, setActiveIndex } = useThreadListKeyboard({
		flat,
		onOpenThread: handleOpen,
	});

	// Scroll active row into view on selection change. Map keyed by
	// `${section}:${threadId}` so multiple sections can render the same id
	// (currently they don't, but the ref keys remain unique).
	const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
	const activeKey = activeRow ? `${activeRow.section}:${activeRow.threadId}` : null;
	useEffect(() => {
		if (!activeKey) return;
		const el = rowRefs.current.get(activeKey);
		if (el && typeof el.scrollIntoView === "function") {
			el.scrollIntoView({ block: "nearest" });
		}
	}, [activeKey]);

	const blockingPosition = (() => {
		if (!activeRow || activeRow.section !== "blocking") return null;
		const idx = buckets.blocking.findIndex((t) => t.id === activeRow.threadId);
		return idx === -1 ? null : idx + 1;
	})();

	return (
		<div className="flex flex-col gap-[var(--density-gap)]" data-testid="conversations-submenu">
			<BlockingCounter total={globalBlockingTotal} position={blockingPosition} />
			{me !== null && <RoutingFilterChips active={filter} onChange={setFilter} me={me} />}
			<div className="flex flex-col gap-[var(--density-gap)]">
				{SECTIONS.map((sec) => {
					const rows = buckets[sec];
					return (
						<section key={sec} data-testid={`section-${sec}`} className="flex flex-col">
							{/*
							 * @lore L3 review (design W5): section header font
							 * raised from text-[10px] (off-scale) to
							 * text-[11px] which sits on the closed type
							 * allowlist (DESIGN.md § Typography).
							 */}
							<header
								data-testid="section-header"
								className={`flex items-center gap-2 px-[var(--density-pad-x)] py-[var(--density-pad-y)] text-[11px] uppercase tracking-wider text-[var(--text-lo)] font-mono ${
									sec === "pinned" ? "sticky top-0 bg-[var(--surface-1)] z-10" : ""
								}`}
							>
								<span>{SECTION_LABEL[sec]}</span>
								<span
									data-testid={`section-count-${sec}`}
									className="badge badge-sm badge-ghost font-mono tabular-nums"
								>
									{rows.length}
								</span>
							</header>
							{rows.length === 0 ? (
								// @lore L3 review (design W4): italic was off the
								// Lucid type system; a muted parenthetical reads
								// as the same "absence" cue without a typeface
								// shift the rest of the surface never uses.
								<p className="px-[var(--density-pad-x)] py-[var(--density-pad-y)] text-xs text-[var(--text-lo)]">
									(none)
								</p>
							) : (
								<ul className="flex flex-col">
									{rows.map((t) => {
										const flatIdx = flat.findIndex((r) => r.section === sec && r.threadId === t.id);
										const isActive = activeRow?.threadId === t.id && activeRow.section === sec;
										const isCoach = sec === "pinned" && isCoachThread(t);
										return (
											<SubmenuRow
												key={`${sec}:${t.id}`}
												thread={t}
												section={sec}
												isActive={isActive}
												isCoach={isCoach}
												now={now}
												rowRef={(el) => {
													const key = `${sec}:${t.id}`;
													if (el) rowRefs.current.set(key, el);
													else rowRefs.current.delete(key);
												}}
												onSelect={() => {
													if (flatIdx >= 0) setActiveIndex(flatIdx);
												}}
												onOpen={() => {
													if (flatIdx >= 0) setActiveIndex(flatIdx);
													onOpenThread?.(t.id, t.kind);
												}}
											/>
										);
									})}
								</ul>
							)}
						</section>
					);
				})}
			</div>
		</div>
	);
}

export { applyRoutingFilter, classify, compareWithinSection, groupAndSort };
