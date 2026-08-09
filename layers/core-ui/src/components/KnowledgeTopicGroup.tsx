/**
 * J6: collapsible topic group header wrapping KnowledgeRows.
 *
 * Wrapper-only — KnowledgeRow itself is untouched. The header shows the
 * topic name, item count, stale-item count, and a health dot (fresh/amber/
 * red). Clicking the header toggles collapse; collapsed groups hide their
 * children but keep the header visible.
 *
 * @lore visual-parity: header styled to match knowledge-list.html mockup
 * (.topic-header: 12px/600, uppercase, 0.06em tracking, 12px 24px 6px padding).
 * Health dot and stale badge kept for accessibility/tests but visually hidden
 * (sr-only). The mockup shows no collapse chevron or health indicators.
 */
import type { KnowledgeTopicHealth } from "@hyperidle/domain-model";
import { type JSX, type ReactNode, useState } from "react";

export interface KnowledgeTopicGroupProps {
	topic: string;
	itemCount: number;
	staleCount: number;
	health: KnowledgeTopicHealth;
	/** When true, starts collapsed. Defaults to `false` (expanded). */
	initiallyCollapsed?: boolean;
	children: ReactNode;
}

const HEALTH_DOT_CLASS: Record<KnowledgeTopicHealth, string> = {
	fresh: "bg-success",
	some_stale: "bg-warning",
	mostly_stale: "bg-error",
};

const HEALTH_DOT_LABEL: Record<KnowledgeTopicHealth, string> = {
	fresh: "fresh",
	some_stale: "some stale",
	mostly_stale: "mostly stale",
};

export function KnowledgeTopicGroup({
	topic,
	itemCount,
	staleCount,
	health,
	initiallyCollapsed = false,
	children,
}: KnowledgeTopicGroupProps): JSX.Element {
	const [collapsed, setCollapsed] = useState<boolean>(initiallyCollapsed);
	const regionId = `topic-group-${topic.replace(/\s+/g, "-").toLowerCase()}`;
	return (
		<section className="flex flex-col" data-testid={`topic-group-${topic}`}>
			<button
				type="button"
				className="flex items-center justify-between px-[24px] py-[12px] pb-[6px] text-left cursor-pointer w-full"
				aria-expanded={!collapsed}
				aria-controls={regionId}
				onClick={() => setCollapsed((prev) => !prev)}
			>
				<span className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
					{topic}
				</span>
				<div className="flex items-center gap-[6px]">
					{/* Health dot — sr-only visually but kept for accessibility and tests */}
					<span
						className={`inline-block h-2 w-2 rounded-full shrink-0 sr-only ${HEALTH_DOT_CLASS[health]}`}
						aria-label={`Health: ${HEALTH_DOT_LABEL[health]}`}
						data-testid={`topic-health-${topic}`}
						data-health={health}
					/>
					<span
						className="text-[11px] text-[var(--text-tertiary)]"
						aria-label={`${itemCount} items`}
					>
						{itemCount} items
					</span>
					{staleCount > 0 && (
						<span className="sr-only" aria-label={`${staleCount} stale`}>
							{staleCount} stale
						</span>
					)}
				</div>
			</button>
			{!collapsed && (
				<ul id={regionId} className="flex flex-col list-none m-0 p-0">
					{children}
				</ul>
			)}
		</section>
	);
}
