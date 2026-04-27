/**
 * L7 — KillSwitchDialog.
 *
 * Confirmation surface for the recovery verbs that need a
 * blast-radius preview + rationale + explicit confirm gate:
 *   - factory_pause (kill switch)
 *   - rollback (revert a committed verdict)
 *   - session_pause (mid-session pause)
 *
 * Three confirm modes:
 *   - `type_name`     — caller must type the target name verbatim.
 *   - `press_hold`    — pointerdown for 1.5s before onConfirm fires.
 *   - `reason_only`   — reason rationale alone is sufficient. Used by
 *                       the thread-level rollback verb (scope-limited,
 *                       reversible). Maps to no extra friction beyond
 *                       the rationale field.
 *
 * Reason is required (≤500 chars, Zod-mirrored).
 *
 * @lore L7 (AC6): the press-and-hold timer fires via `setTimeout`
 * (not requestAnimationFrame) so vitest's fake timers can advance it
 * deterministically. Releasing before completion clears the timer.
 * @lore L7 (AQ-014, AQ-015): the touch target is ≥44 CSS px and we
 * animate only `opacity` on the ring overlay so the press-hold honors
 * `prefers-reduced-motion` without a special-case branch.
 * @lore L7 (S3): `reason_only` exists so RollbackOverflowItem can reuse
 * this dialog instead of duplicating its chrome. The user-facing
 * Settings → Safety preference is still `type_name`/`press_hold` (the
 * shared `KillSwitchConfirmMode` enum) — `reason_only` is a dialog-
 * level mode for callers that already know rollback gates differently.
 */
import { type KillSwitchConfirmMode, PRESS_HOLD_MS, RATIONALE_MAX_CHARS } from "@hyperidle/shared";
import { useEffect, useId, useRef, useState } from "react";

export type KillSwitchDialogMode = KillSwitchConfirmMode | "reason_only";

export interface KillSwitchDialogProps {
	open: boolean;
	verb: "factory_pause" | "rollback" | "session_pause";
	target: { id: string; name: string };
	blastRadius: string;
	mode: KillSwitchDialogMode;
	onConfirm: (input: { reason: string }) => Promise<void> | void;
	onCancel: () => void;
	/**
	 * Optional override for the placeholder shown in the reason
	 * textarea. Defaults to "Why are you pausing?".
	 */
	reasonPlaceholder?: string;
	/**
	 * Disable the confirm button while a parent-owned in-flight
	 * action is pending (e.g. an awaited POST). Independent from the
	 * dialog's internal validity gating.
	 */
	confirmDisabled?: boolean;
}

function verbCta(verb: KillSwitchDialogProps["verb"]): string {
	switch (verb) {
		case "factory_pause":
			return "Pause Factory";
		case "rollback":
			return "Confirm rollback";
		case "session_pause":
			return "Pause session";
	}
}

export function KillSwitchDialog(props: KillSwitchDialogProps): JSX.Element | null {
	const reasonId = useId();
	const typeFieldId = useId();
	const [reason, setReason] = useState("");
	const [typed, setTyped] = useState("");
	const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const reasonValid = reason.trim().length > 0 && reason.length <= RATIONALE_MAX_CHARS;
	const nameMatches = typed.trim().toLowerCase() === props.target.name.trim().toLowerCase();
	const canSubmit = props.mode === "type_name" ? reasonValid && nameMatches : reasonValid;

	// @lore L7 (DES10): destructure here so the useEffect deps array
	// references stable identifiers that the exhaustive-deps lint can
	// validate. Reading `props.x` inside the effect body and listing
	// `props.x` in the deps trips react-hooks/exhaustive-deps.
	const { open: dialogOpen, onCancel: handleCancel } = props;
	useEffect(() => {
		if (!dialogOpen) return;
		function onKey(e: KeyboardEvent): void {
			if (e.key === "Escape") {
				e.preventDefault();
				handleCancel();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
		};
	}, [dialogOpen, handleCancel]);

	useEffect(() => {
		return () => {
			if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
		};
	}, []);

	if (!props.open) return null;

	function clearHold(): void {
		if (holdTimerRef.current) {
			clearTimeout(holdTimerRef.current);
			holdTimerRef.current = null;
		}
	}

	function startHold(): void {
		if (!reasonValid) return;
		clearHold();
		holdTimerRef.current = setTimeout(() => {
			holdTimerRef.current = null;
			void props.onConfirm({ reason });
		}, PRESS_HOLD_MS);
	}

	function endHold(): void {
		clearHold();
	}

	function submitType(): void {
		if (!canSubmit) return;
		void props.onConfirm({ reason });
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="kill-switch-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-base-300/60 p-4"
		>
			<div className="w-full max-w-md space-y-4 rounded-lg border border-base-300 bg-base-100 p-5 shadow-md">
				<header className="space-y-1">
					<h2 id="kill-switch-title" className="text-base font-semibold">
						{verbCta(props.verb)}
					</h2>
					<p className="text-sm text-[var(--text-mid)]">{props.blastRadius}</p>
				</header>

				<div className="space-y-2">
					<label htmlFor={reasonId} className="block text-sm font-medium">
						Reason
					</label>
					<textarea
						id={reasonId}
						className="textarea textarea-bordered w-full text-base"
						maxLength={RATIONALE_MAX_CHARS}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder={props.reasonPlaceholder ?? "Why are you pausing?"}
						required
					/>
					<p className="text-xs text-[var(--text-lo)]">
						{reason.length}/{RATIONALE_MAX_CHARS}
					</p>
				</div>

				{props.mode === "type_name" ? (
					<div className="space-y-2">
						<label htmlFor={typeFieldId} className="block text-sm font-medium">
							Type "{props.target.name}" to confirm
						</label>
						<input
							id={typeFieldId}
							type="text"
							className="input input-bordered w-full text-base"
							value={typed}
							onChange={(e) => setTyped(e.target.value)}
							autoComplete="off"
						/>
					</div>
				) : null}

				<footer className="flex items-center justify-end gap-2 pt-2">
					<button
						type="button"
						className="btn btn-ghost btn-sm"
						onClick={props.onCancel}
						disabled={props.confirmDisabled}
					>
						Cancel
					</button>
					{props.mode === "type_name" && (
						<button
							type="button"
							className="btn btn-error btn-sm min-h-11"
							disabled={!canSubmit || props.confirmDisabled}
							onClick={submitType}
						>
							{verbCta(props.verb)}
						</button>
					)}
					{props.mode === "press_hold" && (
						<button
							type="button"
							aria-label="Hold to confirm"
							className="btn btn-error btn-sm min-h-11"
							disabled={!reasonValid || props.confirmDisabled}
							onPointerDown={startHold}
							onPointerUp={endHold}
							onPointerLeave={endHold}
							onPointerCancel={endHold}
						>
							Hold to confirm
						</button>
					)}
					{props.mode === "reason_only" && (
						<button
							type="button"
							className="btn btn-error btn-sm min-h-11"
							disabled={!reasonValid || props.confirmDisabled}
							onClick={submitType}
						>
							{verbCta(props.verb)}
						</button>
					)}
				</footer>
			</div>
		</div>
	);
}
