import { EmptyState, ErrorState, KnowledgeRow, SkeletonList } from "@hyperidle/design-system";
/**
 * Knowledge/List page — scope-aware list with topic grouping (Curated) and
 * attention-scored Triage view (J6).
 *
 * @lore J6: the page reads scope from the URL search param `scope` so the
 * AppShell's Submenu scope browser can drive it without lifting state out
 * of the page. Tab memory (Triage/Curated) stays in component state only —
 * AC explicitly forbids localStorage persistence here.
 *
 * @lore L22: Triage view now fetches from /api/knowledge/L3 for real items
 * with signals. Sort controls use URL state (?sort=recency|frequency).
 * Default (no param) = relevance sort.
 */
import type { KnowledgeScope, KnowledgeSortOption } from "@hyperidle/fabric";
import { KNOWLEDGE_SORT_OPTIONS } from "@hyperidle/fabric";
import { type JSX, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CurationSuggestionCard } from "../components/CurationSuggestionCard";
import { KnowledgeTopicGroup } from "../components/KnowledgeTopicGroup";
// eslint-disable-next-line design/no-mock-data-import -- tracked in #93
import {
	curationSuggestions,
	groupItemsByTopic,
	knowledgeItems,
	type MockKnowledgeItem,
} from "../fixtures/knowledge-data";
import { useFetch } from "../hooks/useFetch";
import { relativeTime } from "../utils/relative-time";

type KnowledgeTab = "triage" | "curated";

const REASON_MAX_CHARS = 60;

