/**
 * L9 — ActionSummaryView. Deploy / pricing / email-blast item with one-shot
 * type-to-confirm and impact list. Critical risk tier surfaces the red
 * CRITICAL badge in the shared metadata strip.
 */
import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActionSummaryView } from "../ActionSummaryView";

const meta: ArtifactMetadataExtended = {
	kind: "action_summary",
	riskTier: "critical",
	reversibility: false,
	costEstimate: 120,
	blastRadius: { agents: [], teams: [], products: ["hyperidle-web"] },
	sandboxResult: "passed",
	status: "pending",
	sla: "2h left",
	routing: "Deploy Agent",
};

const payload = {
	actionType: "deploy" as const,
	summary: "Deploy hyperidle-web v2.4.1 to prod",
	impactList: [
		{ label: "Affected products", value: "hyperidle-web, hyperidle-api" },
		{ label: "User-facing", value: "yes" },
		{ label: "Rollback ETA", value: "4m" },
	],
	confirmToken: "deploy",
};

describe("L9: ActionSummaryView", () => {
	it("wraps content in the shared ArtifactShell metadata strip", () => {
		render(<ActionSummaryView metadata={meta} payload={payload} />);
		expect(screen.getByTestId("artifact-metadata-strip-v2")).toBeInTheDocument();
	});

	it("renders the summary line", () => {
		render(<ActionSummaryView metadata={meta} payload={payload} />);
		expect(screen.getByText(/Deploy hyperidle-web v2.4.1 to prod/)).toBeInTheDocument();
	});

	it("renders every impact-list entry", () => {
		render(<ActionSummaryView metadata={meta} payload={payload} />);
		const list = screen.getByTestId("action-summary-impact-list");
		expect(list).toHaveTextContent("Affected products");
		expect(list).toHaveTextContent("hyperidle-web, hyperidle-api");
		expect(list).toHaveTextContent("Rollback ETA");
		expect(list).toHaveTextContent("4m");
	});

	it("renders a type-to-confirm input labeled with the confirm token", () => {
		render(<ActionSummaryView metadata={meta} payload={payload} />);
		const input = screen.getByTestId("action-summary-confirm-input");
		expect(input).toBeInTheDocument();
		// Label/aria-label or placeholder must mention the token.
		const label = screen.getByText(/type 'deploy' to confirm/i);
		expect(label).toBeInTheDocument();
	});

	it("type-to-confirm input flips data-confirm-ready when input matches token", async () => {
		const user = userEvent.setup();
		render(<ActionSummaryView metadata={meta} payload={payload} />);
		const ready = screen.getByTestId("action-summary-confirm-ready");
		// Initially not ready
		expect(ready).toHaveAttribute("data-confirm-ready", "false");
		const input = screen.getByTestId("action-summary-confirm-input");
		await user.type(input, "deplo");
		expect(ready).toHaveAttribute("data-confirm-ready", "false");
		await user.type(input, "y");
		expect(ready).toHaveAttribute("data-confirm-ready", "true");
	});

	it("critical risk_tier produces a data-risk='critical' badge in the metadata strip", () => {
		render(<ActionSummaryView metadata={meta} payload={payload} />);
		const badge = screen.getByTestId("artifact-risk-badge");
		expect(badge).toHaveAttribute("data-risk", "critical");
	});

	it("does not render its own metadata-strip duplicate (uses shared shell)", () => {
		const { container } = render(<ActionSummaryView metadata={meta} payload={payload} />);
		// Only one metadata strip per renderer.
		expect(container.querySelectorAll("[data-testid='artifact-metadata-strip-v2']")).toHaveLength(
			1,
		);
	});

	it("invokes onReadyChange(false) initially and onReadyChange(true) when token matches", async () => {
		const user = userEvent.setup();
		const onReadyChange = vi.fn();
		render(<ActionSummaryView metadata={meta} payload={payload} onReadyChange={onReadyChange} />);
		// Initial render fires the effect with the not-ready state.
		expect(onReadyChange).toHaveBeenLastCalledWith(false);
		const input = screen.getByTestId("action-summary-confirm-input");
		await user.type(input, "deploy");
		expect(onReadyChange).toHaveBeenLastCalledWith(true);
		await user.clear(input);
		expect(onReadyChange).toHaveBeenLastCalledWith(false);
	});

	it("readiness affordance is visible (not sr-only) and reflects the gate state", async () => {
		const user = userEvent.setup();
		render(<ActionSummaryView metadata={meta} payload={payload} />);
		const ready = screen.getByTestId("action-summary-confirm-ready");
		// Visible affordance — must NOT be sr-only.
		expect(ready).not.toHaveClass("sr-only");
		expect(ready).toHaveTextContent(/Approve disabled/);
		const input = screen.getByTestId("action-summary-confirm-input");
		await user.type(input, "deploy");
		expect(ready).toHaveTextContent(/Ready — Approve enabled/);
	});
});
