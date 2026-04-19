/**
 * J8 — empty state path on the Conversations/Chat page.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversationsChat } from "../pages/ConversationsChat";

describe("ConversationsChat — J8 empty state", () => {
	it("renders an empty state when no threads are supplied", () => {
		render(<ConversationsChat threads={[]} />);
		expect(screen.getByTestId("conversations-empty")).toBeInTheDocument();
		expect(screen.getByText(/no threads yet/i)).toBeInTheDocument();
		expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
	});
});
