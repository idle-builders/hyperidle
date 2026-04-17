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

afterEach(() => {
	cleanup();
});
