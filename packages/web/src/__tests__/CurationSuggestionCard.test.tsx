import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CurationSuggestionCard } from "../components/CurationSuggestionCard";

describe("CurationSuggestionCard (J6)", () => {
	it("renders the action headline and detail", () => {
		render(
			<CurationSuggestionCard
				action="Merge these 3 items?"
				detail="Three items overlap on access-control concerns"
			/>,
		);
		expect(screen.getByText("Merge these 3 items?")).toBeInTheDocument();
		expect(screen.getByText(/overlap on access-control/)).toBeInTheDocument();
	});

	it("renders the Suggest badge as a distinct visual element", () => {
		render(<CurationSuggestionCard action="a" detail="b" />);
		const badge = screen.getByLabelText("Suggestion");
		// Must be a badge-primary so it contrasts with the plain KnowledgeRow layout.
		expect(badge.className).toMatch(/badge-primary/);
	});

	it("is announced as a group labeled 'Curation suggestion'", () => {
		render(<CurationSuggestionCard action="a" detail="b" />);
		expect(screen.getByRole("group", { name: /curation suggestion/i })).toBeInTheDocument();
	});

	it("calls onAccept when Review clicked", async () => {
		const user = userEvent.setup();
		const onAccept = vi.fn();
		render(<CurationSuggestionCard action="a" detail="b" onAccept={onAccept} />);
		await user.click(screen.getByRole("button", { name: /accept suggestion/i }));
		expect(onAccept).toHaveBeenCalledOnce();
	});

	it("calls onDismiss when Dismiss clicked", async () => {
		const user = userEvent.setup();
		const onDismiss = vi.fn();
		render(<CurationSuggestionCard action="a" detail="b" onDismiss={onDismiss} />);
		await user.click(screen.getByRole("button", { name: /dismiss suggestion/i }));
		expect(onDismiss).toHaveBeenCalledOnce();
	});
});
