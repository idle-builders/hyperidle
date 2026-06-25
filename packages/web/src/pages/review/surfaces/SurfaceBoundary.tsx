/**
 * AL5 — SurfaceBoundary: React error boundary that degrades to the base canvas.
 *
 * A malformed or crashing surface is caught here and replaced with the `fallback`
 * element (the base canvas, built with the SAME AL7 props at the render site).
 * The host review is NEVER broken by a surface failure — the floor always renders.
 *
 * Architecture §4.4: SurfaceBoundary is prop-agnostic. It renders `children` and,
 * on any throw during the surface's render, renders `fallback`. It does NOT
 * construct <Canvas/> itself; the render site (ReviewComposition.tsx §4.3) does,
 * forwarding the branch's full props into both children and fallback.
 *
 * @lore AL5 WARN-1: The fallback element must be the base ReviewActionOperation
 * with the SAME status/outcome/proposedCall props — so the AL7 OutcomeBand is
 * preserved even when the surface degrades. The render site builds both elements
 * before passing them to SurfaceBoundary (see §4.3 pseudocode).
 *
 * @lore AL5: React error boundaries must be class components (the React lifecycle
 * method getDerivedStateFromError is not available as a hook). This is the single
 * class component in the AL5 surface system.
 */

import { Component, type JSX, type ReactNode } from "react";

interface SurfaceBoundaryProps {
	/** The resolved surface element to render (children). On throw, fallback renders instead. */
	readonly children: ReactNode;
	/** The base canvas element to render on catch (built with full AL7 props by the render site). */
	readonly fallback: ReactNode;
	/** Called exactly once when the surface throws. Notifies the render site. Optional. */
	readonly onCaught?: () => void;
}

interface SurfaceBoundaryState {
	readonly caught: boolean;
}

/**
 * SurfaceBoundary wraps a resolved surface in an error boundary.
 * On any render-time throw, it renders the fallback (base canvas) and calls onCaught.
 *
 * AC4 / invariant #3: a malformed/failed surface cannot break the host review.
 */
export class SurfaceBoundary extends Component<SurfaceBoundaryProps, SurfaceBoundaryState> {
	constructor(props: SurfaceBoundaryProps) {
		super(props);
		this.state = { caught: false };
	}

	static getDerivedStateFromError(_error: unknown): SurfaceBoundaryState {
		// Transition to fallback mode on any thrown error.
		return { caught: true };
	}

	componentDidCatch(_error: unknown, _info: unknown): void {
		// Notify the render site that a degrade occurred.
		this.props.onCaught?.();
	}

	render(): JSX.Element {
		if (this.state.caught) {
			// Floor fallback: the base canvas with the original AL7 props.
			// The render site built this element before mounting SurfaceBoundary.
			return <>{this.props.fallback}</>;
		}
		return <>{this.props.children}</>;
	}
}