function truncateReason(reason: string): string {
	if (reason.length <= REASON_MAX_CHARS) return reason;
	return `${reason.slice(0, REASON_MAX_CHARS - 1)}…`;
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

/** Shape of an item returned by GET /api/knowledge/:layer with signals. */
interface ApiKnowledgeItem {
	id: string;
	layer: string;
	kind: string;
	status: string;
	title: string;
	updatedAt: string;
	relevanceScore?: number | null;
	signals?: {
		lastActivityAt?: string | null;
		accessCount30d?: number | null;
		citationCount?: number | null;
		relevanceScore?: number | null;
	} | null;
}

interface ApiKnowledgeListResponse {
	layer: string;
	items: ApiKnowledgeItem[];
	groups?: Record<string, Record<string, ApiKnowledgeItem[]>>;
}

/** Sort a list of API items by the given sort option. */
function sortApiItems(items: ApiKnowledgeItem[], sort: KnowledgeSortOption): ApiKnowledgeItem[] {
	const copy = [...items];
	switch (sort) {
		case "recency":
			return copy.sort((a, b) => {
				const aAt = a.signals?.lastActivityAt ?? null;
				const bAt = b.signals?.lastActivityAt ?? null;
				if (aAt === null && bAt === null) return a.id.localeCompare(b.id);
				if (aAt === null) return 1;
				if (bAt === null) return -1;
				const primary = bAt.localeCompare(aAt); // most recent first
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
		case "frequency":
			return copy.sort((a, b) => {
				const aCount = a.signals?.accessCount30d ?? null;
				const bCount = b.signals?.accessCount30d ?? null;
				if (aCount === null && bCount === null) return a.id.localeCompare(b.id);
				if (aCount === null) return 1;
				if (bCount === null) return -1;
				const primary = bCount - aCount; // highest frequency first
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
		case "relevance":
		default:
			return copy.sort((a, b) => {
				const aScore = a.signals?.relevanceScore ?? a.relevanceScore ?? null;
				const bScore = b.signals?.relevanceScore ?? b.relevanceScore ?? null;
				if (aScore === null && bScore === null) return a.id.localeCompare(b.id);
				if (aScore === null) return 1;
				if (bScore === null) return -1;
				const primary = bScore - aScore; // highest relevance first
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
	}
}

export interface KnowledgeListProps {
	/**
	 * J8: opt-in loading state so callers (and stories) can render the
	 * skeleton list variant. Defaults to false so production render path
	 * is unchanged.
	 */
	loading?: boolean;
	/** J8: opt-in error state. When present, ErrorState takes over. */
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

	// @lore J6 AC: tab choice remembered in component state only — NOT
	// localStorage. Default recomputed below whenever `scope` changes.
	const [tab, setTab] = useState<KnowledgeTab>("triage");

	const scopedItems = useMemo<ReadonlyArray<MockKnowledgeItem>>(
		() => knowledgeItems.filter((i) => i.scope === scope),
		[scope],
	);
	const scopedSuggestions = useMemo(
		() => curationSuggestions.filter((s) => s.scope === scope),
		[scope],
	);
	// AC: "Default to Triage when any items have status === 'needs_human', else
	// Curated." Also AC: "Switching scope resets list selection and filters."
	useEffect(() => {
		const needsHuman = knowledgeItems.some((i) => i.scope === scope && i.status === "needs_human");
		setTab(needsHuman ? "triage" : "curated");
	}, [scope]);

	const grouped = useMemo(() => groupItemsByTopic(scopedItems), [scopedItems]);

	const triageSorted = useMemo<ReadonlyArray<MockKnowledgeItem>>(
		() => [...scopedItems].sort((a, b) => b.attentionScore - a.attentionScore),
		[scopedItems],
	);

	// L22: fetch from /api/knowledge/L3 for triage items with signals
	const { data: apiData, isLoading: apiLoading } = useFetch<ApiKnowledgeListResponse>(
		tab === "triage" ? "/api/knowledge/L3" : null,
	);

	const apiItems = useMemo<ApiKnowledgeItem[]>(() => {
		if (!apiData?.items) return [];
		return sortApiItems(apiData.items, sort);
	}, [apiData, sort]);

	/** Update sort URL state. Removes param when defaulting to relevance. */
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
			<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
				<SkeletonList rows={6} ariaLabel="Loading knowledge" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
				<ErrorState
					title="Couldn't load knowledge"
					description={error.message}
					onRetry={error.onRetry}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
			<div className="flex items-center justify-between">
				<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
					Knowledge Base
				</h1>
				<span
					className="badge badge-sm badge-ghost font-mono"
					data-testid="knowledge-scope-indicator"
				>
					{scope}
				</span>
			</div>

			<div
				role="tablist"
				aria-label="Knowledge view"
				className="flex gap-1"
				data-testid="knowledge-tabs"
			>
				<button
					type="button"
					role="tab"
					aria-selected={tab === "triage"}
					className={tab === "triage" ? "btn btn-xs btn-neutral" : "btn btn-xs btn-ghost"}
					onClick={() => setTab("triage")}
				>
					Triage
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === "curated"}
					className={tab === "curated" ? "btn btn-xs btn-neutral" : "btn btn-xs btn-ghost"}
					onClick={() => setTab("curated")}
				>
					Curated
				</button>
			</div>

			{tab === "triage" ? (
				<div className="flex flex-col gap-2" data-testid="knowledge-triage-view">
					{scopedSuggestions.length > 0 && (
						<div
							className="flex flex-col gap-2"
							data-testid="curation-suggestions"
							aria-label="Curation suggestions"
						>
							{scopedSuggestions.map((s) => (
								<CurationSuggestionCard key={s.id} action={s.action} detail={s.detail} />
							))}
						</div>
					)}

					{/* L22 sort controls — radiogroup semantics per accessibility spec */}
					<div
						role="radiogroup"
						aria-label="Sort order"
						data-testid="knowledge-sort-controls"
						className="flex items-center gap-1"
					>
						{KNOWLEDGE_SORT_OPTIONS.map((option) => {
							const isActive = sort === option;
							return (
								<button
									key={option}
									type="button"
									role="radio"
									aria-checked={isActive}
									onClick={() => handleSortChange(option)}
									className={
										isActive
											? "btn btn-xs btn-neutral capitalize"
											: "btn btn-xs btn-ghost capitalize"
									}
								>
									{option}
								</button>
							);
						})}
					</div>

					{apiLoading ? (
						<SkeletonList rows={4} ariaLabel="Loading triage items" />
					) : apiItems.length > 0 ? (
						<div className="flex flex-col">
							{apiItems.map((item) => {
								const signals = item.signals
									? {
											recency: item.signals.lastActivityAt
												? relativeTime(item.signals.lastActivityAt)
												: null,
											frequency: item.signals.accessCount30d ?? null,
											citation: item.signals.citationCount ?? null,
										}
									: undefined;
								return (
									<KnowledgeRow
										key={item.id}
										title={item.title}
										layer={item.layer as "L0" | "L1" | "L2" | "L3" | "L4"}
										kind={
											item.kind as
												| "pattern"
												| "anti_pattern"
												| "brief"
												| "principle"
												| "decision"
												| "failure"
												| "reflection"
												| "focus"
										}
										status={
											item.status as
												| "captured"
												| "provisional"
												| "validated"
												| "active"
												| "stale"
												| "archived"
												| "needs_human"
										}
										timestamp={relativeTime(item.updatedAt)}
										signals={signals}
										onClick={() => navigate(`/knowledge/${item.id}`)}
									/>
								);
							})}
						</div>
					) : triageSorted.length === 0 ? (
						<EmptyState
							title="Nothing needs attention"
							description="Triage is clear for this scope — agents will surface new items here as they learn."
							dataTestId="knowledge-triage-empty"
						/>
					) : (
						<div className="flex flex-col">
							{triageSorted.map((item) => (
								<KnowledgeRow
									key={item.id}
									title={item.title}
									layer={item.layer}
									kind={item.kind}
									status={item.status}
									timestamp={item.timestamp}
									caption={truncateReason(item.whyNow)}
									onClick={() => navigate(`/knowledge/${item.id}`)}
								/>
							))}
						</div>
					)}
				</div>
			) : (
				<div className="flex flex-col gap-2" data-testid="knowledge-curated-view">
					{grouped.length === 0 ? (
						<EmptyState
							title="No knowledge items yet"
							description="Agents will populate this scope as they learn. Check back after the next review cycle."
							dataTestId="knowledge-curated-empty"
						/>
					) : (
						grouped.map((g) => (
							<KnowledgeTopicGroup
								key={g.topic}
								topic={g.topic}
								itemCount={g.items.length}
								staleCount={g.staleCount}
								health={g.health}
							>
								{g.items.map((item) => (
									<KnowledgeRow
										key={item.id}
										title={item.title}
										layer={item.layer}
										kind={item.kind}
										status={item.status}
										timestamp={item.timestamp}
										onClick={() => navigate(`/knowledge/${item.id}`)}
									/>
								))}
							</KnowledgeTopicGroup>
						))
					)}
				</div>
			)}
		</div>
	);
}
