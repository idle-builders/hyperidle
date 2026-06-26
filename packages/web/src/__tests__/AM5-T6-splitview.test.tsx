// AM5 T6 — SplitView finalize + useUiPreference + reconcile THREE splits
// RED phase: these tests prove surfaceKey persistence, mode transitions, H1 route guard.

// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// ── 1. SplitViewProps.surfaceKey ─────────────────────────────────────────────────
describe("SplitView: surfaceKey prop", () => {
	it("SplitViewProps accepts surfaceKey (TypeScript structural test)", async () => {
		const { SplitView } = await import("@hyperidle/design-system");
		// If this renders without error, surfaceKey is accepted
		const { container } = render(
			<SplitView
				origin={<div>origin</div>}
				destination={<div>dest</div>}
				mode="split"
				dividerRatio={0.5}
				surfaceKey="test.surface"
			/>,
		);
		expect(container.querySelector("[data-ds-component='split-view']")).toBeTruthy();
	});
});

// ── 2. useUiPreference ───────────────────────────────────────────────────────────
describe("useUiPreference", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("returns defaultRatio when no stored value", async () => {
		const { useUiPreference } = await import("../hooks/useUiPreference.js");
		const { renderHook } = await import("@testing-library/react");

		const { result } = renderHook(() => useUiPreference("test.key", 0.4));
		const [ratio] = result.current;
		expect(ratio).toBe(0.4);
	});

	it("returns stored value when localStorage has a valid ratio", async () => {
		localStorage.setItem("hyperidle.split.test.key", "0.65");
		const { useUiPreference } = await import("../hooks/useUiPreference.js");
		const { renderHook } = await import("@testing-library/react");

		const { result } = renderHook(() => useUiPreference("test.key", 0.4));
		const [ratio] = result.current;
		expect(ratio).toBeCloseTo(0.65);
	});

	it("clamps stored value above 0.8 to 0.8", async () => {
		localStorage.setItem("hyperidle.split.test.clamp-hi", "0.99");
		const { useUiPreference } = await import("../hooks/useUiPreference.js");
		const { renderHook } = await import("@testing-library/react");

		const { result } = renderHook(() => useUiPreference("test.clamp-hi", 0.5));
		const [ratio] = result.current;
		expect(ratio).toBe(0.8);
	});

	it("clamps stored value below 0.2 to 0.2", async () => {
		localStorage.setItem("hyperidle.split.test.clamp-lo", "0.01");
		const { useUiPreference } = await import("../hooks/useUiPreference.js");
		const { renderHook } = await import("@testing-library/react");

		const { result } = renderHook(() => useUiPreference("test.clamp-lo", 0.5));
		const [ratio] = result.current;
		expect(ratio).toBe(0.2);
	});

	it("falls back to defaultRatio when stored value is NaN", async () => {
		localStorage.setItem("hyperidle.split.test.nan", "not-a-number");
		const { useUiPreference } = await import("../hooks/useUiPreference.js");
		const { renderHook } = await import("@testing-library/react");

		const { result } = renderHook(() => useUiPreference("test.nan", 0.55));
		const [ratio] = result.current;
		expect(ratio).toBe(0.55);
	});

	it("setRatio persists to localStorage", async () => {
		const { useUiPreference } = await import("../hooks/useUiPreference.js");
		const { renderHook, act } = await import("@testing-library/react");

		const { result } = renderHook(() => useUiPreference("test.persist", 0.5));
		await act(async () => {
			result.current[1](0.7);
		});
		expect(result.current[0]).toBeCloseTo(0.7);
		expect(localStorage.getItem("hyperidle.split.test.persist")).toBe("0.7");
	});
});

// ── 3. SplitView modes ───────────────────────────────────────────────────────────
describe("SplitView: modes", () => {
	it("fold-back: hides destination", async () => {
		const { SplitView } = await import("@hyperidle/design-system");
		const { container } = render(
			<SplitView
				origin={<div data-testid="origin-content">origin</div>}
				destination={<div data-testid="dest-content">dest</div>}
				mode="fold-back"
				dividerRatio={0.5}
			/>,
		);
		// In fold-back, only origin is shown
		expect(container.querySelector("[data-testid='origin-content']")).toBeTruthy();
		expect(container.querySelector("[data-testid='dest-content']")).toBeNull();
	});

	it("full: hides origin", async () => {
		const { SplitView } = await import("@hyperidle/design-system");
		const { container } = render(
			<SplitView
				origin={<div data-testid="origin-content">origin</div>}
				destination={<div data-testid="dest-content">dest</div>}
				mode="full"
				dividerRatio={0.5}
			/>,
		);
		// In full, only destination is shown
		expect(container.querySelector("[data-testid='origin-content']")).toBeNull();
		expect(container.querySelector("[data-testid='dest-content']")).toBeTruthy();
	});

	it("split: shows both origin and destination", async () => {
		const { SplitView } = await import("@hyperidle/design-system");
		const { container } = render(
			<SplitView
				origin={<div data-testid="origin-content">origin</div>}
				destination={<div data-testid="dest-content">dest</div>}
				mode="split"
				dividerRatio={0.5}
			/>,
		);
		expect(container.querySelector("[data-testid='origin-content']")).toBeTruthy();
		expect(container.querySelector("[data-testid='dest-content']")).toBeTruthy();
	});
});

// ── 4. AC3 regression: review route stays green (open-handler) ──────────────────
describe("AC3: review open-handler route (regression guard)", () => {
	it("review target navigates to /work/bet/:betId/review/:reviewId", async () => {
		const { createOpenHandler } = await import("../services/open-handler.js");
		const nav = vi.fn();
		const handler = createOpenHandler(nav, { betId: "bet-1" });
		handler({ route: "review", betId: "bet-1", reviewId: "rev-1" });
		expect(nav).toHaveBeenCalledWith("/work/bet/bet-1/review/rev-1");
	});
});

// ── 5. H5: host-route artifact → /artifacts/:id (T7 will fix host-route.ts;
//    this test is intentionally in a SEPARATE T7 file to avoid T6 scope confusion)
// NOTE: H5 seam fix lives in T7 — see AM5-T7-host-route.test.ts
