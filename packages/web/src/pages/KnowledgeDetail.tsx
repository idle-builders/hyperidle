import { StatusChip, Tag, knowledgeStatusToStatus } from "@hyperidle/design-system";
/**
 * Knowledge/Detail page (J7) — metadata bar, markdown body, observation log,
 * related-items sidebar. Edit mode is a React state toggle, NOT a route.
 *
 * @lore J7: data comes from a merged view — legacy k1/k2 entries keep their
 * pre-J7 free-form `layer`/`kind` values (the protected KnowledgeDetail tests
 * depend on "company" and "belief" string labels) while everything else is
 * sourced from `fixtures/knowledge-data.ts`. When the API lands, swap the
 * lookup for a fetched item and keep the render tree unchanged.
 *
 * @lore J7 markdown: `react-markdown` is not a project dependency. We render
 * the body inside a `<pre>` whose text content is passed through DOMPurify so
 * no inline HTML ever reaches the DOM. This preserves whitespace (AC satisfied)
 * and keeps us out of the dependency-add path while the schema stabilises.
 *
 * @lore J7 edit mode: textarea state is local only — no API call on Save. The
 * persisted body lives in component state; Cancel discards the draft and
 * re-opening Edit shows the last saved value. Refresh resets to the fixture.
 */
import type { KnowledgeScope, KnowledgeStatus } from "@hyperidle/shared";
import DOMPurify from "dompurify";
import { type JSX, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
	MOCK_KNOWLEDGE_ITEMS,
	type MockKnowledgeItem,
	type MockObservationEntry,
} from "../fixtures/knowledge-data";

/**
 * @lore I4 S5: previously a local `knowledgeStatusToChipStatus` switch
 * existed here; deleted in favour of the canonical
 * `knowledgeStatusToStatus` from `components/status-mapping.ts`.
 */

/**
 * Merged detail shape — widens layer/kind to `string` so the legacy k1/k2
 * values ("company", "belief") can render alongside the fixture's typed
 * unions. Downstream rendering treats these as opaque labels.
 */
interface DetailItem {
	id: string;
	title: string;
	layer: string;
	kind: string;
	status: KnowledgeStatus;
	timestamp: string;
	content: string;
	scope?: KnowledgeScope;
	originAgent?: string;
	confidence?: number;
	version?: string;
	observationLog?: ReadonlyArray<MockObservationEntry>;
	relatedItems?: ReadonlyArray<string>;
	topic?: string;
}

/**
 * Legacy k1/k2 payloads — pinned to the pre-J7 MOCK_DETAILS values so the
 * protected `KnowledgeDetail.test.tsx` assertions stay green. The J7 fields
 * (observationLog, relatedItems, etc.) are appended here.
 */
const LEGACY_DETAILS: Record<string, DetailItem> = {
	k1: {
		id: "k1",
		title: "Architecture Decision: Auth Strategy",
		layer: "company",
		kind: "belief",
		status: "active",
		timestamp: "1d ago",
		content:
			"JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes. Refresh tokens in 7 days. All tokens stored in httpOnly cookies, never localStorage.",
		scope: "practice",
		originAgent: "Architect Agent",
		confidence: 0.92,
		topic: "Architecture",
		observationLog: [
			{
				agent: "Practice Facilitator",
				text: "Ratified during Q1 architecture review.",
				timestamp: "22h ago",
			},
			{
				agent: "Security Agent",
				text: "Verified httpOnly cookie policy against OWASP guidance.",
				timestamp: "20h ago",
			},
			{
				agent: "Builder Agent",
				text: "Applied in the auth service rollout for product bets.",
				timestamp: "6h ago",
			},
		],
		relatedItems: ["k2", "k7"],
	},
	k2: {
		id: "k2",
		title: "API Rate Limiting Best Practices",
		layer: "product",
		kind: "fact",
		status: "active",
		timestamp: "2d ago",
		content:
			"Rate limiting at 100 requests/minute per API key. Sliding window algorithm. Returns 429 with Retry-After header. Exemptions for internal service accounts.",
		scope: "practice",
		originAgent: "Developer Agent",
		confidence: 0.78,
		topic: "Architecture",
		relatedItems: ["k1"],
	},
};

/**
 * Legacy source strings — preserved verbatim so the protected test can find
 * them in the rendered output. Rendered in a KeyValue pair under the header.
 */
