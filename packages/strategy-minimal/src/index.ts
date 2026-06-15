/**
 * @hyperidle/strategy-minimal — The minimal reference Strategy.
 *
 * A REAL, documented package — not a test fixture. This is the template a
 * contributor copies to implement the Strategy Port defined in @hyperidle/shared.
 *
 * Usage (in the composition root, e.g. server-factory.ts):
 *
 *   import { minimalStrategy } from "@hyperidle/strategy-minimal";
 *   setActiveStrategy(minimalStrategy);
 *
 * The minimal Strategy is also used in integration tests to exercise the Kernel
 * independently of the Fabric (AC1 of AK2). Under it, a session runs to
 * completion with zero knowledge injection or ingestion work.
 *
 * @see packages/strategy-minimal/src/minimal-strategy.ts for implementation.
 * @see docs/architecture/kernel-strategy-split.md for the port contract.
 */

export { minimalStrategy } from "./minimal-strategy.js";
