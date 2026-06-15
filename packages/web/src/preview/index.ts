/**
 * AJ3 — isolation harness entry point.
 *
 * The `/design` skill points page-fed variant stories here: a story that
 * needs routing / context wraps its render in `<MockProviders>` instead of
 * declaring a local ad-hoc wrapper. The viewer discovers it unchanged.
 */

export { MockProviders, type MockProvidersProps } from "./MockProviders";
