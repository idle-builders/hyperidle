import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("DaisyUI button component", () => {
	it("renders a button with btn-primary class", () => {
		render(
			<button type="button" className="btn btn-primary">
				Test
			</button>,
		);
		const button = screen.getByRole("button", { name: "Test" });
		expect(button).toBeInTheDocument();
		expect(button).toHaveClass("btn", "btn-primary");
	});

	it("button is focusable", () => {
		render(
			<button type="button" className="btn btn-primary">
				Focus Me
			</button>,
		);
		const button = screen.getByRole("button", { name: "Focus Me" });
		button.focus();
		expect(button).toHaveFocus();
	});
});

describe("index.html configuration", () => {
	// K3: data-theme is no longer hardcoded on <html> — the boot script sets
	// it synchronously based on localStorage["hyperidle-theme"] (default
	// "system") and matchMedia(prefers-color-scheme) before React mounts.
	it("contains the K3 theme-persistence boot script", () => {
		const htmlPath = resolve(__dirname, "../../index.html");
		const htmlContent = readFileSync(htmlPath, "utf-8");
		expect(htmlContent).toContain("hyperidle-theme");
		expect(htmlContent).toContain("prefers-color-scheme: dark");
		expect(htmlContent).toMatch(/setAttribute\(\s*"data-theme"/);
	});
});