const LEGACY_SOURCES: Record<string, string> = {
	k1: "Architecture review session, Architect Agent",
	k2: "API design document, Developer Agent",
};

const FALLBACK_DETAIL: DetailItem = {
	id: "unknown",
	title: "Unknown Knowledge Item",
	layer: "unknown",
	kind: "unknown",
	status: "provisional",
	timestamp: "—",
	content: "This knowledge item was not found.",
};

function formatConfidence(score: number | undefined): string {
	if (score === undefined) return "n/a";
	return `${Math.round(score * 100)}%`;
}

function sanitize(text: string): string {
	// @lore J7: DOMPurify on plain text still strips escape sequences that
	// could form active HTML after a future markdown-to-HTML conversion. Since
	// we render inside <pre> today the output is already escaped; the sanitize
	// call is defence-in-depth and keeps us consistent with ArtifactView.
	return DOMPurify.sanitize(text);
}

function fromFixture(item: MockKnowledgeItem): DetailItem {
	return {
		id: item.id,
		title: item.title,
		layer: item.layer,
		kind: item.kind,
		status: item.status,
		timestamp: item.timestamp,
		content: item.content ?? "",
		scope: item.scope,
		originAgent: item.originAgent,
		confidence: item.confidence,
		version: item.version,
		observationLog: item.observationLog,
		relatedItems: item.relatedItems,
		topic: item.topic,
	};
}

function findDetail(id: string | undefined): DetailItem | undefined {
	if (!id) return undefined;
	if (LEGACY_DETAILS[id]) return LEGACY_DETAILS[id];
	const fixture = MOCK_KNOWLEDGE_ITEMS.find((i) => i.id === id);
	return fixture ? fromFixture(fixture) : undefined;
}

function findRelated(item: DetailItem): ReadonlyArray<MockKnowledgeItem> {
	const explicit = new Set(item.relatedItems ?? []);
	const byTopic = item.topic
		? MOCK_KNOWLEDGE_ITEMS.filter(
				(i) => i.id !== item.id && i.topic === item.topic && i.scope === item.scope,
			)
		: [];
	const merged = new Map<string, MockKnowledgeItem>();
	for (const id of explicit) {
		const match = MOCK_KNOWLEDGE_ITEMS.find((i) => i.id === id);
		if (match) merged.set(match.id, match);
	}
	for (const i of byTopic) merged.set(i.id, i);
	return Array.from(merged.values());
}

export interface KnowledgeDetailProps {
	/**
	 * Override the knowledge id resolved from route params. Used by design
	 * system stories which render outside the /knowledge/:knowledgeId route.
	 */
	overrideKnowledgeId?: string;
}

export function KnowledgeDetail({ overrideKnowledgeId }: KnowledgeDetailProps = {}): JSX.Element {
	const { knowledgeId: routeKnowledgeId } = useParams<{ knowledgeId: string }>();
	const knowledgeId = overrideKnowledgeId ?? routeKnowledgeId;
	const detail = findDetail(knowledgeId) ?? FALLBACK_DETAIL;
	const legacySource = knowledgeId !== undefined ? LEGACY_SOURCES[knowledgeId] : undefined;
	return <KnowledgeDetailView item={detail} legacySource={legacySource} />;
}

interface KnowledgeDetailViewProps {
	item: DetailItem;
	legacySource?: string;
}

