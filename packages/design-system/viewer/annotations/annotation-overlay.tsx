/**
 * AJ5 — annotation-overlay.tsx
 *
 * The "review pill" overlay — a bottom-left sibling to the Toolbar.
 * Arm → select a story element → write a note → Save → count climbs.
 * "New iteration" closes the round and opens the next.
 *
 * @lore AJ5 ONE-SHOT ARM: On arm, a capturing click listener is attached to
 * the STORY ROOT element only (never document). On the first qualifying click
 * (or on cancel/Esc/re-click disarm), BOTH listeners (mousemove + capturing
 * click) are detached. This is the explicit guard against sticky-whole-document
 * listeners. Re-arm re-attaches a fresh one-shot listener.
 *
 * @lore AJ5 FIXED-TO-PILL POPOVER: The note popover rises from the review pill
 * at a fixed position. It is never anchored to the clicked element and never
 * draggable. The captured target's component name + element descriptor are
 * echoed verbatim in the popover header — including "unknown" or data-ds-only
 * weak labels (see resolve-component.ts resolution chain).
 *
 * @lore AJ5 DEV-ONLY: This component only runs in the Vite dev viewer at :8098.
 * It is never included in a production bundle — the Vite plugin that serves
 * the backend is configureServer-only (no transform/generateBundle).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveComponentTarget } from "./resolve-component.js";
import type { AnnotationState, AnnotationTarget } from "./types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AnnotationOverlayProps {
	/** The story/variant currently displayed (echoed in POST payload) */
	story: string;
	variant: string;
	/**
	 * The DOM element that scopes the capturing click listener.
	 * Must be the story content root — never document.
	 * The overlay excludes its own nodes from capture.
	 */
	storyRoot: HTMLElement | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnnotationOverlay({
	story,
	variant,
	storyRoot,
}: AnnotationOverlayProps): React.JSX.Element {
	// ---- State -----------------------------------------------------------
	const [armed, setArmed] = useState(false);
	const [selected, setSelected] = useState<AnnotationTarget | null>(null);
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [state, setState] = useState<AnnotationState | null>(null);
	const [showList, setShowList] = useState(false);

	// Refs for the pill + popover so we can exclude them from capture
	const pillRef = useRef<HTMLDivElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const armRef = useRef<HTMLButtonElement>(null);
	// Track hovered element for outline
	const hoveredRef = useRef<Element | null>(null);

	// ---- Fetch state from middleware -------------------------------------
	const fetchState = useCallback((): void => {
		void fetch("/__annotations")
			.then((r) => r.json())
			.then((data: { state: AnnotationState }) => {
				setState(data.state);
			})
			.catch(() => {
				// best-effort — middleware may not be running in test env
			});
	}, []);

	useEffect(() => {
		fetchState();
	}, [fetchState]);

	// ---- Derived values -------------------------------------------------
	const currentRound = state?.currentRound ?? 1;
	const currentRoundData = state?.rounds.find((r) => r.round === currentRound);
	const noteCount = currentRoundData?.annotations.length ?? 0;

	// Ref for the DOM element captured by click (distinct from the AnnotationTarget data)
	const capturedElRef = useRef<Element | null>(null);

	// ---- Outline helpers -------------------------------------------------
	const applyHoverOutline = useCallback((el: Element | null): void => {
		// Remove from previously hovered element
		if (hoveredRef.current && hoveredRef.current !== el) {
			hoveredRef.current.classList.remove("anno-hover");
		}
		if (el) {
			el.classList.add("anno-hover");
			hoveredRef.current = el;
		} else {
			hoveredRef.current = null;
		}
	}, []);

	const clearHoverOutline = useCallback((): void => {
		applyHoverOutline(null);
	}, [applyHoverOutline]);

	// Apply/clear the .anno-selected class on the captured element
	const applyCapturedOutline = useCallback((el: Element | null): void => {
		if (capturedElRef.current) {
			capturedElRef.current.classList.remove("anno-selected");
		}
		capturedElRef.current = el;
		if (el) {
			el.classList.add("anno-selected");
		}
	}, []);

	// ---- One-shot arm listeners -----------------------------------------
	const listenerCleanupRef = useRef<(() => void) | null>(null);

	const isOwnNode = useCallback((target: EventTarget | null): boolean => {
		if (!(target instanceof Element)) return false;
		return !!(pillRef.current?.contains(target) || popoverRef.current?.contains(target));
	}, []);

	const disarm = useCallback((): void => {
		setArmed(false);
		clearHoverOutline();
		if (listenerCleanupRef.current) {
			listenerCleanupRef.current();
			listenerCleanupRef.current = null;
		}
	}, [clearHoverOutline]);

	const arm = useCallback((): void => {
		setArmed(true);
		if (!storyRoot) return;

		const handleMouseMove = (e: MouseEvent): void => {
			if (isOwnNode(e.target)) {
				clearHoverOutline();
				return;
			}
			if (e.target instanceof Element) {
				applyHoverOutline(e.target);
			}
		};

		const handleCapturingClick = (e: MouseEvent): void => {
			// Detach immediately (one-shot)
			storyRoot.removeEventListener("mousemove", handleMouseMove);
			storyRoot.removeEventListener("click", handleCapturingClick, true);
			listenerCleanupRef.current = null;
			setArmed(false);
			clearHoverOutline();

			if (isOwnNode(e.target)) {
				// Clicked on own UI — cancel capture, don't open popover
				return;
			}

			e.preventDefault();
			e.stopPropagation();

			if (e.target instanceof Element) {
				const resolved = resolveComponentTarget(e.target);
				applyCapturedOutline(e.target);
				setSelected(resolved);
				setNote("");
				setError(null);
			}
		};

		storyRoot.addEventListener("mousemove", handleMouseMove);
		storyRoot.addEventListener("click", handleCapturingClick, true);

		listenerCleanupRef.current = (): void => {
			storyRoot.removeEventListener("mousemove", handleMouseMove);
			storyRoot.removeEventListener("click", handleCapturingClick, true);
		};
	}, [storyRoot, isOwnNode, applyHoverOutline, clearHoverOutline, applyCapturedOutline]);

	// Cleanup on unmount
	useEffect(() => {
		return (): void => {
			if (listenerCleanupRef.current) {
				listenerCleanupRef.current();
			}
		};
	}, []);

	// Autofocus textarea when popover opens
	useEffect(() => {
		if (selected) {
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 0);
		}
	}, [selected]);

	// ---- Focus trap in popover (W2) ----------------------------------------
	// Cycles Tab/Shift+Tab across: textarea → Save → Cancel → (wrap)
	// Esc is handled by the global keydown handler above (closes popover).
	const handlePopoverKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
		if (e.key !== "Tab") return;
		const popover = popoverRef.current;
		if (!popover) return;

		// Collect focusable nodes in DOM order
		const focusable = Array.from(
			popover.querySelectorAll<HTMLElement>("textarea, button:not(:disabled)"),
		);
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement;

		if (e.shiftKey) {
			// Shift+Tab: if on first, wrap to last
			if (active === first) {
				e.preventDefault();
				last?.focus();
			}
		} else if (active === last) {
			// Tab: if on last, wrap to first
			e.preventDefault();
			first?.focus();
		}
	}, []);

	// ---- Save --------------------------------------------------------------
	const handleSave = useCallback(async (): Promise<void> => {
		if (!selected || saving) return;
		setSaving(true);
		setError(null);
		try {
			const payload = { story, variant, note, target: selected };
			const res = await fetch("/__annotations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error("Server error");
			const data = (await res.json()) as { state: AnnotationState };
			setState(data.state);
			// Move captured element from .anno-selected → .anno-saved
			if (capturedElRef.current) {
				capturedElRef.current.classList.remove("anno-selected");
				capturedElRef.current.classList.add("anno-saved");
				capturedElRef.current = null;
			}
			setSelected(null);
			setNote("");
		} catch {
			setError("Couldn't save — the viewer middleware may be down. Retry?");
		} finally {
			setSaving(false);
		}
	}, [selected, saving, story, variant, note]);

	// ---- Keyboard handler (Esc / Cmd+Enter) ----------------------------
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				if (selected) {
					applyCapturedOutline(null);
					setSelected(null);
					setNote("");
					setError(null);
					armRef.current?.focus();
				} else if (armed) {
					disarm();
					armRef.current?.focus();
				}
			}
			if (selected && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				void handleSave();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [selected, armed, disarm, handleSave, applyCapturedOutline]);

	// ---- Toggle arm --------------------------------------------------------
	const toggleArm = (): void => {
		if (armed) {
			disarm();
		} else {
			arm();
		}
	};

	// ---- New iteration -----------------------------------------------------
	const handleNewIteration = async (): Promise<void> => {
		if (noteCount === 0) return;
		try {
			const res = await fetch("/__annotations/round", { method: "POST" });
			const data = (await res.json()) as { state: AnnotationState };
			setState(data.state);
			setShowList(false);
		} catch {
			// best-effort
		}
	};

	// ---- Render ------------------------------------------------------------
	return (
		<>
			{/* Review pill — fixed bottom-left */}
			<div ref={pillRef} className="anno-pill toolbar-pill">
				{/* Arm toggle */}
				<button
					ref={armRef}
					type="button"
					className={`toolbar-btn anno-arm${armed ? " toolbar-btn--active" : ""}`}
					aria-pressed={armed}
					onClick={toggleArm}
				>
					{armed ? "Selecting…" : "Select"}
				</button>

				{/* Round label */}
				<span className="anno-round toolbar-btn" style={{ cursor: "default" }}>
					Round {currentRound}
				</span>

				{/* Note count — clicking shows/hides list */}
				<button
					type="button"
					className="toolbar-btn anno-count"
					aria-label={`Round ${currentRound}, ${noteCount} notes — show notes`}
					onClick={() => setShowList((v) => !v)}
				>
					{noteCount} {noteCount === 1 ? "note" : "notes"}
				</button>

				{/* New iteration */}
				<button
					type="button"
					className="toolbar-btn anno-iterate"
					disabled={noteCount === 0}
					onClick={() => {
						void handleNewIteration();
					}}
				>
					New iteration
				</button>
			</div>

			{/* Note popover — fixed above pill, only when element selected */}
			{selected !== null && (
				<div
					ref={popoverRef}
					className="anno-popover"
					role="dialog"
					aria-modal="true"
					onKeyDown={handlePopoverKeyDown}
				>
					{/* Target echo — verbatim including "unknown" or data-ds-only weak labels */}
					<div className="anno-target" title={`${selected.component} · ${selected.element}`}>
						<span className="anno-target-component">{selected.component}</span> &middot;{" "}
						<span className="anno-target-element">{selected.element}</span>
					</div>

					<textarea
						ref={textareaRef}
						value={note}
						placeholder="What should change about this element?"
						onChange={(e) => setNote(e.target.value)}
						rows={4}
					/>

					{error !== null && <div className="anno-error">{error}</div>}

					<div className="anno-popover-actions">
						<button
							type="button"
							className="toolbar-btn anno-save"
							disabled={saving}
							onClick={() => {
								void handleSave();
							}}
						>
							{saving ? "Saving…" : "Save"}
						</button>
						<button
							type="button"
							className="toolbar-btn"
							onClick={() => {
								applyCapturedOutline(null);
								setSelected(null);
								setNote("");
								setError(null);
								armRef.current?.focus();
							}}
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			{/* Expanded notes list */}
			{showList && currentRoundData && currentRoundData.annotations.length > 0 && (
				<div className="anno-list-panel">
					<ul className="anno-list">
						{currentRoundData.annotations.map((a) => (
							<li key={a.id}>
								<span className="anno-list-component">{a.target.component}</span> &mdash; {a.note}
							</li>
						))}
					</ul>
				</div>
			)}
		</>
	);
}
