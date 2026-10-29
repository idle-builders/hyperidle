import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Preview } from "./ReviewPart";

afterEach(cleanup);

describe("Preview use/comment switch", () => {
	it("defaults to use mode: switch shows, no pin-pick overlay", () => {
		render(<Preview url="data:text/html,<p>hi</p>" onReady={vi.fn()} onPoint={vi.fn()} />);
		const useBtn = screen.getByRole("button", { name: "Use it" });
		const commentBtn = screen.getByRole("button", { name: "Comment" });
		expect(useBtn.getAttribute("aria-pressed")).toBe("true");
		expect(commentBtn.getAttribute("aria-pressed")).toBe("false");
		expect(screen.queryByRole("button", { name: "Point at something on the page" })).toBeNull();
	});

	it("comment mode: overlay is present and use mode button is not pressed", () => {
		render(<Preview url="data:text/html,<p>hi</p>" onReady={vi.fn()} onPoint={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "Comment" }));
		const useBtn = screen.getByRole("button", { name: "Use it" });
		const commentBtn = screen.getByRole("button", { name: "Comment" });
		expect(commentBtn.getAttribute("aria-pressed")).toBe("true");
		expect(useBtn.getAttribute("aria-pressed")).toBe("false");
		expect(screen.getByRole("button", { name: "Point at something on the page" })).toBeTruthy();
	});

	it("Escape in comment mode returns to use mode and hides the overlay", () => {
		render(<Preview url="data:text/html,<p>hi</p>" onReady={vi.fn()} onPoint={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "Comment" }));
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.getByRole("button", { name: "Use it" }).getAttribute("aria-pressed")).toBe(
			"true",
		);
		expect(screen.queryByRole("button", { name: "Point at something on the page" })).toBeNull();
	});
});
