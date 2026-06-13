/**
 * Design-system test setup.
 *
 * Imports jest-dom matchers so component tests in design-system/__tests__/
 * that use @testing-library/react can use toBeInTheDocument(), toHaveAttribute(),
 * etc. alongside the standard vitest assertions.
 *
 * @lore AG4: Added to support Breadcrumb component tests which use
 * @testing-library/react render/screen patterns (consistent with web package).
 * Pre-existing DS tests use createRoot directly and are unaffected by this setup.
 *
 * @lore AG4: Explicit afterEach(cleanup) required with pool:'forks' — the
 * testing-library auto-cleanup hooks into afterEach via globals, but the
 * forks pool may not propagate this correctly. Explicit cleanup is the safe path.
 */
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
});
