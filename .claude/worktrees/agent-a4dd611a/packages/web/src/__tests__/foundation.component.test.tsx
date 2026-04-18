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
	it("has data-theme='factory-dark' on html element", () => {
		const htmlPath = resolve(__dirname, "../../index.html");
		const htmlContent = readFileSync(htmlPath, "utf-8");
		expect(htmlContent).toContain('data-theme="factory-dark"');
	});
});
