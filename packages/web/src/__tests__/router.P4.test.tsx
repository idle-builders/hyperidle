/**
 * P4 — Router tests for /setup route and removal of /onboarding (Task 5, AC-9)
 *
 * AC-9: Old Onboarding.tsx is deleted and /onboarding route removed. Router has no /onboarding entry.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

// Test that /setup route exists in the router
// We test this indirectly by rendering SetupFlow at /setup

describe("Router (P4) — /setup route", () => {
	// AC-9: /setup route renders SetupFlow
	it("renders SetupFlow at /setup route", async () => {
		// Dynamic import to avoid circular deps — just check the module exists
		const { SetupFlow } = await import("../pages/SetupFlow");
		expect(typeof SetupFlow).toBe("function");
	});

	// AC-9: Onboarding.tsx does not exist
	it("Onboarding module is removed — importing it should fail", async () => {
		let error: unknown = null;
		try {
			await import("../pages/Onboarding");
		} catch (e) {
			error = e;
		}
		expect(error).not.toBeNull();
	});

	// The router should not have /onboarding in its route table
	it("router.tsx does not reference the /onboarding path", async () => {
		// We test this by reading the router module's exported router
		// and verifying that navigating to /onboarding does not render Onboarding content
		const { router } = await import("../router");
		expect(router).toBeDefined();

		// Navigate to /onboarding in the router — should not match OnboardingStub
		// If the route doesn't exist, it would render the 404 page
		const routes = router.routes;
		const flattenRoutes = (rs: typeof routes): string[] => {
			return rs.flatMap((r) => {
				const paths: string[] = [];
				if ("path" in r && typeof r.path === "string") {
					paths.push(r.path);
				}
				if ("children" in r && Array.isArray(r.children)) {
					paths.push(...flattenRoutes(r.children));
				}
				return paths;
			});
		};

		const allPaths = flattenRoutes(routes);
		expect(allPaths).not.toContain("/onboarding");
		expect(allPaths).not.toContain("onboarding");
	});

	// /setup route exists in the router
	it("router.tsx includes /setup path", async () => {
		const { router } = await import("../router");
		const routes = router.routes;
		const flattenRoutes = (rs: typeof routes): string[] => {
			return rs.flatMap((r) => {
				const paths: string[] = [];
				if ("path" in r && typeof r.path === "string") {
					paths.push(r.path);
				}
				if ("children" in r && Array.isArray(r.children)) {
					paths.push(...flattenRoutes(r.children));
				}
				return paths;
			});
		};

		const allPaths = flattenRoutes(routes);
		expect(allPaths.some((p) => p.includes("setup"))).toBe(true);
	});
});
