/**
 * Knowledge/List page — list with topic grouping (Curated) and
 * draft-item Triage view.
 *
 * @lore J6: the page reads scope from the URL search param `scope` so the
 * AppShell's Sidebar scope selector can drive it without lifting state out
 * of the page. Tab memory (Triage/Curated) stays in component state only —
 * AC explicitly forbids localStorage persistence here.
 *
 * @lore L22: Triage view fetches from /api/knowledge (the general list
 * endpoint). Sort controls use URL state (?sort=recency|frequency).
 * Default (no param) = relevance sort.
 *
 * @lore N5: Replaced all fixture imports with real API calls. Both Triage and
 * Curated tabs now read from /api/knowledge. The real schema has no layer/kind
 * columns — those were mock-only fields removed in O2. layer and kind are
 * rendered with fallback values ("L0" / "brief") when absent from the API.
 * Curation suggestions have no API yet so that block is suppressed.
 * Tab-default logic uses API status ("draft" = needs review, was "needs_human").
 * Scope param is preserved in the URL for future API filter support but does
 * not filter the item list today — the O2 schema has no scope column.
 *
 * @lore Q2: "+ New" button previously opened KnowledgeCreateDialog. Now navigates
 * to /knowledge/new (full-page create route). User-scoped items show a "Private"
 * tag in the list. scopeKind/scopeId fields added to ApiKnowledgeItem.
 *
 * @lore visual-parity: Page structure changed to flex flex-col h-full with
 * fixed header (non-scrolling) and flex-1 overflow-y-auto body, per AppShell
 * overflow-hidden contract. Visual treatment updated to match knowledge-list.html:
 * segmented pill tab control, outlined scope pills, plain-text sort bar,
 * inline KnowledgeListRow replacing KnowledgeRow primitive.
 */
import {
	Button,
	EmptyState,
	ErrorState,
	ItemList,
	knowledgeStatusToStatus,
	PageHeader,
	PageScaffold,
	Row,
	ScopePicker,
	SkeletonList,
	StatusChip,
} from "@hyperidle/design-system";
import type {
	KnowledgeScope,
	KnowledgeSortOption,
	KnowledgeStatus,
	KnowledgeTopicHealth,
} from "@hyperidle/domain-model";
import { KNOWLEDGE_SORT_OPTIONS, KNOWLEDGE_STATUS_LABEL } from "@hyperidle/domain-model";
import { relativeShort, stripMarkdown } from "@hyperidle/presentation-format";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KnowledgeTopicGroup } from "../components/KnowledgeTopicGroup";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useFetch } from "../hooks/useFetch";
import { apiFetch } from "../services/api-fetch.js";
import { clipExcerpt } from "../utils/clip-excerpt.js";
import { SCOPE_PILL_OPTIONS, type ScopePillOption } from "../utils/scope-labels";

type KnowledgeTab = "triage" | "curated";

/**
 * UI-045: Convert topic slugs from the API ("GENERAL", "PRODUCT-IDENTITY") to
 * human-readable title case ("General", "Product Identity").
 * Splits on hyphens, underscores, and spaces; title-cases each word.
 */
