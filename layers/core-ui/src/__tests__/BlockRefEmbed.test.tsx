/**
 * T4 — BlockRefEmbed component tests (AC-6, AC-7).
 *
 * RED phase: tests verify the loading, resolved, degraded, and error
 * states of the BlockRefEmbed component.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlockRefEmbed } from "../components/BlockRefEmbed";

// ---------------------------------------------------------------------------
// Mock useBlockResolution
// ---------------------------------------------------------------------------

const mockUseBlockResolution = vi.fn();

vi.mock("../hooks/useBlockResolution", () => ({
	useBlockResolution: (...args: unknown[]) => mockUseBlockResolution(...args),
}));

function renderEmbed(blockId: string, hostKind: string, hostId: string) {
	return render(
		<MemoryRouter>
			{/* biome-ignore lint/suspicious/noExplicitAny: test helper */}
			<BlockRefEmbed blockId={blockId} hostKind={hostKind as any} hostId={hostId} />
		</MemoryRouter>,
	);
}

describe("T4 — BlockRefEmbed states", () => {
	beforeEach(() => {
		mockUseBlockResolution.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a loading skeleton when status=loading", () => {
		mockUseBlockResolution.mockReturnValue({ status: "loading" });
		renderEmbed("blk-1", "bet", "bet-abc");
		// Skeleton: some loading indicator — could be shimmer div or aria-busy
		expect(screen.getByTestId("block-ref-embed-loading")).toBeInTheDocument();
	});

	it("renders block content when status=resolved", () => {
		mockUseBlockResolution.mockReturnValue({
			status: "resolved",
			payload: { kind: "paragraph", inline: [{ type: "text", value: "Hello block" }] },
			hostLabel: "My Bet",
		});
		renderEmbed("blk-1", "bet", "bet-abc");
		expect(screen.getByTestId("block-ref-embed-resolved")).toBeInTheDocument();
		expect(screen.getByText(/hello block/i)).toBeInTheDocument();
	});

	it("renders 'source changed' indicator when status=degraded (AC-7)", () => {
		mockUseBlockResolution.mockReturnValue({ status: "degraded" });
		renderEmbed("blk-1", "bet", "bet-abc");
		expect(screen.getByTestId("block-ref-embed-degraded")).toBeInTheDocument();
		expect(screen.getByText(/source changed/i)).toBeInTheDocument();
	});

	it("does NOT crash when status=degraded", () => {
		mockUseBlockResolution.mockReturnValue({ status: "degraded" });
		expect(() => renderEmbed("blk-1", "bet", "bet-abc")).not.toThrow();
	});

	it("renders error state with retry button when status=error (AC-7)", () => {
		mockUseBlockResolution.mockReturnValue({
			status: "error",
			error: "Network failure",
		});
		renderEmbed("blk-1", "knowledge_item", "k-xyz");
		expect(screen.getByTestId("block-ref-embed-error")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});

	it("shows 'from: <hostKind>' label in resolved state (AC-6)", () => {
		mockUseBlockResolution.mockReturnValue({
			status: "resolved",
			payload: { kind: "paragraph", inline: [{ type: "text", value: "Content here" }] },
			hostLabel: "The Bet Title",
		});
		renderEmbed("blk-1", "bet", "bet-abc");
		// The embed card should display a "from" label hinting at the source
		const embedCard = screen.getByTestId("block-ref-embed-resolved");
		expect(embedCard.textContent).toMatch(/bet|block from/i);
	});

	it("passes correct args to useBlockResolution", () => {
		mockUseBlockResolution.mockReturnValue({ status: "loading" });
		renderEmbed("blk-specific", "knowledge_item", "k-888");
		expect(mockUseBlockResolution).toHaveBeenCalledWith("knowledge_item", "k-888", "blk-specific");
	});
});

describe("T4 — BlockRefEmbed retry behavior", () => {
	it("calls retry on useBlockResolution when retry button clicked", async () => {
		const user = userEvent.setup();
		const retryFn = vi.fn();
		mockUseBlockResolution.mockReturnValue({
			status: "error",
			error: "Timeout",
			retry: retryFn,
		});
		renderEmbed("blk-fail", "bet", "bet-retry");
		await user.click(screen.getByRole("button", { name: /retry/i }));
		expect(retryFn).toHaveBeenCalledOnce();
	});
});
