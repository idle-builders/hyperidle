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
 * Attention scores and "Why now" reason strings come from the server in
 * production; fixtures live in `packages/web/src/fixtures/knowledge-data.ts`
 * with comments marking server wiring as deferred.
 */
import type { KnowledgeScope } from "@hyperidle/shared";
import { type JSX, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CurationSuggestionCard } from "../components/CurationSuggestionCard";
import { KnowledgeTopicGroup } from "../components/KnowledgeTopicGroup";
import {
	MOCK_CURATION_SUGGESTIONS,
	MOCK_KNOWLEDGE_ITEMS,
	type MockKnowledgeItem,
	groupItemsByTopic,
} from "../fixtures/knowledge-data";

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
	const [searchParams] = useSearchParams();
	const scope = deriveScope(searchParams);

	// @lore J6 AC: tab choice remembered in component state only — NOT
	// localStorage. Default recomputed below whenever `scope` changes.
	const [tab, setTab] = useState<KnowledgeTab>("triage");

	const scopedItems = useMemo<ReadonlyArray<MockKnowledgeItem>>(
		() => MOCK_KNOWLEDGE_ITEMS.filter((i) => i.scope === scope),
		[scope],
	);
	const scopedSuggestions = useMemo(
		() => MOCK_CURATION_SUGGESTIONS.filter((s) => s.scope === scope),
		[scope],
	);
	// AC: "Default to Triage when any items have status === 'needs_human', else
	// Curated." Also AC: "Switching scope resets list selection and filters."
	// Keying this effect on `scope` (not a derived hasNeedsHuman) ensures the
	// tab resets every time the user switches scope — even between two scopes
	// whose needs_human flag happens to be equal. The current scope's item set
	// is resolved inline so the exhaustive-deps lint is satisfied without
	// suppression comments.
	useEffect(() => {
		const needsHuman = MOCK_KNOWLEDGE_ITEMS.some(
			(i) => i.scope === scope && i.status === "needs_human",
		);
		setTab(needsHuman ? "triage" : "curated");
	}, [scope]);

	const grouped = useMemo(() => groupItemsByTopic(scopedItems), [scopedItems]);

	const triageSorted = useMemo<ReadonlyArray<MockKnowledgeItem>>(
		() => [...scopedItems].sort((a, b) => b.attentionScore - a.attentionScore),
		[scopedItems],
	);

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
					<div className="flex flex-col">
						{triageSorted.length === 0 ? (
							<EmptyState
								title="Nothing needs attention"
								description="Triage is clear for this scope — agents will surface new items here as they learn."
								dataTestId="knowledge-triage-empty"
							/>
						) : (
							triageSorted.map((item) => (
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
							))
						)}
					</div>
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
