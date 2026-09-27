import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyValue } from "../ds";

// KeyValue's layout variants (inline/stacked) and typography are pure CSS —
// jsdom has no layout engine to observe them, so that contract belongs to a
// real-browser check, not a class-name assertion here.
describe("KeyValue", () => {
	it("renders the label and the value text", () => {
		render(<KeyValue label="Status" value="Active" />);
		expect(screen.getByText("Status")).toBeInTheDocument();
		expect(screen.getByText("Active")).toBeInTheDocument();
	});
});
