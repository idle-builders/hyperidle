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

/** Imperative toast trigger — must be inside <ToastRegion>; throws if called outside (silent no-op would hide bugs). */
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
