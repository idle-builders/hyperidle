import { fireEvent, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../components/ErrorBoundary";

/**
 * An `ErrorBoundary` component catches render errors in its children
 * and renders a fallback UI. The spec requires that it wraps `<Outlet />` in
 * AppShell so a page render error does not produce a white screen.
 *
 * @lore RTL's console.error spy silences React's boundary-error logging and our own componentDidCatch log, keeping suite output clean.
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
		const byButton = screen.queryByRole("button", { name: /reload|retry|refresh/i });
		const byLink = screen.queryByRole("link", { name: /reload|retry|refresh/i });
		expect(byButton ?? byLink).toBeInTheDocument();
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

	it("calls componentDidCatch and logs via console.error", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<ThrowsWithMessage msg="unique-catch-signature" />
			</ErrorBoundary>,
		);
		// React itself logs one, our componentDidCatch logs another.
		// We specifically look for our prefix.
		const calls = spy.mock.calls.map((c) => c.join(" "));
		const hasBoundaryLog = calls.some((c) => c.includes("[ErrorBoundary]"));
		expect(hasBoundaryLog).toBe(true);
		spy.mockRestore();
	});

	it("renders a generic message and does not leak error.message", () => {
		// Test env has import.meta.env.DEV=true so dev message shows,
		// but the generic copy MUST still be present. In production the
		// dev message is elided — covered by the next test with MODE stubbing.
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<ThrowsWithMessage msg="secret-token-xyz" />
			</ErrorBoundary>,
		);
		// Generic copy present.
		expect(
			screen.getByText(/an unexpected error occurred. please reload the page\./i),
		).toBeInTheDocument();
		spy.mockRestore();
	});

	it("hides error.message when import.meta.env.DEV is false", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const originalDev = import.meta.env.DEV;
		vi.stubEnv("DEV", false);
		try {
			render(
				<ErrorBoundary>
					<ThrowsWithMessage msg="prod-leaked-secret-xyz" />
				</ErrorBoundary>,
			);
			expect(screen.queryByText(/prod-leaked-secret-xyz/)).not.toBeInTheDocument();
		} finally {
			vi.stubEnv("DEV", originalDev);
			vi.unstubAllEnvs();
			spy.mockRestore();
		}
	});

	it("exposes error.message in dev via a dev-only disclosure", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary>
				<ThrowsWithMessage msg="dev-debug-signature-xyz" />
			</ErrorBoundary>,
		);
		// In DEV the raw message is rendered.
		expect(screen.getByTestId("error-boundary-dev-message")).toHaveTextContent(
			"dev-debug-signature-xyz",
		);
		spy.mockRestore();
	});

	it("invokes the onReload prop when the user clicks the Reload button", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const onReload = vi.fn();
		render(
			<ErrorBoundary onReload={onReload}>
				<Throws />
			</ErrorBoundary>,
		);
		const btn = screen.getByRole("button", { name: /reload/i });
		fireEvent.click(btn);
		expect(onReload).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});
});
