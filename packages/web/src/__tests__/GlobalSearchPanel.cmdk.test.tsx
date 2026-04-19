import { render, screen } from "@testing-library/react";
/**
 * J3 — GlobalSearchPanel Command-K visual behavior.
 *
 * AC:
 * - Centered overlay with max 640px width.
 * - Stacks above Settings (z-50).
 * - Mono recent-queries row at bottom.
 *
 * These assertions extend GlobalSearchPanel.test.tsx without editing the
 * protected baseline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";

describe("GlobalSearchPanel Command-K visual (J3)", () => {
	const defaultProps = {
		open: true,
		onClose: vi.fn(),
		onNavigate: vi.fn(),
	};

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ conversations: [], work: [], knowledge: [] }),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("overlay container carries z-50 so it stacks above Settings (z-40)", () => {
		const { container } = render(<GlobalSearchPanel {...defaultProps} />);
		const overlay = container.querySelector(".modal.modal-open");
		expect(overlay).not.toBeNull();
		expect(overlay?.className).toMatch(/z-50/);
	});

	it("inner box enforces the 640px max-width from the spec", () => {
		const { container } = render(<GlobalSearchPanel {...defaultProps} />);
		const box = container.querySelector(".modal-box");
		expect(box).not.toBeNull();
		// We accept either the Tailwind arbitrary max-w-[640px] or the
		// semantically equivalent style attribute.
		const cls = box?.className ?? "";
		const hasArbitraryMax = /max-w-\[640px\]/.test(cls);
		expect(hasArbitraryMax).toBe(true);
	});

	it("renders a recent-queries row region at the bottom with monospace font", () => {
		const { container } = render(<GlobalSearchPanel {...defaultProps} />);
		const recent = container.querySelector('[data-testid="search-recent-queries"]');
		expect(recent).not.toBeNull();
		expect(recent?.className ?? "").toMatch(/font-mono/);
		// The region should be labeled for assistive tech.
		expect(
			recent?.getAttribute("aria-label") ?? recent?.getAttribute("aria-labelledby") ?? "",
		).not.toBe("");
	});

	it("recent-queries row reports initial empty state", () => {
		render(<GlobalSearchPanel {...defaultProps} />);
		// Default placeholder message when no recent queries exist.
		expect(screen.getByText(/no recent/i)).toBeInTheDocument();
	});
});