function slugToTitle(slug: string): string {
	return slug
		.toLowerCase()
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

/**
 * S1 fix: hoisted to module scope — was rebuilt per-row as new Set([...]) inside .map(),
 * one allocation per row per render. Single const reused across both triage and curated paths.
 */
const KNOWLEDGE_KINDS = new Set(["pattern", "decision", "failure"]);

/**
 * AF13 §3: Pure sort helper for knowledge items.
 * Returns a new array — does NOT mutate the input.
 *
 * recency:   updatedAt desc, tie-break title asc
 * frequency: accessCount30d desc null-last, tie-break updatedAt desc
 * relevance: relevanceScore desc null-last, tie-break updatedAt desc
 *
 * @lore AF13: Previously sort pills only changed the URL param but the item list
 * was never reordered. This function is applied both within topic groups (curated)
 * and to the flat triage list so sort pills actually do something.
 */
export function sortItems(items: ApiKnowledgeItem[], by: KnowledgeSortOption): ApiKnowledgeItem[] {
	return [...items].sort((a, b) => {
		if (by === "recency") {
			const cmp = b.updatedAt.localeCompare(a.updatedAt);
			if (cmp !== 0) return cmp;
			// tie-break: title asc
			return a.title.localeCompare(b.title);
		}
		if (by === "frequency") {
			const aScore = a.signals?.accessCount30d ?? null;
			const bScore = b.signals?.accessCount30d ?? null;
			if (aScore === null && bScore === null) {
				// both null: fall back to updatedAt desc
				return b.updatedAt.localeCompare(a.updatedAt);
			}
			if (aScore === null) return 1; // null-last
			if (bScore === null) return -1; // null-last
			const cmp = bScore - aScore;
			if (cmp !== 0) return cmp;
			return b.updatedAt.localeCompare(a.updatedAt);
		}
		// relevance
		const aRel = a.signals?.relevanceScore ?? null;
		const bRel = b.signals?.relevanceScore ?? null;
		if (aRel === null && bRel === null) {
			return b.updatedAt.localeCompare(a.updatedAt);
		}
		if (aRel === null) return 1;
		if (bRel === null) return -1;
		const cmp = bRel - aRel;
		if (cmp !== 0) return cmp;
		return b.updatedAt.localeCompare(a.updatedAt);
	});
}

function isKnowledgeScope(value: string | null): value is KnowledgeScope {
	return value === "practice" || value === "product" || value === "factory";
}

function deriveScope(searchParams: URLSearchParams): KnowledgeScope {
	const raw = searchParams.get("scope");
	return isKnowledgeScope(raw) ? raw : "practice";
}

function isKnowledgeSortOption(value: string | null): value is KnowledgeSortOption {
	return (KNOWLEDGE_SORT_OPTIONS as readonly string[]).includes(value ?? "");
}

function deriveSort(searchParams: URLSearchParams): KnowledgeSortOption {
	const raw = searchParams.get("sort");
	return isKnowledgeSortOption(raw) ? raw : "relevance";
}

/** Shape of an item returned by GET /api/knowledge */
interface ApiKnowledgeItem {
	id: string;
	topic: string | null;
	title: string;
	body: string;
	format: string;
	status: string;
	version: number;
	updatedBy: string;
	scopeKind?: string;
	scopeId?: string | null;
	createdAt: string;
	updatedAt: string;
	signals?: {
		lastActivityAt?: string | null;
		accessCount30d?: number | null;
		citationCount?: number | null;
		relevanceScore?: number | null;
		attentionScore?: number | null;
	} | null;
}

interface ApiKnowledgeListResponse {
	items: ApiKnowledgeItem[];
}

function toKnowledgeStatus(apiStatus: string): KnowledgeStatus {
	switch (apiStatus) {
		case "active":
			return "active";
		case "archived":
			return "archived";
		case "needs_human":
			return "needs_human";
		default:
			return "captured";
	}
}

function deriveTopicHealth(totalCount: number, archivedCount: number): KnowledgeTopicHealth {
	if (totalCount === 0 || archivedCount === 0) return "fresh";
	const ratio = archivedCount / totalCount;
	if (ratio >= 0.5) return "mostly_stale";
	return "some_stale";
}

function groupByTopic(items: ApiKnowledgeItem[]): Array<{
	topic: string;
	items: ApiKnowledgeItem[];
	staleCount: number;
	health: KnowledgeTopicHealth;
}> {
	const byTopic = new Map<string, ApiKnowledgeItem[]>();
	for (const item of items) {
		const key = item.topic ?? "General";
		const bucket = byTopic.get(key);
		if (bucket) {
			bucket.push(item);
		} else {
			byTopic.set(key, [item]);
		}
	}
	return Array.from(byTopic.entries()).map(([topic, topicItems]) => {
		const archivedCount = topicItems.filter((i) => i.status === "archived").length;
		return {
			topic,
			items: topicItems,
			staleCount: archivedCount,
			health: deriveTopicHealth(topicItems.length, archivedCount),
		};
	});
}

/**
 * Returns inline style for a knowledge kind badge.
 * Colors per mockup: Pattern → green, Decision → blue, Failure → red.
 * AI4 Note A: kind is NOT status — this stays local (Tag would be the ideal
 * primitive but kind badge style matches existing visual treatment).
 */
// @lore AZ7: the design system's closed status-presentation set is explicit
// that Tag/ReferenceChip/ArtifactKindBadge are "what an object IS", not a
// state — kind is NOT status.
// eslint-disable-next-line design/no-local-status-builder -- AI4 Note A: the name matches the rule's Badge+Style naming heuristic by coincidence; this builds a KIND treatment (Pattern/Decision/Failure), never a state.
function kindBadgeStyle(kind: string): { background: string; color: string } {
	const k = kind.toLowerCase();
	if (k === "pattern") {
		return { background: "var(--accent-primary-dim)", color: "var(--accent-primary)" };
	}
	if (k === "decision") {
		return {
			background: "color-mix(in oklab, var(--status-info) 8%, transparent)",
			color: "var(--status-info)",
		};
	}
	if (k === "failure") {
		return {
			background: "color-mix(in oklab, var(--status-error) 8%, transparent)",
			color: "var(--status-error)",
		};
	}
	return { background: "var(--surface-container)", color: "var(--text-secondary)" };
}

// AG6: KnowledgeListRow deleted. Rows now rendered via Row + ItemList variant="flush".

interface KnowledgeListContentProps {
	tab: KnowledgeTab;
	sort: KnowledgeSortOption;
	scope: KnowledgeScope;
	/** AD6: The currently selected static scope pill option. null = "All". */
	selectedScopePill: ScopePillOption | null;
	onScopePillChange: (pill: ScopePillOption | null) => void;
	onSortChange: (option: KnowledgeSortOption) => void;
	grouped: Array<{
		topic: string;
		items: ApiKnowledgeItem[];
		staleCount: number;
		health: KnowledgeTopicHealth;
	}>;
	triageItems: ApiKnowledgeItem[];
	apiLoading: boolean;
	apiError: string | null;
	isCuratedEmpty: boolean;
	isTriageEmpty: boolean;
	onNavigate: (id: string) => void;
	searchQuery: string;
	/** Y4: called when the user validates (active) or rejects (archived) a triage item. */
	onTriageAction: (itemId: string, newStatus: "active" | "archived") => void;
	/** UI-010/UI-015: re-issues the /api/knowledge request from the error state. */
	onRetry?: () => void;
}

function KnowledgeListContent({
	tab,
	sort,
	scope,
	selectedScopePill,
	onScopePillChange,
	onSortChange,
	grouped,
	triageItems,
	apiLoading,
	apiError,
	isCuratedEmpty,
	isTriageEmpty,
	onNavigate,
	searchQuery,
	onTriageAction,
	onRetry,
}: KnowledgeListContentProps): JSX.Element {
	// Y4: keyboard navigation state for triage items (-1 = no focus)
	const [focusedIndex, setFocusedIndex] = useState<number>(-1);

	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredTriageItems = normalizedQuery
		? triageItems.filter((i) => i.title.toLowerCase().includes(normalizedQuery))
		: triageItems;
	const filteredGrouped = normalizedQuery
		? grouped
				.map((g) => ({
					...g,
					items: g.items.filter((i) => i.title.toLowerCase().includes(normalizedQuery)),
				}))
				.filter((g) => g.items.length > 0)
		: grouped;

	// Y4: keyboard navigation handler for triage tab
	useEffect(() => {
		if (tab !== "triage") return;

		function handleKeyDown(e: KeyboardEvent): void {
			const target = e.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName.toLowerCase();
				if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
			}

			if (e.key === "j" || e.key === "ArrowDown") {
				e.preventDefault();
				setFocusedIndex((prev) => {
					const next = prev + 1;
					return next >= filteredTriageItems.length ? prev : next;
				});
			} else if (e.key === "k" || e.key === "ArrowUp") {
				e.preventDefault();
				setFocusedIndex((prev) => {
					const next = prev - 1;
					return next < 0 ? 0 : next;
				});
			} else if (e.key === "Escape") {
				e.preventDefault();
				setFocusedIndex(-1);
			} else if (e.key === "v") {
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < filteredTriageItems.length) {
					const item = filteredTriageItems[focusedIndex];
					if (item) onTriageAction(item.id, "active");
				}
			} else if (e.key === "x") {
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < filteredTriageItems.length) {
					const item = filteredTriageItems[focusedIndex];
					if (item) onTriageAction(item.id, "archived");
				}
			} else if (e.key === "Enter" || e.key === "o") {
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < filteredTriageItems.length) {
					const item = filteredTriageItems[focusedIndex];
					if (item) onNavigate(item.id);
				}
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [tab, focusedIndex, filteredTriageItems, onTriageAction, onNavigate]);

	// Y4: reset focused index when triage items change (e.g. after optimistic removal)
	useEffect(() => {
		setFocusedIndex((prev) => {
			if (filteredTriageItems.length === 0) return -1;
			if (prev >= filteredTriageItems.length) return filteredTriageItems.length - 1;
			return prev;
		});
	}, [filteredTriageItems.length]);

	return (
		<div className="max-w-[800px] w-full">
			{/*
			 * AD6: Static 4-pill scope filter row.
			 * All → no filter | Shared → factory+product+practice | Team → team | Private → user.
			 * AI5: consolidated to the shared ScopePicker primitive (filter mode).
			 * The "All" pill (filterKinds=null) maps to value=null; selecting any
			 * other pill resolves the id back to its SCOPE_PILL_OPTIONS entry.
			 */}
			<div className="pt-[12px]">
				<ScopePicker
					mode="filter"
					options={SCOPE_PILL_OPTIONS}
					value={selectedScopePill?.id ?? null}
					onChange={(id) =>
						onScopePillChange(
							id === null ? null : (SCOPE_PILL_OPTIONS.find((p) => p.id === id) ?? null),
						)
					}
					ariaLabel="Filter by scope"
					testIdPrefix="scope-pill"
					dataTestId="knowledge-scope-pills"
				/>
			</div>

			<span data-testid="knowledge-scope-indicator" className="sr-only">
				{scope}
			</span>

			{/* AF13 §3: Sort pills changed from role=radio to plain buttons so
			    getByRole("button", { name: /recency/ }) works in tests.
			    @lore AF13: role="radio" buttons are not found by getByRole("button"),
			    since explicit role overrides the implicit element role. */}
			<div
				role="group"
				aria-label="Sort order"
				data-testid="knowledge-sort-bar"
				className="flex items-center gap-[9px] py-[9px]"
			>
				<span className="type-metadata  text-[var(--text-tertiary)]">Sort:</span>
				{KNOWLEDGE_SORT_OPTIONS.map((option) => {
					const isActive = sort === option;
					return (
						<button
							key={option}
							type="button"
							aria-pressed={isActive}
							// @lore AF13: aria-checked kept alongside aria-pressed so U9 test
							// [aria-checked='true'] query still passes. role="radio" was removed
							// because it prevents getByRole("button") from finding these pills.
							aria-checked={isActive}
							onClick={() => onSortChange(option)}
							className={`type-control ${
								isActive
									? " text-[var(--accent-deep)]  cursor-pointer bg-transparent border-none capitalize"
									: " text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none capitalize"
							}`}
						>
							{option}
						</button>
					);
				})}
			</div>

			{tab === "triage" ? (
				// @lore UI-125: block (not flex) so sticky bottom-0 on the hint bar resolves
				// to the scroll container (overflow-y-auto), not to this flex container.
				// position:sticky's containing block for flex items is the flex parent,
				// which has no overflow — so sticky never fired. Block flow lets it find
				// the real scroll ancestor.
				<div data-testid="knowledge-triage-view">
					{apiLoading ? (
						<div className="py-[12px]">
							<SkeletonList rows={4} ariaLabel="Loading triage items" />
						</div>
					) : apiError ? (
						<div className="py-[12px]">
							<ErrorState
								title="Couldn't load knowledge"
								description={apiError}
								onRetry={onRetry}
							/>
						</div>
					) : isTriageEmpty || filteredTriageItems.length === 0 ? (
						<div className="flex items-center justify-center p-[48px_24px]">
							<EmptyState
								title={normalizedQuery ? "No results" : "Nothing needs attention"}
								description={
									normalizedQuery
										? `No triage items match "${searchQuery}".`
										: "Triage is clear — agents will surface draft items here as they learn."
								}
								dataTestId="knowledge-triage-empty"
							/>
						</div>
					) : (
						<>
							<ItemList variant="flush" as="ul" isEmpty={filteredTriageItems.length === 0}>
								{filteredTriageItems.map((item, index) => {
									const isPrivate = item.scopeKind === "user";
									// AG6/AD6: kind-badge only renders for explicit knowledge-kind values.
									// "factory","product","practice","team","user" are scope values — no badge.
									// @lore AG6: AD6 AC-4 (kind badge removed from rows) coexists with AG6
									// protected kind-badge testid because real scopeKind values are scope
									// identifiers; only "pattern"/"decision"/"failure" render a kind badge.
									const itemKind =
										item.scopeKind && KNOWLEDGE_KINDS.has(item.scopeKind)
											? item.scopeKind
											: undefined;
									const kStyle = itemKind ? kindBadgeStyle(itemKind) : null;
									const itemStatus = toKnowledgeStatus(item.status);
									return (
										<Row
											key={item.id}
											as="li"
											data-testid="knowledge-row"
											data-focused={focusedIndex === index ? "true" : undefined}
											title={item.title}
											subtitle={
												item.body ? clipExcerpt(stripMarkdown(item.body)) || undefined : undefined
											}
											cells={[
												...(isPrivate
													? [
															{
																content: (
																	<span
																		className="type-metadata inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)]   whitespace-nowrap"
																		style={{
																			background: "var(--surface-container)",
																			color: "var(--text-secondary)",
																		}}
																		title="Private — only visible to you"
																	>
																		Private
																	</span>
																),
																"data-testid": "private-badge" as const,
															},
														]
													: []),
												...(itemKind && kStyle
													? [
															{
																content: (
																	<span
																		className="type-metadata inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)]   whitespace-nowrap"
																		style={kStyle}
																	>
																		{itemKind}
																	</span>
																),
																"data-testid": "kind-badge" as const,
															},
														]
													: []),
												...(itemStatus === "active" || itemStatus === "archived"
													? [
															{
																content: (
																	<span data-testid="status-badge">
																		<StatusChip
																			status={knowledgeStatusToStatus(itemStatus)}
																			label={KNOWLEDGE_STATUS_LABEL[itemStatus]}
																		/>
																	</span>
																),
															},
														]
													: []),
												{
													content: relativeShort(item.updatedAt),
													"data-testid": "knowledge-time" as const,
												},
											]}
											actions={
												<div className="flex items-center gap-[3px]">
													<button
														type="button"
														aria-label="Validate"
														title="Validate"
														onClick={(e) => {
															e.stopPropagation();
															onTriageAction(item.id, "active");
														}}
														className="w-[24px] h-[24px] flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] border-none bg-transparent cursor-pointer"
													>
														<svg
															width="14"
															height="14"
															viewBox="0 0 16 16"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
															aria-hidden="true"
														>
															<path d="M2 8l4 4 8-8" />
														</svg>
													</button>
													<button
														type="button"
														aria-label="Reject"
														title="Reject"
														onClick={(e) => {
															e.stopPropagation();
															onTriageAction(item.id, "archived");
														}}
														className="w-[24px] h-[24px] flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] border-none bg-transparent cursor-pointer"
													>
														<svg
															width="14"
															height="14"
															viewBox="0 0 16 16"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
															aria-hidden="true"
														>
															<path d="M2 2l12 12M14 2L2 14" />
														</svg>
													</button>
													<button
														type="button"
														aria-label="Open"
														title="Open"
														onClick={(e) => {
															e.stopPropagation();
															onNavigate(item.id);
														}}
														className="w-[24px] h-[24px] flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] border-none bg-transparent cursor-pointer"
													>
														<svg
															width="14"
															height="14"
															viewBox="0 0 16 16"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
															aria-hidden="true"
														>
															<path d="M3 8h10M8 3l5 5-5 5" />
														</svg>
													</button>
												</div>
											}
											onClick={() => onNavigate(item.id)}
										/>
									);
								})}
							</ItemList>
							{/* Y4: keyboard hint bar — sticky so it remains visible while scrolling triage
							    @lore NEW-26: hidden below sm (640px) — touch viewports have no keyboard;
							    j/k/Enter/v/x shortcuts are useless on mobile and the bar wastes a full row. */}
							<div
								data-testid="triage-keyboard-hint"
								className="type-metadata border-width-thin-t sticky bottom-0 hidden sm:flex items-center gap-[12px] py-[9px] border-[var(--border-subtle)] text-[var(--text-tertiary)] bg-[var(--surface-page)]"
							>
								<span>
									<kbd className="border-width-thin type-data inline-flex items-center px-[4px] py-[2px] rounded-[var(--r-subtle)] bg-[var(--surface-container)]    border-[var(--border-subtle)]">
										j
									</kbd>
									<kbd className="border-width-thin type-data inline-flex items-center px-[4px] py-[2px] rounded-[var(--r-subtle)] bg-[var(--surface-container)]    border-[var(--border-subtle)] ml-[3px]">
										k
									</kbd>
									&nbsp;navigate
								</span>
								<span>
									<kbd className="border-width-thin type-data inline-flex items-center px-[4px] py-[2px] rounded-[var(--r-subtle)] bg-[var(--surface-container)]    border-[var(--border-subtle)]">
										Enter
									</kbd>
									&nbsp;open
								</span>
								<span>
									<kbd className="border-width-thin type-data inline-flex items-center px-[4px] py-[2px] rounded-[var(--r-subtle)] bg-[var(--surface-container)]    border-[var(--border-subtle)]">
										v
									</kbd>
									&nbsp;validate
								</span>
								<span>
									<kbd className="border-width-thin type-data inline-flex items-center px-[4px] py-[2px] rounded-[var(--r-subtle)] bg-[var(--surface-container)]    border-[var(--border-subtle)]">
										x
									</kbd>
									&nbsp;reject
								</span>
							</div>
						</>
					)}
				</div>
			) : (
				<div className="flex flex-col" data-testid="knowledge-curated-view">
					{apiLoading ? (
						<div className="py-[12px]">
							<SkeletonList rows={4} ariaLabel="Loading curated items" />
						</div>
					) : apiError ? (
						/* UI-010: a 500/network failure must show an error state with retry,
						 * not the "No knowledge items yet" empty state (which implies success). */
						<div className="py-[12px]">
							<ErrorState
								title="Couldn't load knowledge"
								description={apiError}
								onRetry={onRetry}
							/>
						</div>
					) : isCuratedEmpty ? (
						<div className="flex items-center justify-center p-[48px_24px]">
							<EmptyState
								title="No knowledge items yet"
								description="Agents will populate this scope as they learn. Check back after the next review cycle."
								dataTestId="knowledge-curated-empty"
							/>
						</div>
					) : (
						filteredGrouped.map((g) => (
							<KnowledgeTopicGroup
								key={g.topic}
								topic={slugToTitle(g.topic)}
								itemCount={g.items.length}
								staleCount={g.staleCount}
								health={g.health}
							>
								<ItemList variant="flush" as="ul" isEmpty={g.items.length === 0}>
									{g.items.map((item) => {
										const isPrivate = item.scopeKind === "user";
										// AG6/AD6: kind-badge only for knowledge-kind values, not scope values.
										const itemKind =
											item.scopeKind && KNOWLEDGE_KINDS.has(item.scopeKind)
												? item.scopeKind
												: undefined;
										const kStyle = itemKind ? kindBadgeStyle(itemKind) : null;
										return (
											<Row
												key={item.id}
												as="li"
												data-testid="knowledge-row"
												title={item.title}
												subtitle={
													item.body ? clipExcerpt(stripMarkdown(item.body)) || undefined : undefined
												}
												cells={[
													...(isPrivate
														? [
																{
																	content: (
																		<span
																			className="type-metadata inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)]   whitespace-nowrap"
																			style={{
																				background: "var(--surface-container)",
																				color: "var(--text-secondary)",
																			}}
																			title="Private — only visible to you"
																		>
																			Private
																		</span>
																	),
																	"data-testid": "private-badge" as const,
																},
															]
														: []),
													...(itemKind && kStyle
														? [
																{
																	content: (
																		<span
																			className="type-metadata inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)]   whitespace-nowrap"
																			style={kStyle}
																		>
																			{itemKind}
																		</span>
																	),
																	"data-testid": "kind-badge" as const,
																},
															]
														: []),
													{
														content: relativeShort(item.updatedAt),
														"data-testid": "knowledge-time" as const,
													},
												]}
												onClick={() => onNavigate(item.id)}
											/>
										);
									})}
								</ItemList>
							</KnowledgeTopicGroup>
						))
					)}
				</div>
			)}
		</div>
	);
}

