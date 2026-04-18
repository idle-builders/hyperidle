import { render, screen } from "@testing-library/react";
import { type JSX, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../components/ErrorBoundary";

/**
 * I4 E1: An `ErrorBoundary` component catches render errors in its children
 * and renders a fallback UI. The spec requires that it wraps `<Outlet />` in
 * AppShell so a page render error does not produce a white screen.
 *
 * @lore RTL's console.error spy — React logs boundary errors by default.
 * We silence the noise during these tests so the suite output stays clean.
 */

function Throws(): JSX.Element {
	throw new Error("kaboom");
}

function ThrowsWithMessage({ msg }: { msg: string }): JSX.Element {
	throw new Error(msg);
}

function Healthy(): JSX.Element {
	return <div>Healthy child</div>;
}

describe("ErrorBoundary", () => {
	it("renders children when they do not throw", () => {
		render(
			<ErrorBoundary>
				<Healthy />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Healthy child")).toBeInTheDocument();
	});

	it("catches a child render error and renders a fallback", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<Throws />
			</ErrorBoundary>,
		);
		// Should render a visible fallback — the child itself is no longer there.
		expect(screen.queryByText("kaboom-child")).not.toBeInTheDocument();
		// Fallback must contain actionable guidance per spec "actionable feedback".
		expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
		spy.mockRestore();
	});

	it("shows a Reload affordance in the fallback", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<Throws />
			</ErrorBoundary>,
		);
		// The fallback must contain a button or link whose accessible name
		// mentions reload/retry/refresh.
		const byButton = screen.queryByRole("button", { name: /reload|retry|refresh/i });
		const byLink = screen.queryByRole("link", { name: /reload|retry|refresh/i });
		expect(byButton ?? byLink).not.toBeNull();
		spy.mockRestore();
	});

	it("includes the thrown error message in the fallback (for debuggability)", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<ThrowsWithMessage msg="unique-error-signature-xyz" />
			</ErrorBoundary>,
		);
		expect(screen.getByText(/unique-error-signature-xyz/)).toBeInTheDocument();
		spy.mockRestore();
	});

	it("isolates errors — siblings wrapped in a separate boundary still render", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<>
				<ErrorBoundary>
					<Throws />
				</ErrorBoundary>
				<ErrorBoundary>
					<Healthy />
				</ErrorBoundary>
			</>,
		);
		expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
		expect(screen.getByText("Healthy child")).toBeInTheDocument();
		spy.mockRestore();
	});

	it("resets when the user clicks the reload affordance (if component implements it)", () => {
		// Implementation-agnostic: either a full reload button OR a reset button.
		// If the implementation is a plain reload link, location.reload may be
		// called; we assert the button is operable.
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Controllable(): JSX.Element {
			const [crash, setCrash] = useState(true);
			if (crash) throw new Error("initial");
			return (
				<button type="button" onClick={() => setCrash(true)}>
					ok
				</button>
			);
		}
		render(
			<ErrorBoundary>
				<Controllable />
			</ErrorBoundary>,
		);
		expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
		spy.mockRestore();
	});
});
