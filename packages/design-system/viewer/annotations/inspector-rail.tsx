/**
 * AJ7 — inspector-rail.tsx
 *
 * The devtools-style inspector rail — dev chrome beside the canvas. It NEVER floats
 * over the canvas (the comment editor is docked here). Collapsible to a thin strip
 * (decision 1). When idle it shows only arm + round/count + the notes list; when an
 * element is selected it shows the deduped breadcrumb + docked comment block.
 *
 * Not a catalogued product component — it never enters src/ or the snapshot net, so
 * it does not consume product component budget.
 *
 * @lore AJ7 DEV-ONLY: runs only in the :8098 viewer, never in a production bundle.
 */

import { useEffect, useRef } from "react";
import type { Annotation } from "./types.js";
import type { Picker } from "./use-picker.js";

export interface InspectorRailProps {
	picker: Picker;
	round: number;
	annotations: Annotation[];
	note: string;
	onNoteChange(v: string): void;
	onSave(): void;
	saving: boolean;
	error: string | null;
	onNewIteration(): void;
	collapsed: boolean;
	onToggleCollapsed(): void;
	armButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function InspectorRail({
	picker,
	round,
	annotations,
	note,
	onNoteChange,
	onSave,
	saving,
	error,
	onNewIteration,
	collapsed,
	onToggleCollapsed,
	armButtonRef,
}: InspectorRailProps): React.JSX.Element {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const selected = picker.selected;

	// Autofocus the textarea when a selection opens.
	useEffect(() => {
		if (selected) {
			const id = window.setTimeout(() => textareaRef.current?.focus(), 0);
			return () => window.clearTimeout(id);
		}
		return undefined;
	}, [selected]);

	const noteCount = annotations.length;

	return (
		<aside className={`anno-rail${collapsed ? " anno-rail--collapsed" : ""}`}>
			<div className="anno-rail-head">
				<button
					type="button"
					className="anno-rail-toggle"
					aria-label={collapsed ? "Expand inspector" : "Collapse inspector"}
					aria-expanded={!collapsed}
					onClick={onToggleCollapsed}
				>
					{collapsed ? "›" : "‹"}
				</button>
				<button
					ref={armButtonRef}
					type="button"
					className={`anno-arm${picker.armed ? " anno-arm--on" : ""}`}
					aria-pressed={picker.armed}
					onClick={() => (picker.armed ? picker.disarm() : picker.arm())}
				>
					{picker.armed ? "Selecting…" : "Inspect"}
				</button>
				<span className="anno-round">
					Round {round} · {noteCount} {noteCount === 1 ? "note" : "notes"}
				</span>
			</div>

			{!collapsed && (
				<>
					{selected ? (
						<div className="anno-rail-section">
							{/* Deduped ancestor breadcrumb (decision 5) */}
							<nav className="anno-crumbs" aria-label="ancestor path">
								{picker.crumbs.map((c, i) => (
									<span key={c.key} className="anno-crumb-wrap">
										{i > 0 && <span className="anno-crumb-sep">›</span>}
										<button
											type="button"
											className={`anno-crumb${c.isCurrent ? " anno-crumb--on" : ""}`}
											onClick={() => picker.selectCrumb(c.el)}
										>
											{c.label}
										</button>
									</span>
								))}
							</nav>

							{/* Target echo — verbatim, including "unknown" */}
							<div
								className="anno-target"
								title={`${selected.target.component} · ${selected.target.element}`}
							>
								<span className="anno-target-component">{selected.target.component}</span> ·{" "}
								<span className="anno-target-element">{selected.target.element}</span>
							</div>

							<textarea
								ref={textareaRef}
								value={note}
								placeholder="What should change about this element?"
								onChange={(e) => onNoteChange(e.target.value)}
								rows={3}
							/>

							{error !== null && <div className="anno-error">{error}</div>}

							<div className="anno-comment-actions">
								<button type="button" className="anno-save" disabled={saving} onClick={onSave}>
									{saving ? "Saving…" : "Save"}
								</button>
								<button type="button" className="anno-cancel" onClick={picker.clearSelection}>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<div className="anno-rail-hint">
							{picker.armed
								? "Hover the canvas — click an element to comment."
								: "Press Inspect, then hover + click any element."}
						</div>
					)}

					<div className="anno-rail-notes">
						<div className="anno-section-label">
							Notes · Round {round}
							{noteCount > 0 && (
								<button type="button" className="anno-iterate" onClick={onNewIteration}>
									New iteration
								</button>
							)}
						</div>
						{noteCount === 0 ? (
							<div className="anno-notes-empty">
								No notes yet. Inspect an element, then comment.
							</div>
						) : (
							<ul className="anno-notes">
								{annotations.map((a) => (
									<li key={a.id}>
										<button
											type="button"
											className="anno-note-row"
											data-missing={a.target.anchor ? undefined : "true"}
											onMouseEnter={() => picker.beginReHighlight(a)}
											onMouseLeave={() => picker.endReHighlight()}
											onFocus={() => picker.beginReHighlight(a)}
											onBlur={() => picker.endReHighlight()}
										>
											<span className="anno-note-comp">{a.target.component}</span>
											<span className="anno-note-text">{a.note}</span>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</>
			)}
		</aside>
	);
}
