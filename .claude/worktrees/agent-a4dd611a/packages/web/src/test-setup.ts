import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * @lore RTL's waitFor checks `typeof jest !== 'undefined'` to detect fake
 * timers and use jest.advanceTimersByTime for retries. Without this shim,
 * waitFor falls back to real setInterval which never fires under
 * vi.useFakeTimers(), causing every waitFor call to hang until test timeout.
 * Vitest does not expose a `jest` global even with globals:true.
 */
globalThis.jest = {
	...globalThis.jest,
	advanceTimersByTime: vi.advanceTimersByTime.bind(vi),
} as typeof jest;

/**
 * @lore React Router v7 creates Request objects with AbortSignal via
 * `createClientSideRequest`. Under jsdom + Bun, the AbortSignal from jsdom
 * doesn't match Node's native AbortSignal class, causing:
 *   TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal
 * Fix: Replace the global Request constructor with one that strips the signal
 * from the RequestInit before passing to the native Request, then re-applies it.
 * This only affects tests — production code runs in a real browser.
 */
const OriginalRequest = globalThis.Request;
class PatchedRequest extends OriginalRequest {
	constructor(input: RequestInfo | URL, init?: RequestInit) {
		if (init?.signal) {
			const { signal, ...rest } = init;
			super(input, rest);
			// Re-define the signal property with the original value so React Router
			// can still read it, but the constructor doesn't throw.
			Object.defineProperty(this, "signal", {
				get() {
					return signal;
				},
			});
		} else {
			super(input, init);
		}
	}
}
globalThis.Request = PatchedRequest as typeof Request;

afterEach(() => {
	cleanup();
});
