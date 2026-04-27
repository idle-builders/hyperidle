/**
 * L10 — Verdict-grammar coach mark.
 *
 * Walks A / R / X / S keys on the first thread the founder opens. The
 * "first-thread-seen" flag is SERVER-SIDE (`factory_settings.firstRun.
 * verdictCoachSeen`) — local storage was per-device and could fire the
 * coach again on a second browser. The `?` shortcut reopens it on demand
 * regardless of the flag.
 *
 * @lore L10 C3: rendered as an inline banner anchored above the verdict
 * surface, not a centered modal. Spec says "inline coach mark"; modal
 * pattern violates that. ESC dismisses; focus moves to the dismiss
 * button on open.
 *
 * @lore L10 C3: `storage` event listener kept as a belt-and-suspenders
 * for multi-tab sync — when one tab dismisses, peers stop showing the
 * coach without needing a server round-trip.
 */
import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const LOCAL_DISMISSED_KEY = "hyperidle.coach.seen";

interface VerdictGrammarCoachProps {
	/**
	 * When `true`, render the coach if the server-side flag says it has
	 * not yet been seen AND this is the first thread the founder opened.
	 */
	autoOpen: boolean;
	/**
	 * Server-derived "has the founder seen this coach already?" flag.
	 * Sourced from `/api/first-run/status.verdictCoachSeen` by the caller.
	 */
	serverSeen: boolean;
}

function readLocalDismissed(): boolean {
	try {
		return window.localStorage.getItem(LOCAL_DISMISSED_KEY) === "true";
	} catch {
		return false;
	}
}

function writeLocalDismissed(): void {
	try {
		window.localStorage.setItem(LOCAL_DISMISSED_KEY, "true");
	} catch {
		// localStorage unavailable (private mode); we still POST to the server.
	}
}

async function postSeenFlag(): Promise<void> {
	try {
		await fetch("/api/first-run/verdict-coach-seen", {
			method: "POST",
			headers: { "X-Requested-With": "hyperidle-web" },
		});
	} catch {
		// Best effort — the local flag still suppresses re-open this session.
	}
}

export function VerdictGrammarCoach({
	autoOpen,
	serverSeen,
}: VerdictGrammarCoachProps): JSX.Element | null {
	const [open, setOpen] = useState(false);
	const [locallyDismissed, setLocallyDismissed] = useState<boolean>(() => readLocalDismissed());
	const dismissButtonRef = useRef<HTMLButtonElement>(null);

	// Auto-open on first thread open if neither server nor local has the
	// dismissal recorded.
	useEffect(() => {
		if (autoOpen && !serverSeen && !locallyDismissed) {
			setOpen(true);
		}
	}, [autoOpen, serverSeen, locallyDismissed]);

	// `?` shortcut to reopen anytime — independent of the seen flag.
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

	// Multi-tab sync via `storage` event — peer tabs hide the banner the
	// moment one tab dismisses.
	useEffect(() => {
		const handler = (e: StorageEvent): void => {
			if (e.key === LOCAL_DISMISSED_KEY && e.newValue === "true") {
				setLocallyDismissed(true);
				setOpen(false);
			}
		};
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	}, []);

	const dismiss = useCallback((): void => {
		writeLocalDismissed();
		setLocallyDismissed(true);
		setOpen(false);
		void postSeenFlag();
	}, []);

	// ESC dismisses when open.
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				e.preventDefault();
				dismiss();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, dismiss]);

	// Focus the dismiss button on open for keyboard accessibility.
	useEffect(() => {
		if (open) {
			dismissButtonRef.current?.focus();
		}
	}, [open]);

	if (!open) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			aria-labelledby="coach-title"
			data-testid="verdict-grammar-coach"
			className="bg-[var(--surface-1)] border border-[var(--border-default)] p-3 max-w-2xl flex flex-col gap-3"
		>
			<h2 id="coach-title" className="text-sm font-heading font-semibold uppercase tracking-wider">
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
				Press <kbd>?</kbd> anytime to revisit, or <kbd>Esc</kbd> to dismiss.
			</p>
			<div className="flex justify-end">
				<button
					type="button"
					ref={dismissButtonRef}
					className="btn btn-sm btn-primary"
					onClick={dismiss}
					data-testid="verdict-grammar-coach-dismiss"
				>
					Got it
				</button>
			</div>
		</div>
	);
}
