/**
 * AG4 — NavHistoryCluster shell component (RED phase).
 *
 * Renders [←][→] pair. Consumes useHistoryAvailability internally.
 * - Back button: always rendered, disabled when canGoBack=false
 * - Forward button: rendered only when canGoForward=true
 * - Calls onBack/onForward callbacks on click
 *
 * @lore AG4: cluster is desktop-only; mobile keeps the existing 48px header chevron.
 *
 * These tests FAIL until layers/web/src/shell/NavHistoryCluster.tsx is created.
 */

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";

// Mock useHistoryAvailability so tests are deterministic
vi.mock("../hooks/useHistoryAvailability.js", () => ({
	useHistoryAvailability: vi.fn(() => ({ canGoBack: false, canGoForward: false })),
}));

// Import the mock so tests can override it per case
import { useHistoryAvailability } from "../hooks/useHistoryAvailability.js";

const mockUseHistoryAvailability = vi.mocked(useHistoryAvailability);

describe("AG4 — NavHistoryCluster", () => {
	describe("Back button", () => {
		it("renders a Back button", () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: false, canGoForward: false });
			render(<NavHistoryCluster onBack={vi.fn()} onForward={vi.fn()} />);
			expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
		});

		it("Back button is disabled when canGoBack=false", () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: false, canGoForward: false });
			render(<NavHistoryCluster onBack={vi.fn()} onForward={vi.fn()} />);
			const btn = screen.getByRole("button", { name: /back/i });
			expect(btn).toBeDisabled();
		});

		it("Back button is enabled when canGoBack=true", () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: true, canGoForward: false });
			render(<NavHistoryCluster onBack={vi.fn()} onForward={vi.fn()} />);
			const btn = screen.getByRole("button", { name: /back/i });
			expect(btn).not.toBeDisabled();
		});

		it("calls onBack when Back clicked", async () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: true, canGoForward: false });
			const onBack = vi.fn();
			render(<NavHistoryCluster onBack={onBack} onForward={vi.fn()} />);
			await userEvent.click(screen.getByRole("button", { name: /back/i }));
			expect(onBack).toHaveBeenCalledOnce();
		});
	});

	describe("Forward button", () => {
		it("Forward button is NOT rendered when canGoForward=false", () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: false, canGoForward: false });
			render(<NavHistoryCluster onBack={vi.fn()} onForward={vi.fn()} />);
			expect(screen.queryByRole("button", { name: /forward/i })).not.toBeInTheDocument();
		});

		it("Forward button IS rendered when canGoForward=true", () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: true, canGoForward: true });
			render(<NavHistoryCluster onBack={vi.fn()} onForward={vi.fn()} />);
			expect(screen.getByRole("button", { name: /forward/i })).toBeInTheDocument();
		});

		it("calls onForward when Forward clicked", async () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: true, canGoForward: true });
			const onForward = vi.fn();
			render(<NavHistoryCluster onBack={vi.fn()} onForward={onForward} />);
			await userEvent.click(screen.getByRole("button", { name: /forward/i }));
			expect(onForward).toHaveBeenCalledOnce();
		});
	});

	describe("Accessibility", () => {
		it("Back button has aria-label='Back'", () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: false, canGoForward: false });
			render(<NavHistoryCluster onBack={vi.fn()} onForward={vi.fn()} />);
			expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
		});

		it("Forward button has aria-label='Forward' when rendered", () => {
			mockUseHistoryAvailability.mockReturnValue({ canGoBack: true, canGoForward: true });
			render(<NavHistoryCluster onBack={vi.fn()} onForward={vi.fn()} />);
			expect(screen.getByRole("button", { name: "Forward" })).toBeInTheDocument();
		});
	});
});
