/**
 * DocumentTreeList — nested document browse tree for the Curated tab.
 *
 * @lore BC4: renamed from `KnowledgeTreeList` (architecture.md §9.2).
 *
 * Inspired by Notion / Linear / filesystem sidebars: collapse chevron, indent
 * guide lines, hover add-child — not a dented flat list with └ markers.
 *
 * @lore nested-knowledge-items tree-ui: page-local (one consumer today). Not
 * promoted to ds/ until a second surface needs the same tree chrome. Reuses
 * relativeShort / clipExcerpt utilities and Hearth tokens; does not fork Row
 * because indent guides + chevron column need a dedicated composition.
 */

import { type JSX, useCallback, useMemo, useState } from "react";
import { Button } from "../../ds";
import { clipExcerpt } from "../../utils/clip-excerpt.js";
import { stripMarkdown } from "../../utils/strip-markdown.js";
import { relativeShort } from "../../utils/time.js";
import { type DocumentTreeRow, visibleDocumentTreeRows } from "./build-document-tree.js";

export interface DocumentTreeListProps {
	rows: DocumentTreeRow[];
	onNavigate: (id: string) => void;
	onNewChild: (parentId: string) => void;
}

const CHEVRON_PATH = "M5 7L1 3h8L5 7z";
const PLUS_PATH = "M6 1v10M1 6h10";

export function DocumentTreeList({
	rows,
	onNavigate,
	onNewChild,
}: DocumentTreeListProps): JSX.Element {
	const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

	const toggleCollapsed = useCallback((id: string): void => {
		setCollapsedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const visibleRows = useMemo(
		() => visibleDocumentTreeRows(rows, collapsedIds),
		[rows, collapsedIds],
	);

	return (
		<ul
			// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA treeview pattern requires role="tree" on the list container to pair with each row's role="treeitem".
			role="tree"
			aria-label="Document tree"
			data-ds-component="DocumentTreeList"
			data-testid="document-tree-list"
			className="flex flex-col"
		>
			{visibleRows.map(({ item, depth, hasChildren }) => {
				const isPrivate = item.scopeKind === "user";
				const isCollapsed = collapsedIds.has(item.id);
				// AQ-001: indent step is 18px (Hearth vocabulary), capped so depth never
				// pushes the row off-screen.
				const cappedDepth = Math.min(depth, 6);
				const subtitle = item.body ? clipExcerpt(stripMarkdown(item.body)) || undefined : undefined;

				return (
					<li
						key={item.id}
						data-testid="document-row"
						data-depth={depth}
						className="group relative flex items-center min-h-[44px] border-width-thin-b border-[var(--border-subtle)] last:border-none cursor-pointer hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] focus-within:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]"
						onClick={() => onNavigate(item.id)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onNavigate(item.id);
							}
							if (hasChildren && e.key === "ArrowLeft" && !isCollapsed) {
								e.preventDefault();
								toggleCollapsed(item.id);
							}
							if (hasChildren && e.key === "ArrowRight" && isCollapsed) {
								e.preventDefault();
								toggleCollapsed(item.id);
							}
						}}
						role="treeitem"
						tabIndex={0}
						aria-expanded={hasChildren ? !isCollapsed : undefined}
						aria-level={depth + 1}
					>
						{/*
						 * Indent guide lines — one hairline per ancestor depth.
						 * @lore nested-knowledge-items tree-ui: VS Code-style guides
						 * give the eye a track without the └ dent aesthetic. Position:
						 * 12px base + i*18px + 9px centres each guide in its column.
						 */}
						{Array.from({ length: cappedDepth }, (_, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length run of purely positional indent guides — nothing to identify them by but position.
								key={i}
								aria-hidden="true"
								className="absolute top-0 bottom-0 pointer-events-none"
								style={{
									left: 12 + i * 18 + 9,
									width: 1,
									background: "var(--border-subtle)",
								}}
							/>
						))}

						{cappedDepth > 0 && (
							<span aria-hidden="true" style={{ width: cappedDepth * 18, flexShrink: 0 }} />
						)}

						{/* Chevron column — 44px touch target (AQ-015) */}
						<span className="flex-none flex items-center justify-center w-[44px]">
							{hasChildren ? (
								<Button
									variant="ghost"
									tone="neutral"
									size="icon"
									aria-label={isCollapsed ? "Expand" : "Collapse"}
									aria-expanded={!isCollapsed}
									onClick={(e) => {
										e.stopPropagation();
										toggleCollapsed(item.id);
									}}
								>
									<svg
										width="10"
										height="10"
										viewBox="0 0 10 10"
										fill="currentColor"
										aria-hidden="true"
										className={`motion-move ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
									>
										<path d={CHEVRON_PATH} />
									</svg>
								</Button>
							) : null}
						</span>

						<span className="flex-1 min-w-0 flex flex-col justify-center py-[9px] pr-[12px]">
							<span className="type-control truncate text-[var(--text-primary)]">{item.title}</span>
							{subtitle && (
								<span className="type-metadata truncate text-[var(--text-tertiary)] mt-[3px]">
									{subtitle}
								</span>
							)}
						</span>

						<span className="flex items-center gap-[9px] pr-[12px] flex-none">
							{isPrivate && (
								<span
									className="type-metadata inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)] whitespace-nowrap"
									style={{
										background: "var(--surface-container)",
										color: "var(--text-secondary)",
									}}
									title="Private — only visible to you"
									data-testid="private-badge"
								>
									Private
								</span>
							)}
							<span
								className="type-metadata text-[var(--text-tertiary)]"
								data-testid="document-time"
							>
								{relativeShort(item.updatedAt)}
							</span>
							<Button
								variant="ghost"
								tone="neutral"
								size="icon"
								aria-label="Add child item"
								title="Add child"
								onClick={(e) => {
									e.stopPropagation();
									onNewChild(item.id);
								}}
								className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 12 12"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									aria-hidden="true"
								>
									<path d={PLUS_PATH} />
								</svg>
							</Button>
						</span>
					</li>
				);
			})}
		</ul>
	);
}
