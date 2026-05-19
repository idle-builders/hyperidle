/**
 * J6: collapsible topic group header wrapping KnowledgeRows.
 *
 * Wrapper-only — KnowledgeRow itself is untouched. The header shows the
 * topic name, item count, stale-item count, and a health dot (fresh/amber/
 * red). Clicking the header toggles collapse; collapsed groups hide their
 * children but keep the header visible.
 */
import type { KnowledgeTopicHealth } from "@hyperidle/fabric";
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
				className="flex items-center gap-2 px-2 py-1 text-left border-b border-[var(--border-subtle)]"
				aria-expanded={!collapsed}
				aria-controls={regionId}
				onClick={() => setCollapsed((prev) => !prev)}
			>
				<svg
					aria-hidden="true"
					width={10}
					height={10}
					viewBox="0 0 12 12"
					fill="currentColor"
					className="shrink-0"
				>
					{collapsed ? <path d="M4 2l5 4-5 4V2z" /> : <path d="M2 4l4 5 4-5H2z" />}
				</svg>
				<span
					className={`inline-block h-2 w-2 rounded-full shrink-0 ${HEALTH_DOT_CLASS[health]}`}
					aria-label={`Health: ${HEALTH_DOT_LABEL[health]}`}
					data-testid={`topic-health-${topic}`}
					data-health={health}
				/>
				<span className="font-mono text-xs uppercase tracking-wider text-[var(--text-lo)]">
					{topic}
				</span>
				<span className="badge badge-sm badge-ghost font-mono" aria-label={`${itemCount} items`}>
					{itemCount}
				</span>
				{staleCount > 0 && (
					<span
						className="badge badge-sm badge-warning font-mono"
						aria-label={`${staleCount} stale`}
					>
						{staleCount} stale
					</span>
				)}
			</button>
			{!collapsed && (
				<div id={regionId} className="flex flex-col">
					{children}
				</div>
			)}
		</section>
	);
}
