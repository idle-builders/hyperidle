/**
 * L7 — `ToastRegion` shell wrapper (plan §4.7).
 *
 * Tier 3 shell composition — NOT a new design-system component. Implements a
 * single transient toast at a time using DaisyUI's `toast` class. Provides a
 * `useToast()` hook returning `showToast(message)` via React context.
 *
 * Single-toast invariant: the most recent `showToast` call replaces the
 * currently-visible toast (queue depth 1). Each toast auto-dismisses after
 * 4 seconds with `role="status"` for assistive technology.
 */

import {
	createContext,
	type JSX,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

const TOAST_LIFETIME_MS = 4_000;

interface ToastApi {
	showToast: (message: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * Imperative toast trigger. Must be used inside a `<ToastRegion>`. Calling
 * outside throws — the alternative would be a silent no-op that hides bugs.
 */
export function useToast(): ToastApi {
	const ctx = useContext(ToastContext);
	if (!ctx) {
		throw new Error("useToast must be used within a <ToastRegion>");
	}
	return ctx;
}

export interface ToastRegionProps {
	children: ReactNode;
}

export function ToastRegion({ children }: ToastRegionProps): JSX.Element {
	const [message, setMessage] = useState<string | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const showToast = useCallback((next: string): void => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setMessage(next);
		timerRef.current = setTimeout(() => {
			setMessage(null);
			timerRef.current = null;
		}, TOAST_LIFETIME_MS);
	}, []);

	useEffect(() => {
		return (): void => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, []);

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}
			{/* @lore AI2: z-50 removed; z-layer now via --z-toast token (AC-3). Toasts sit above dialogs. */}
			{message !== null ? (
				<div
					className="toast toast-top toast-end"
					data-testid="toast-region"
					style={{ zIndex: "var(--z-toast)" }}
				>
					<div
						role="status"
						className="type-small border-width-thin alert bg-[var(--surface-container)] text-[var(--text-secondary)]  border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-[12px] py-[8px] "
					>
						{message}
					</div>
				</div>
			) : null}
		</ToastContext.Provider>
	);
}
