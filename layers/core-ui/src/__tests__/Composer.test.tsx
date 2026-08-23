/**
 * L1a — `Composer` rendering + interaction tests.
 *
 * Approved-design: §2.5. Always-rendered plain-message input.
 * `Cmd/Ctrl+Enter` submits.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../ds";

describe("Composer (approved.md §2.5)", () => {
	it("renders a textarea with the 'Reply to thread…' placeholder", () => {
		render(<Composer threadId="t-1" onSubmit={vi.fn()} />);
		const ta = screen.getByPlaceholderText(/reply to thread/i);
		expect(ta).toBeInTheDocument();
		expect(ta.tagName.toLowerCase()).toBe("textarea");
	});

	it("renders a Send button", () => {
		render(<Composer threadId="t-1" onSubmit={vi.fn()} />);
		expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
	});

	it("calls onSubmit with text + a generated clientKey on Send click", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		render(<Composer threadId="t-1" onSubmit={onSubmit} />);
		const ta = screen.getByPlaceholderText(/reply to thread/i);
		await userEvent.type(ta, "hello");
		await userEvent.click(screen.getByRole("button", { name: /send/i }));
		expect(onSubmit).toHaveBeenCalled();
		const call = onSubmit.mock.calls[0]![0] as { text: string; clientKey: string };
		expect(call.text).toBe("hello");
		expect(call.clientKey.length).toBeGreaterThanOrEqual(8);
	});

	it("submits via Cmd+Enter (keyboard convention, not a verb shortcut)", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		render(<Composer threadId="t-1" onSubmit={onSubmit} />);
		const ta = screen.getByPlaceholderText(/reply to thread/i);
		await userEvent.type(ta, "hi");
		await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
		expect(onSubmit).toHaveBeenCalled();
	});

	it("renders the 'Unresolved review · acting required' link when unresolvedReviewLink is provided", () => {
		render(
			<Composer threadId="t-1" onSubmit={vi.fn()} unresolvedReviewLink={{ onClick: vi.fn() }} />,
		);
		expect(screen.getByText(/unresolved review/i)).toBeInTheDocument();
	});

	it("disables the Send button while submitting (no optimistic UI)", async () => {
		// Approved.md §5: NO optimistic UI. Composer disables on submit.
		let resolve: () => void = () => {
			/* noop */
		};
		const onSubmit = vi.fn().mockImplementation(
			() =>
				new Promise<void>((r) => {
					resolve = r;
				}),
		);
		render(<Composer threadId="t-1" onSubmit={onSubmit} />);
		const ta = screen.getByPlaceholderText(/reply to thread/i);
		await userEvent.type(ta, "x");
		const btn = screen.getByRole("button", { name: /send/i });
		await userEvent.click(btn);
		expect(btn).toBeDisabled();
		resolve();
	});
});
