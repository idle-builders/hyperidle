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
			json: () => Promise.resolve({ conversations: [], work: [], documents: [] }),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// SANCTIONED CHANGE #2 (AI2): GlobalSearchPanel migrates from DaisyUI .modal.modal-open
	// chrome to useDialogBehavior. Both selectors AND the z assertion update:
	//   - .modal.modal-open → [data-dialog-layer="dialog"]   (selector migration)
	//   - /z-50/             → data-dialog-layer="dialog"     (assertion — layer attribute proves the band)
	// The .modal.modal-box chrome is gone; the panel keeps its own palette chrome + 640px max-width.
	// See architecture.md §Sanctioned assertion changes #2 for full rationale.
	// UI-001: panel is portalled into #overlay-root (sibling of #root).
	// Use document.querySelector — portal content is outside the RTL container.
	it("overlay container carries --z-dialog layer so it stacks above Settings (--z-overlay)", () => {
		render(<GlobalSearchPanel {...defaultProps} />);
		// After migration: the overlay is queried by data-dialog-layer, NOT .modal.modal-open
		const overlay = document.querySelector('[data-dialog-layer="dialog"]');
		expect(overlay).not.toBeNull();
		// The layer attribute itself proves the z-band (--z-dialog = 60, above --z-overlay = 40)
		expect(overlay?.getAttribute("data-dialog-layer")).toBe("dialog");
	});

	it("renders a recent-queries row region at the bottom, labeled for assistive tech", () => {
		render(<GlobalSearchPanel {...defaultProps} />);
		const recent = document.querySelector('[data-testid="search-recent-queries"]');
		expect(recent).not.toBeNull();
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
