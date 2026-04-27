import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileVerdictBar } from "../MobileVerdictBar";

describe("MobileVerdictBar (L5)", () => {
	it("renders Approve / Request Changes / Reject as primary buttons + More", () => {
		render(
			<MobileVerdictBar
				pendingVerdict={null}
				verdictDoubleClick={true}
				onPrefill={() => {}}
				onCommit={() => {}}
				onMore={() => {}}
			/>,
		);
		expect(screen.getByTestId("mobile-verdict-approve")).toHaveTextContent("Approve");
		expect(screen.getByTestId("mobile-verdict-request-changes")).toHaveTextContent(
			"Request Changes",
		);
		expect(screen.getByTestId("mobile-verdict-reject")).toHaveTextContent("Reject");
		expect(screen.getByTestId("mobile-verdict-more")).toBeInTheDocument();
	});

	it("first tap on Approve calls onPrefill (verdictDoubleClick=true)", () => {
		const onPrefill = vi.fn();
		const onCommit = vi.fn();
		render(
			<MobileVerdictBar
				pendingVerdict={null}
				verdictDoubleClick={true}
				onPrefill={onPrefill}
				onCommit={onCommit}
				onMore={() => {}}
			/>,
		);
		fireEvent.click(screen.getByTestId("mobile-verdict-approve"));
		expect(onPrefill).toHaveBeenCalledWith("approve");
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("second tap on the same pending verdict calls onCommit", () => {
		const onPrefill = vi.fn();
		const onCommit = vi.fn();
		render(
			<MobileVerdictBar
				pendingVerdict="approve"
				verdictDoubleClick={true}
				onPrefill={onPrefill}
				onCommit={onCommit}
				onMore={() => {}}
			/>,
		);
		fireEvent.click(screen.getByTestId("mobile-verdict-approve"));
		expect(onCommit).toHaveBeenCalledWith("approve");
		expect(onPrefill).not.toHaveBeenCalled();
	});

	it("verdictDoubleClick=false commits on first tap", () => {
		const onCommit = vi.fn();
		render(
			<MobileVerdictBar
				pendingVerdict={null}
				verdictDoubleClick={false}
				onPrefill={() => {}}
				onCommit={onCommit}
				onMore={() => {}}
			/>,
		);
		fireEvent.click(screen.getByTestId("mobile-verdict-reject"));
		expect(onCommit).toHaveBeenCalledWith("reject");
	});

	it("pending verdict button shows Confirm <Action> label and aria-pressed", () => {
		render(
			<MobileVerdictBar
				pendingVerdict="reject"
				verdictDoubleClick={true}
				onPrefill={() => {}}
				onCommit={() => {}}
				onMore={() => {}}
			/>,
		);
		const reject = screen.getByTestId("mobile-verdict-reject");
		expect(reject).toHaveTextContent("Confirm Reject");
		expect(reject).toHaveAttribute("aria-pressed", "true");
	});

	it("More button calls onMore", () => {
		const onMore = vi.fn();
		render(
			<MobileVerdictBar
				pendingVerdict={null}
				verdictDoubleClick={true}
				onPrefill={() => {}}
				onCommit={() => {}}
				onMore={onMore}
			/>,
		);
		fireEvent.click(screen.getByTestId("mobile-verdict-more"));
		expect(onMore).toHaveBeenCalled();
	});

	it("every button is min-h-[44px] for AQ-015 tap-target compliance", () => {
		render(
			<MobileVerdictBar
				pendingVerdict={null}
				verdictDoubleClick={true}
				onPrefill={() => {}}
				onCommit={() => {}}
				onMore={() => {}}
			/>,
		);
		for (const id of [
			"mobile-verdict-approve",
			"mobile-verdict-request-changes",
			"mobile-verdict-reject",
			"mobile-verdict-more",
		]) {
			expect(screen.getByTestId(id).className).toMatch(/min-h-\[44px\]/);
		}
	});

	it("primary verdict labels are not truncated (no truncate/ellipsis class on label)", () => {
		render(
			<MobileVerdictBar
				pendingVerdict={null}
				verdictDoubleClick={true}
				onPrefill={() => {}}
				onCommit={() => {}}
				onMore={() => {}}
			/>,
		);
		// L5 spec: labels not truncated.
		const requestChanges = screen.getByTestId("mobile-verdict-request-changes");
		expect(requestChanges.className).toMatch(/whitespace-nowrap/);
		expect(requestChanges.className).not.toMatch(/truncate/);
	});
});
