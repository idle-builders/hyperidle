import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VerdictGrammarCoach } from "../components/VerdictGrammarCoach";

describe("L10 VerdictGrammarCoach", () => {
	beforeEach(() => {
		localStorage.removeItem("hyperidle.coach.seen");
	});

	afterEach(() => {
		localStorage.removeItem("hyperidle.coach.seen");
	});

	it("auto-opens when autoOpen is true and not yet seen", () => {
		render(<VerdictGrammarCoach autoOpen={true} />);
		expect(screen.getByTestId("verdict-grammar-coach")).toBeInTheDocument();
	});

	it("does not re-open after dismissal", async () => {
		const user = userEvent.setup();
		const { unmount } = render(<VerdictGrammarCoach autoOpen={true} />);
		await user.click(screen.getByTestId("verdict-grammar-coach-dismiss"));
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
		unmount();

		// Remount with autoOpen still true — should NOT re-open because we
		// recorded the dismissal in localStorage.
		render(<VerdictGrammarCoach autoOpen={true} />);
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
	});

	it("re-opens when ? is pressed even after dismissal", async () => {
		const user = userEvent.setup();
		render(<VerdictGrammarCoach autoOpen={true} />);
		await user.click(screen.getByTestId("verdict-grammar-coach-dismiss"));
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
		await user.keyboard("?");
		expect(await screen.findByTestId("verdict-grammar-coach")).toBeInTheDocument();
	});

	it("does NOT capture ? when typing into an input", async () => {
		const user = userEvent.setup();
		render(
			<>
				<input data-testid="other-input" />
				<VerdictGrammarCoach autoOpen={false} />
			</>,
		);
		const input = screen.getByTestId("other-input");
		input.focus();
		await user.keyboard("?");
		expect(screen.queryByTestId("verdict-grammar-coach")).not.toBeInTheDocument();
	});

	it("renders A R X S keys in the guide", () => {
		render(<VerdictGrammarCoach autoOpen={true} />);
		const dialog = screen.getByTestId("verdict-grammar-coach");
		expect(dialog).toHaveTextContent(/Approve/);
		expect(dialog).toHaveTextContent(/Request changes/);
		expect(dialog).toHaveTextContent(/Reject/);
		expect(dialog).toHaveTextContent(/Snooze/);
		// Each key letter sits in its own <dt> — assert via DOM lookup.
		const dts = dialog.querySelectorAll("dt");
		expect(Array.from(dts).map((d) => d.textContent)).toEqual(["A", "R", "X", "S"]);
	});
});