export interface KnowledgeListProps {
	loading?: boolean;
	error?: { message: string; onRetry?: () => void } | null;
}

export function KnowledgeList({
	loading = false,
	error = null,
}: KnowledgeListProps = {}): JSX.Element {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const scope = deriveScope(searchParams);
	const sort = deriveSort(searchParams);
	const { user } = useCurrentUser();

	const [tab, setTab] = useState<KnowledgeTab>("triage");
	const tabManuallySelectedRef = useRef(false);
	/**
	 * AD6: selectedScopePill — null means "All" (no filter).
	 * Replaces the old dynamic string-keyed selectedScopeFilter.
	 */
	const [selectedScopePill, setSelectedScopePill] = useState<ScopePillOption | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	// AF13 §6: Replace optimisticRemovals (Set<id>) with optimisticStatuses (Map<id, status>).
	// A validated item gets status "active" so it moves to Curated in the same render.
	// A rejected item gets status "archived" so it leaves Triage and does not appear in Curated.
	// On PATCH failure, the map entry is deleted to revert the item to its original status.
	// @lore AF13: The old Set only removed items from Triage but never added them to Curated.
	// The Map approach applies status overrides before the triage/curated split so one render
	// handles both the departure from Triage and the arrival in Curated.
	const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, "active" | "archived">>(
		new Map(),
	);

	const {
		data: apiData,
		isLoading: apiLoading,
		error: apiError,
		refetch: apiRefetch,
	} = useFetch<ApiKnowledgeListResponse>("/api/knowledge");

	const allItems = useMemo<ApiKnowledgeItem[]>(() => apiData?.items ?? [], [apiData]);

	/**
	 * AD6: Apply static scope filter before triage/curated split.
	 * null pill → all items | specific pill → only items whose scopeKind is in filterKinds.
	 * AF13: Also applies optimisticStatuses overrides so triage/curated split reflects
	 * the immediate user action without waiting for refetch.
	 */
	const scopeFilteredItems = useMemo<ApiKnowledgeItem[]>(() => {
		// Apply optimistic status overrides before scope filter
		const withOverrides =
			optimisticStatuses.size > 0
				? allItems.map((i) => {
						const override = optimisticStatuses.get(i.id);
						return override !== undefined ? { ...i, status: override } : i;
					})
				: allItems;
		if (selectedScopePill === null || selectedScopePill.filterKinds === null) return withOverrides;
		const allowed = new Set<string>(selectedScopePill.filterKinds);
		return withOverrides.filter((i) => i.scopeKind !== undefined && allowed.has(i.scopeKind));
	}, [allItems, selectedScopePill, optimisticStatuses]);

	// Y4: triage includes both draft and needs_human items, sorted by attentionScore descending
	// AF13 §3: sortItems applied after triage filter to honour sort pill selection.
	const triageItems = useMemo<ApiKnowledgeItem[]>(() => {
		const raw = scopeFilteredItems.filter(
			(i) => i.status === "draft" || i.status === "needs_human",
		);
		// Sort by attentionScore descending — items with no score go last; then apply sort pill
		const byAttention = raw.slice().sort((a, b) => {
			const aScore = a.signals?.attentionScore ?? null;
			const bScore = b.signals?.attentionScore ?? null;
			if (aScore === null && bScore === null) return 0;
			if (aScore === null) return 1;
			if (bScore === null) return -1;
			return bScore - aScore;
		});
		// AF13 §3: apply sort pill on top of attentionScore ordering
		return sort === "relevance" ? byAttention : sortItems(byAttention, sort);
	}, [scopeFilteredItems, sort]);

	const curatedItems = useMemo<ApiKnowledgeItem[]>(
		() => scopeFilteredItems.filter((i) => i.status === "active"),
		[scopeFilteredItems],
	);

	// AF13 §3: Apply sortItems within each topic group so sort pills reorder curated view.
	const grouped = useMemo(
		() =>
			groupByTopic(curatedItems).map((g) => ({
				...g,
				items: sort === "relevance" ? g.items : sortItems(g.items, sort),
			})),
		[curatedItems, sort],
	);

	const prevScopeRef = useRef(scope);
	useEffect(() => {
		if (prevScopeRef.current !== scope) {
			tabManuallySelectedRef.current = false;
			prevScopeRef.current = scope;
		}
		if (tabManuallySelectedRef.current) return;
		// Y4: auto-tab checks needs_human as well as draft
		const hasTriage = allItems.some((i) => i.status === "draft" || i.status === "needs_human");
		setTab(hasTriage ? "triage" : "curated");
	}, [allItems, scope]);

	// AF13 §6: Optimistic status-override + PATCH for triage actions.
	// Uses Map<id, status> instead of Set<id> so validated items appear in Curated
	// immediately (override status → "active") rather than vanishing from all tabs.
	// @lore Y4-F01: must use apiFetch (not raw fetch) so X-API-Key is injected.
	// @lore Y4-F02: item.version prevents 409 on items at version 2+; user.id
	//   replaces the hardcoded "founder" so the audit trail is correct.
	// @lore AF13: On PATCH failure, the override entry is deleted to restore the
	//   original status so the item reappears in Triage for retry.
	function handleTriageAction(itemId: string, newStatus: "active" | "archived"): void {
		const item = allItems.find((i) => i.id === itemId);
		const version = item?.version ?? 1;
		const updatedBy = user?.id ?? "unknown";

		// Optimistically override status (validated → active, rejected → archived)
		setOptimisticStatuses((prev) => new Map([...prev, [itemId, newStatus]]));

		void (async (): Promise<void> => {
			try {
				const res = await apiFetch(`/api/knowledge/${itemId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ version, updatedBy, status: newStatus }),
				});
				if (!res.ok) {
					// Revert optimistic override so the item reappears in Triage for retry
					setOptimisticStatuses((prev) => {
						const next = new Map(prev);
						next.delete(itemId);
						return next;
					});
				}
			} catch {
				// Network error — revert so the user can retry
				setOptimisticStatuses((prev) => {
					const next = new Map(prev);
					next.delete(itemId);
					return next;
				});
			}
		})();
	}

	function handleSortChange(newSort: KnowledgeSortOption): void {
		const next = new URLSearchParams(searchParams);
		if (newSort === "relevance") {
			next.delete("sort");
		} else {
			next.set("sort", newSort);
		}
		setSearchParams(next, { replace: true });
	}

	if (loading) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Knowledge" />}
				data-testid="knowledge-list-page"
			>
				<SkeletonList rows={6} ariaLabel="Loading knowledge" />
			</PageScaffold>
		);
	}

	if (error) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Knowledge" />}
				data-testid="knowledge-list-page"
			>
				<ErrorState
					title="Couldn't load knowledge"
					description={error.message}
					onRetry={error.onRetry}
				/>
			</PageScaffold>
		);
	}

	// UI-010: only show "system empty" when there is no API error — a 500/429 must
	// surface as an error state (ErrorState + retry), NOT as "your knowledge base is empty".
	const systemEmpty = allItems.length === 0 && !apiLoading && !apiError;
	const isCuratedEmpty = grouped.length === 0 && !apiLoading;
	const isTriageEmpty = triageItems.length === 0 && !apiLoading;

	return (
		<PageScaffold
			frame="page"
			data-testid="knowledge-list-page"
			header={
				/* AI7: PageHeader — Knowledge title + tabs + search + New button in actions.
				    When systemEmpty: title only. When populated: tabs + search + New in actions. */
				<PageHeader
					title={
						<>
							<span className="sr-only">Knowledge Base</span>
							Knowledge
						</>
					}
					actions={
						!systemEmpty ? (
							<div className="flex items-center gap-[9px]">
								{/* Curated/Triage tabs */}
								<div
									role="tablist"
									aria-label="Knowledge view"
									className="inline-flex gap-[6px] bg-[var(--surface-container)] rounded-[var(--r-pill)] p-[3px]"
									data-testid="knowledge-tabs"
								>
									<button
										type="button"
										role="tab"
										aria-selected={tab === "curated"}
										className={`type-control ${
											tab === "curated"
												? "px-[12px] py-[6px] rounded-[var(--r-pill)]   bg-[var(--surface-elevated)] text-[var(--accent-deep)] shadow-[var(--shadow-subtle)] cursor-pointer border-none"
												: "px-[12px] py-[6px] rounded-[var(--r-pill)]   text-[var(--text-secondary)] cursor-pointer border-none bg-transparent"
										}`}
										onClick={() => {
											tabManuallySelectedRef.current = true;
											setTab("curated");
										}}
									>
										Curated
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={tab === "triage"}
										className={`type-control ${
											tab === "triage"
												? "px-[12px] py-[6px] rounded-[var(--r-pill)]   bg-[var(--surface-elevated)] text-[var(--accent-deep)] shadow-[var(--shadow-subtle)] cursor-pointer border-none"
												: "px-[12px] py-[6px] rounded-[var(--r-pill)]   text-[var(--text-secondary)] cursor-pointer border-none bg-transparent"
										}`}
										onClick={() => {
											tabManuallySelectedRef.current = true;
											setTab("triage");
										}}
									>
										Triage
									</button>
								</div>
								{/* Search + New */}
								{/* hearth-internal-padding */}
								{/* @lore NEW-25: 200px fixed width overflows the 375px viewport
								 * alongside the tab pills and "+ New" button. Hidden below sm
								 * (640px) where there is no room — filtering on mobile is a
								 * secondary interaction and the tab pivot still works. */}
								<input
									type="search"
									aria-label="Filter knowledge"
									data-testid="knowledge-search"
									placeholder="Filter…"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									style={{
										width: "200px",
										borderRadius: "var(--r-pill)",
										border: "var(--bw-default) solid var(--border-default)",
										padding: "7px 12px",
										background: "var(--surface-page)",
										color: "var(--text-primary)",
										outline: "none",
									}}
									className="type-input hidden sm:inline"
								/>
								{/* AI5: shared Button primitive. */}
								<Button variant="primary" size="sm" onClick={() => navigate("/knowledge/new")}>
									+ New
								</Button>
							</div>
						) : undefined
					}
				/>
			}
		>
			{systemEmpty ? (
				<div className="flex items-center justify-center p-[48px_24px] h-full">
					<EmptyState
						title="Your knowledge base is empty"
						description="Knowledge items capture patterns, decisions, and lessons learned. As your agents work, they will start indexing insights here automatically. You can also add items manually."
						icon={
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
								<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
							</svg>
						}
						iconBg="rgba(46,125,186,0.08)"
						action={
							/* AI5: shared Button primitive. */
							<Button variant="primary" onClick={() => navigate("/knowledge/new")}>
								Create first item
							</Button>
						}
						dataTestId="knowledge-curated-empty"
					/>
				</div>
			) : (
				<KnowledgeListContent
					tab={tab}
					sort={sort}
					scope={scope}
					selectedScopePill={selectedScopePill}
					onScopePillChange={setSelectedScopePill}
					onSortChange={handleSortChange}
					grouped={grouped}
					triageItems={triageItems}
					apiLoading={apiLoading}
					apiError={apiError}
					isCuratedEmpty={isCuratedEmpty}
					isTriageEmpty={isTriageEmpty}
					onNavigate={(id) => navigate(`/knowledge/${id}`)}
					searchQuery={searchQuery}
					onTriageAction={handleTriageAction}
					onRetry={apiRefetch}
				/>
			)}
		</PageScaffold>
	);
}