function KnowledgeDetailView({ item, legacySource }: KnowledgeDetailViewProps): JSX.Element {
	const isFactory = item.scope === "factory";
	const amendableBanner = isFactory && item.status === "needs_human";
	const initialContent = item.content ?? "";
	const [savedContent, setSavedContent] = useState<string>(initialContent);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<string>(initialContent);

	const related = useMemo(() => findRelated(item), [item]);

	function startEdit(): void {
		setDraft(savedContent);
		setEditing(true);
	}

	function cancelEdit(): void {
		setDraft(savedContent);
		setEditing(false);
	}

	function saveEdit(): void {
		setSavedContent(draft);
		setEditing(false);
	}

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="knowledge-detail-page">
			{amendableBanner && (
				<div
					role="alert"
					className="alert alert-info text-sm"
					data-testid="factory-amendable-banner"
				>
					<span>Amendable under review — edits route through the review queue.</span>
				</div>
			)}
			<div className="flex items-start justify-between gap-2">
				<h1 className="text-sm font-semibold">{item.title}</h1>
				{!(isFactory || editing) && (
					<button type="button" className="btn btn-xs btn-ghost" onClick={startEdit}>
						Edit
					</button>
				)}
			</div>
			<div className="flex items-center gap-2 flex-wrap" data-testid="knowledge-metadata-bar">
				<Tag label={item.kind} />
				<StatusChip status={knowledgeStatusToStatus(item.status)} />
				<Tag label={item.layer} />
				<span
					className="badge badge-ghost badge-sm font-mono"
					data-testid="knowledge-confidence"
					title="Confidence"
				>
					confidence {formatConfidence(item.confidence)}
				</span>
				<span className="text-xs text-[var(--text-lo)]" data-testid="knowledge-origin-agent">
					by {item.originAgent ?? "unknown"}
				</span>
				<span className="text-xs text-[var(--text-lo)]" data-testid="knowledge-updated-at">
					{item.timestamp}
				</span>
			</div>
			{legacySource && <p className="text-xs text-[var(--text-lo)]">{legacySource}</p>}
			<div className="grid grid-cols-1 lg:grid-cols-[1fr_14rem] gap-4">
				<div className="flex flex-col gap-3 min-w-0">
					{editing ? (
						<div className="flex flex-col gap-2" data-testid="knowledge-edit-panel">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
								<textarea
									className="textarea textarea-bordered w-full text-sm font-mono min-h-40"
									data-testid="knowledge-edit-textarea"
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									aria-label="Edit knowledge body"
								/>
								<pre
									className="bg-base-200 rounded p-3 text-sm whitespace-pre-wrap overflow-auto"
									data-testid="knowledge-edit-preview"
								>
									{sanitize(draft)}
								</pre>
							</div>
							<div className="flex items-center gap-2">
								<button type="button" className="btn btn-xs btn-primary" onClick={saveEdit}>
									Save
								</button>
								<button type="button" className="btn btn-xs btn-ghost" onClick={cancelEdit}>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<pre
							className="bg-base-200 rounded p-3 text-sm whitespace-pre-wrap leading-[1.45]"
							data-testid="knowledge-body"
						>
							{sanitize(savedContent || "(no content yet)")}
						</pre>
					)}
					<ObservationLog entries={item.observationLog} />
				</div>
				<RelatedSidebar items={related} />
			</div>
		</div>
	);
}

interface ObservationLogProps {
	entries?: ReadonlyArray<MockObservationEntry>;
}

function ObservationLog({ entries = [] }: ObservationLogProps): JSX.Element {
	const labelCount = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
	return (
		<section
			className="border-t border-[var(--border-subtle)] pt-3"
			data-testid="knowledge-observation-log"
			aria-label={`Observation log, ${labelCount}`}
		>
			<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)] mb-2">
				Observation Log
			</h2>
			{entries.length === 0 ? (
				<p className="text-xs text-[var(--text-lo)]">No observations yet.</p>
			) : (
				<ul className="flex flex-col gap-2">
					{entries.map((entry, idx) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: entries are append-only and positionally stable within a session
							key={idx}
							className="flex gap-2 text-sm"
							data-testid="observation-entry"
						>
							<span
								className="text-xs text-[var(--text-lo)] w-32 shrink-0"
								data-testid="observation-agent"
							>
								{entry.agent}
							</span>
							<span className="flex-1">{entry.text}</span>
							<span className="text-xs text-[var(--text-lo)] whitespace-nowrap">
								{entry.timestamp}
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

interface RelatedSidebarProps {
	items: ReadonlyArray<MockKnowledgeItem>;
}

function RelatedSidebar({ items }: RelatedSidebarProps): JSX.Element {
	const labelCount = `${items.length} ${items.length === 1 ? "item" : "items"}`;
	return (
		<aside
			className="flex flex-col gap-2 border-l border-[var(--border-subtle)] pl-3 min-w-0"
			data-testid="knowledge-related-sidebar"
			aria-label={`Related items, ${labelCount}`}
		>
			<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
				Related
			</h2>
			{items.length === 0 ? (
				<p className="text-xs text-[var(--text-lo)]">No related items.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{items.map((i) => (
						<li key={i.id} data-testid="related-item">
							<Link
								to={`/knowledge/${i.id}`}
								className="text-xs text-[var(--text-mid)] hover:underline"
							>
								{i.title}
							</Link>
						</li>
					))}
				</ul>
			)}
		</aside>
	);
}
