import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerdictGrammarCoach } from "../components/VerdictGrammarCoach";

describe("L10 VerdictGrammarCoach", () => {
	const originalFetch = globalThis.fetch;
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		localStorage.removeItem("hyperidle.coach.seen");
		fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		localStorage.removeItem("hyperidle.coach.seen");
		globalThis.fetch = originalFetch;
	});

	it("auto-opens when autoOpen is true and serverSeen is false", () => {
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		expect(screen.getByTestId("verdict-grammar-coach")).toBeInTheDocument();
	});

	it("does NOT auto-open when serverSeen is true (C3 first-thread-only)", () => {
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={true} />);
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
	});

	it("dismiss POSTs the server-side seen flag", async () => {
		const user = userEvent.setup();
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		await user.click(screen.getByTestId("verdict-grammar-coach-dismiss"));
		await waitFor(() => {
			const calls = fetchSpy.mock.calls.map((call) => String(call[0]));
			expect(calls).toContain("/api/first-run/verdict-coach-seen");
		});
		// Header asserts CSRF parity with other first-run mutations (S3).
		const lastCall = fetchSpy.mock.calls.find((call) =>
			String(call[0]).endsWith("/api/first-run/verdict-coach-seen"),
		);
		expect(lastCall).toBeDefined();
		const init = lastCall?.[1] as RequestInit | undefined;
		expect(init?.method).toBe("POST");
		expect((init?.headers as Record<string, string>)?.["X-Requested-With"]).toBe("hyperidle-web");
	});

	it("does not re-open after dismissal (local belt-and-suspenders)", async () => {
		const user = userEvent.setup();
		const { unmount } = render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		await user.click(screen.getByTestId("verdict-grammar-coach-dismiss"));
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
		unmount();

		// Remount with autoOpen still true — should NOT re-open because we
		// recorded the dismissal in localStorage as a peer signal.
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
	});

	it("re-opens when ? is pressed even after dismissal", async () => {
		const user = userEvent.setup();
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		await user.click(screen.getByTestId("verdict-grammar-coach-dismiss"));
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
		await user.keyboard("?");
		expect(await screen.findByTestId("verdict-grammar-coach")).toBeInTheDocument();
	});

	it("ESC dismisses an open coach (D3)", async () => {
		const user = userEvent.setup();
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		expect(screen.getByTestId("verdict-grammar-coach")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
	});

	it("focuses the dismiss button on open (D3)", () => {
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		expect(screen.getByTestId("verdict-grammar-coach-dismiss")).toHaveFocus();
	});

	it("does NOT capture ? when typing into an input", async () => {
		const user = userEvent.setup();
		render(
			<>
				<input data-testid="other-input" />
				<VerdictGrammarCoach autoOpen={false} serverSeen={false} />
			</>,
		);
		const input = screen.getByTestId("other-input");
		input.focus();
		await user.keyboard("?");
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
	});

	it("renders A R X S keys in the guide", () => {
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		const dialog = screen.getByTestId("verdict-grammar-coach");
		expect(dialog).toHaveTextContent(/Approve/);
		expect(dialog).toHaveTextContent(/Request changes/);
		expect(dialog).toHaveTextContent(/Reject/);
		expect(dialog).toHaveTextContent(/Snooze/);
		const dts = dialog.querySelectorAll("dt");
		expect(Array.from(dts).map((d) => d.textContent)).toEqual(["A", "R", "X", "S"]);
	});

	it("renders as inline status surface, not a centered modal (D2)", () => {
		render(<VerdictGrammarCoach autoOpen={true} serverSeen={false} />);
		const banner = screen.getByTestId("verdict-grammar-coach");
		// Inline-banner pattern: role="status", no aria-modal, no fixed-inset shell.
		expect(banner).toHaveAttribute("role", "status");
		expect(banner).not.toHaveAttribute("aria-modal");
		expect(banner.className).not.toMatch(/fixed/);
		expect(banner.className).not.toMatch(/inset-0/);
	});
});
