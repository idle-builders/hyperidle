/**
 * AL5 — SurfaceBoundary error boundary tests.
 *
 * Covers:
 *   AC4 — malformed/failed surface cannot break the host (invariant #3)
 *   Invariant #3: floor fallback never breaks the host
 *   Architecture §4.4: SurfaceBoundary renders children; on throw → renders fallback
 *   The fallback (base canvas) must render fully — the host review stays intact
 *
 * RED PHASE: SurfaceBoundary does not exist yet. All tests fail at import.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SurfaceBoundary } from "../SurfaceBoundary.js";

// ── helpers ───────────────────────────────────────────────────────────────────

/** A surface component that unconditionally throws during render. */
function ThrowingSurface(): never {
	throw new Error("Surface render failure — simulated");
}

/** A surface that renders normally. */
function HappySurface(): JSX.Element {
	return <div data-testid="happy-surface">Surface rendered</div>;
}

/** The fallback (base canvas) element. */
function BaseFallback(): JSX.Element {
	return <div data-testid="base-fallback">Base canvas fallback</div>;
}

// ── AC4: throw → base canvas renders ─────────────────────────────────────────

describe("AL5 SurfaceBoundary — AC4: floor fallback on surface throw (invariant #3)", () => {
	it("renders children when the surface component does not throw", () => {
		render(
			<SurfaceBoundary fallback={<BaseFallback />}>
				<HappySurface />
			</SurfaceBoundary>,
		);
		expect(screen.getByTestId("happy-surface")).toBeInTheDocument();
		expect(screen.queryByTestId("base-fallback")).not.toBeInTheDocument();
	});

	it("renders the fallback (base canvas) when the surface throws", () => {
		// AC4 / invariant #3: a malformed surface cannot break the host review.
		// Suppress React's error boundary console.error output in tests.
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			render(
				<SurfaceBoundary fallback={<BaseFallback />}>
					<ThrowingSurface />
				</SurfaceBoundary>,
			);
			// The fallback (base canvas) must render.
			expect(screen.getByTestId("base-fallback")).toBeInTheDocument();
			// The throwing surface must NOT be present.
			expect(screen.queryByTestId("happy-surface")).not.toBeInTheDocument();
		} finally {
			spy.mockRestore();
		}
	});

	it("calls onCaught callback when the surface throws", () => {
		const onCaught = vi.fn();
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			render(
				<SurfaceBoundary fallback={<BaseFallback />} onCaught={onCaught}>
					<ThrowingSurface />
				</SurfaceBoundary>,
			);
			// onCaught notifies the render site that a degrade occurred.
			expect(onCaught).toHaveBeenCalledOnce();
		} finally {
			spy.mockRestore();
		}
	});

	it("does NOT call onCaught when the surface renders normally", () => {
		const onCaught = vi.fn();
		render(
			<SurfaceBoundary fallback={<BaseFallback />} onCaught={onCaught}>
				<HappySurface />
			</SurfaceBoundary>,
		);
		expect(onCaught).not.toHaveBeenCalled();
	});

	it("host review structure still intact when surface throws (base renders without crashing)", () => {
		// Invariant #3: the fallback must render fully so the review stays usable.
		// The fallback can contain a verdict area or other host content.
		function FallbackWithVerdict(): JSX.Element {
			return (
				<div>
					<div data-testid="base-canvas">Base canvas</div>
					<div data-testid="verdict-area">Approve / Reject</div>
				</div>
			);
		}

		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			render(
				<SurfaceBoundary fallback={<FallbackWithVerdict />}>
					<ThrowingSurface />
				</SurfaceBoundary>,
			);
			expect(screen.getByTestId("base-canvas")).toBeInTheDocument();
			expect(screen.getByTestId("verdict-area")).toBeInTheDocument();
		} finally {
			spy.mockRestore();
		}
	});
});

// ── SurfaceBoundary is prop-agnostic ─────────────────────────────────────────

describe("AL5 SurfaceBoundary — prop-agnostic: does not construct Canvas itself", () => {
	it("accepts any ReactNode as fallback (not a Canvas component reference)", () => {
		// Architecture §4.4: SurfaceBoundary renders children + fallback; it does NOT
		// import or construct Canvas itself — the render site does, forwarding branch props.
		const fallback = <span data-testid="arbitrary-fallback">Arbitrary</span>;
		render(
			<SurfaceBoundary fallback={fallback}>
				<HappySurface />
			</SurfaceBoundary>,
		);
		// Fallback not shown (no throw) — but the SurfaceBoundary accepted it as a prop.
		expect(screen.queryByTestId("arbitrary-fallback")).not.toBeInTheDocument();
		expect(screen.getByTestId("happy-surface")).toBeInTheDocument();
	});
});
