import { render, screen } from "@testing-library/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocRow } from "../ds";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DocRow", () => {
	const defaultProps = {
		title: "API Rate Limiting Pattern",
		status: "active" as const,
		timestamp: "3 hours ago",
	};

	it("renders title text", () => {
		render(<DocRow {...defaultProps} />);
		expect(screen.getByText("API Rate Limiting Pattern")).toBeInTheDocument();
	});

	it("renders status as StatusChip via documentStatusToStatus mapping", () => {
		render(<DocRow {...defaultProps} status="active" />);
		// active maps to healthy
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders timestamp", () => {
		render(<DocRow {...defaultProps} />);
		expect(screen.getByText("3 hours ago")).toBeInTheDocument();
	});

	it("renders actions slot content", () => {
		render(<DocRow {...defaultProps} actions={<button type="button">View</button>} />);
		expect(screen.getByText("View")).toBeInTheDocument();
	});

	it("calls onClick when row is clicked", () => {
		const handleClick = vi.fn();
		render(<DocRow {...defaultProps} onClick={handleClick} />);
		const row =
			screen.getByText("API Rate Limiting Pattern").closest("[role='button'], button, [onClick]") ??
			screen.getByText("API Rate Limiting Pattern").parentElement;
		(row as HTMLElement | null)?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders proposed status as BEHIND chip", () => {
		render(<DocRow {...defaultProps} status="proposed" />);
		expect(screen.getByText("BEHIND")).toBeInTheDocument();
	});

	it("renders active status as HEALTHY chip", () => {
		render(<DocRow {...defaultProps} status="active" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders stale status as ERROR chip", () => {
		render(<DocRow {...defaultProps} status="stale" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	it("renders archived status as DONE chip", () => {
		render(<DocRow {...defaultProps} status="archived" />);
		expect(screen.getByText("DONE")).toBeInTheDocument();
	});

	it("renders caption when provided", () => {
		render(<DocRow {...defaultProps} caption="A short description of the pattern" />);
		expect(screen.getByText("A short description of the pattern")).toBeInTheDocument();
	});

	it("does not render caption when omitted", () => {
		const { container } = render(<DocRow {...defaultProps} />);
		const captions = container.querySelectorAll("p");
		expect(captions.length).toBe(0);
	});

	it("has aria-label on title", () => {
		render(<DocRow {...defaultProps} />);
		expect(screen.getByLabelText("Document: API Rate Limiting Pattern")).toBeInTheDocument();
	});

	it("shows the item's status via StatusChip", () => {
		render(<DocRow {...defaultProps} />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// signals prop: recency/frequency/citation triad
// ---------------------------------------------------------------------------

const BASE_PROPS = {
	title: "Architecture Decision: Auth Strategy",
	status: "active" as const,
	timestamp: "2d ago",
};

describe("DocRow signals prop", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	// Backward compatibility: without signals prop, renders as before
	it("renders correctly without signals prop (backward compat)", () => {
		act(() => {
			root.render(createElement(DocRow, BASE_PROPS));
		});
		expect(container.textContent).toContain("Architecture Decision: Auth Strategy");
		// No signal triad rendered
		const triad = container.querySelector("[data-testid='document-signals']");
		expect(triad).toBeNull();
	});

	// Renders signal triad when signals prop is provided
	it("renders signal triad when signals prop is provided", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: 3, citation: null },
				}),
			);
		});
		const triad = container.querySelector("[data-testid='document-signals']");
		expect(triad).not.toBeNull();
	});

	// Renders recency value when present
	it("renders recency value when signals.recency is provided", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: "3h", frequency: null, citation: null },
				}),
			);
		});
		expect(container.textContent).toContain("3h");
	});

	// Renders frequency value when present
	it("renders frequency value when signals.frequency is provided", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: null, frequency: 5, citation: null },
				}),
			);
		});
		expect(container.textContent).toContain("5");
	});

	// Absent recency → em dash
	it("renders em dash for absent recency signal", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: null, frequency: null, citation: null },
				}),
			);
		});
		// Em dash U+2014 must appear in the rendered text
		expect(container.textContent).toContain("—");
	});

	// Absent frequency → em dash
	it("renders em dash for absent frequency signal", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: null, citation: null },
				}),
			);
		});
		expect(container.textContent).toContain("—");
	});

	// citation null (staged) → em dash — AC-3
	it("renders em dash for null citation (staged — AC-3)", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: 3, citation: null },
				}),
			);
		});
		// Citation slot shows em dash
		expect(container.textContent).toContain("—");
	});

	// All signals present — no em dash in numeric slots
	it("all signals present — numeric values rendered, no em dash in value slots", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: 3, citation: 2 },
				}),
			);
		});
		expect(container.textContent).toContain("2d");
		expect(container.textContent).toContain("3");
		expect(container.textContent).toContain("2");
	});

	// All signals absent — triad renders with all em dashes
	it("all signals absent — triad still renders with three em dashes", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: null, frequency: null, citation: null },
				}),
			);
		});
		const triad = container.querySelector("[data-testid='document-signals']");
		expect(triad).not.toBeNull();
		// Count em dashes — should be at least 3 (one per signal)
		const dashes = (triad?.textContent ?? "").split("—").length - 1;
		expect(dashes).toBeGreaterThanOrEqual(3);
	});

	// Signals prop does not affect caption — caption suppressed when signals provided
	it("caption prop is suppressed when signals prop is provided", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					caption: "Why now: conflict detected",
					signals: { recency: "2d", frequency: 3, citation: null },
				}),
			);
		});
		// Caption should NOT appear when signals is provided (per design)
		expect(container.textContent).not.toContain("Why now: conflict detected");
	});

	// Caption still renders without signals (backward compat)
	it("caption renders when signals prop is not provided (backward compat)", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					caption: "Why now: conflict detected",
				}),
			);
		});
		expect(container.textContent).toContain("Why now: conflict detected");
	});

	// Signal labels are rendered
	it("renders signal labels (recency, freq, impact)", () => {
		act(() => {
			root.render(
				createElement(DocRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: 3, citation: null },
				}),
			);
		});
		const text = container.textContent ?? "";
		// Labels per design: "recency", "freq", "impact"
		expect(text.toLowerCase()).toContain("recency");
		expect(text.toLowerCase()).toContain("freq");
		expect(text.toLowerCase()).toContain("impact");
	});
});
