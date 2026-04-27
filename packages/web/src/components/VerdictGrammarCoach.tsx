/**
 * L10 — Verdict-grammar coach mark.
 *
 * Walks A / R / X / S keys on the first thread the founder opens. Tracks
 * "seen" via `localStorage.hyperidle.coach.seen` so it only fires once
 * automatically. The `?` shortcut reopens it on demand at any time.
 *
 * @lore L10: localStorage is the right surface — coach-mark dismissal is
 * per-device UX state, not factory state. A re-install / new browser
 * surfaces the coach again, which is the desired behavior.
 */
import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";

const SEEN_KEY = "hyperidle.coach.seen";

interface VerdictGrammarCoachProps {
	/**
	 * When `true`, render the coach if it hasn't been dismissed before.
	 * Wired by callers that detect "first thread open" semantics.
	 */
	autoOpen: boolean;
}

function readSeen(): boolean {
	try {
		return window.localStorage.getItem(SEEN_KEY) === "true";
	} catch {
		return false;
	}
}

function writeSeen(): void {
	try {
		window.localStorage.setItem(SEEN_KEY, "true");
	} catch {
		// localStorage unavailable (private mode); coach will reappear next session.
	}
}

export function VerdictGrammarCoach({ autoOpen }: VerdictGrammarCoachProps): JSX.Element | null {
	const [open, setOpen] = useState(false);

	// Auto-open on first thread open if not yet seen.
	useEffect(() => {
		if (autoOpen && !readSeen()) {
			setOpen(true);
		}
	}, [autoOpen]);

	// `?` shortcut to reopen anytime.
	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				const target = e.target;
				if (
					target instanceof HTMLElement &&
					(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
				) {
					return;
				}
				e.preventDefault();
				setOpen(true);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	const dismiss = useCallback((): void => {
		writeSeen();
		setOpen(false);
	}, []);

	if (!open) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="coach-title"
			data-testid="verdict-grammar-coach"
			className="fixed inset-0 z-40 flex items-center justify-center"
		>
			<div className="modal-backdrop absolute inset-0" aria-hidden="true" />
			<div className="relative bg-[var(--surface-1)] border border-[var(--border-1)] p-6 max-w-md flex flex-col gap-3">
				<h2
					id="coach-title"
					className="text-sm font-heading font-semibold uppercase tracking-wider"
				>
					Verdict grammar
				</h2>
				<p className="text-sm text-[var(--text-mid)]">Four keys decide every review item:</p>
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
					<dt className="font-mono">A</dt>
					<dd>Approve — agent ships as proposed.</dd>
					<dt className="font-mono">R</dt>
					<dd>Request changes — leave inline notes; agent retries.</dd>
					<dt className="font-mono">X</dt>
					<dd>Reject — agent abandons this approach.</dd>
					<dt className="font-mono">S</dt>
					<dd>Snooze — defer to a later batch.</dd>
				</dl>
				<p className="text-xs text-[var(--text-lo)]">
					Press <kbd>?</kbd> anytime to revisit this guide.
				</p>
				<div className="flex justify-end">
					<button
						type="button"
						className="btn btn-sm btn-primary"
						onClick={dismiss}
						data-testid="verdict-grammar-coach-dismiss"
					>
						Got it
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * Test-only — clear the persistence so a fresh test sees the coach.
 *
 * @lore L10: leading underscore signals "internal — do not call from app
 * code". The naming convention rule is suppressed here because the
 * underscore is the intent.
 */
// biome-ignore lint/style/useNamingConvention: leading-underscore signals test-only API
export function _resetCoachSeenForTest(): void {
	try {
		window.localStorage.removeItem(SEEN_KEY);
	} catch {
		// noop
	}
}
