/**
 * L9 — ReviewHeader verdictVariants override prop. FileLeaseView and
 * PermissionRequestView supply override labels for the primary verdict
 * buttons without changing the underlying VerdictAction enum.
 * Backwards-compatible: when verdictVariants is absent the toolbar renders
 * the J4 default labels.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewHeader } from "../shell/ReviewHeader";

const proposer = { name: "Agent-Alpha", timestamp: "2h ago" };

describe("L9: ReviewHeader verdictVariants override", () => {
	it("renders default Approve / Request changes / Reject labels when verdictVariants is absent", () => {
		render(
			<ReviewHeader
				proposer={proposer}
				onPrefill={vi.fn()}
				onCommit={vi.fn()}
				pendingVerdict={null}
				verdictDoubleClick={false}
			/>,
		);
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Request changes" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
	});

	it("renders override labels when verdictVariants is provided", () => {
		render(
			<ReviewHeader
				proposer={proposer}
				onPrefill={vi.fn()}
				onCommit={vi.fn()}
				pendingVerdict={null}
				verdictDoubleClick={false}
				verdictVariants={{
					approve: "Grant lease to A",
					requestChanges: "Ask both to coordinate",
					reject: "Grant lease to B",
				}}
			/>,
		);
		expect(screen.getByRole("button", { name: "Grant lease to A" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Ask both to coordinate" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Grant lease to B" })).toBeInTheDocument();
	});

	it("override label still emits the underlying VerdictAction (approve)", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		render(
			<ReviewHeader
				proposer={proposer}
				onPrefill={vi.fn()}
				onCommit={onCommit}
				pendingVerdict={null}
				verdictDoubleClick={false}
				verdictVariants={{
					approve: "Approve once",
					requestChanges: "Raise level",
					reject: "Deny + reason",
				}}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Approve once" }));
		expect(onCommit).toHaveBeenCalledWith("approve");
	});

	it("override label still emits the underlying VerdictAction (request-changes / reject)", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		render(
			<ReviewHeader
				proposer={proposer}
				onPrefill={vi.fn()}
				onCommit={onCommit}
				pendingVerdict={null}
				verdictDoubleClick={false}
				verdictVariants={{
					approve: "Approve once",
					requestChanges: "Raise level",
					reject: "Deny + reason",
				}}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Raise level" }));
		expect(onCommit).toHaveBeenLastCalledWith("request-changes");
		await user.click(screen.getByRole("button", { name: "Deny + reason" }));
		expect(onCommit).toHaveBeenLastCalledWith("reject");
	});
});

describe("L9: ReviewHeader approveDisabled gate", () => {
	it("renders Approve with aria-disabled and the disabled attribute when approveDisabled=true", () => {
		render(
			<ReviewHeader
				proposer={proposer}
				onPrefill={vi.fn()}
				onCommit={vi.fn()}
				pendingVerdict={null}
				verdictDoubleClick={false}
				approveDisabled={true}
				approveDisabledReason="Type 'deploy' to confirm"
			/>,
		);
		const btn = screen.getByRole("button", { name: "Approve" });
		expect(btn).toHaveAttribute("aria-disabled", "true");
		expect(btn).toBeDisabled();
		expect(btn).toHaveAttribute("title", expect.stringContaining("Type 'deploy' to confirm"));
	});

	it("approve click is suppressed when approveDisabled=true (neither prefill nor commit fire)", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		const onPrefill = vi.fn();
		render(
			<ReviewHeader
				proposer={proposer}
				onPrefill={onPrefill}
				onCommit={onCommit}
				pendingVerdict={null}
				verdictDoubleClick={true}
				approveDisabled={true}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Approve" }));
		expect(onCommit).not.toHaveBeenCalled();
		expect(onPrefill).not.toHaveBeenCalled();
	});

	it("approve click fires normally when approveDisabled=false", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		render(
			<ReviewHeader
				proposer={proposer}
				onPrefill={vi.fn()}
				onCommit={onCommit}
				pendingVerdict={null}
				verdictDoubleClick={false}
				approveDisabled={false}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Approve" }));
		expect(onCommit).toHaveBeenCalledWith("approve");
	});

	it("non-approve verdicts are unaffected when approveDisabled=true", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		render(
			<ReviewHeader
				proposer={proposer}
				onPrefill={vi.fn()}
				onCommit={onCommit}
				pendingVerdict={null}
				verdictDoubleClick={false}
				approveDisabled={true}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Reject" }));
		expect(onCommit).toHaveBeenCalledWith("reject");
	});
});
