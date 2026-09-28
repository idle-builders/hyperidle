/**
 * Design-system test setup.
 *
 * Imports jest-dom matchers so component tests in design-system/__tests__/
 * that use @testing-library/react can use toBeInTheDocument(), toHaveAttribute(),
 * etc. alongside the standard vitest assertions.
 *
 * @lore explicit afterEach(cleanup) required with pool:'forks' — auto-cleanup hooks into afterEach via globals; forks pool may not propagate; explicit is safe
 */
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
});
