/**
 * Factory for HarnessAdapter — collapses the three concrete harness classes
 * (BuiltinHarnessAdapter, CliHarnessAdapter, RemoteHarnessAdapter) behind a
 * single discriminated-union createHarnessAdapter factory + two helpers.
 *
 * @lore AU20 Ag4b: Part of the harness-registry surface collapse (79 → ~15
 * exports). Concrete classes are INTERNAL impls; the product is the
 * HarnessAdapter interface + this factory. Callers select the right adapter
 * by spec.kind without importing concrete class names.
 *
 * @lore AU20 Ag4b WsLike: RemoteHarnessAdapter's WsLike interface is private
 * to remote-harness-adapter.ts and cannot be imported here. We redeclare an
 * equivalent private WsLike and cast ws to it — the same WSContext value flows
 * through unchanged (structural equivalence; same strategy as the pre-migration
 * `ws as never` in run-orchestration-bindings.ts).
 */

import type { HarnessAdapter, WorkerRegisterMessage } from "@hyperidle/shared";
import type { BuiltinHarnessOptions } from "./builtin-harness-adapter.js";
import { BuiltinHarnessAdapter } from "./builtin-harness-adapter.js";
import {
	type CliAdapterConfig,
	type CliAdapterDeps,
	type CliAvailabilityDeps,
	CliHarnessAdapter,
} from "./cli-harness-adapter.js";
import { RemoteHarnessAdapter } from "./remote-harness-adapter.js";

// ── HarnessAdapterSpec — discriminated-union factory spec ──────────────────

/**
 * Discriminated-union spec for createHarnessAdapter.
 *
 * | kind      | concrete class              |
 * |-----------|-----------------------------|
 * | "builtin" | BuiltinHarnessAdapter       |
 * | "cli"     | CliHarnessAdapter           |
 *
 * Remote adapters use createRemoteHarnessAdapter (separate factory —
 * they require a live WebSocket, not a static config).
 */
export type HarnessAdapterSpec =
	| { readonly kind: "builtin"; readonly options?: BuiltinHarnessOptions }
	| { readonly kind: "cli"; readonly config: CliAdapterConfig; readonly deps?: CliAdapterDeps };

// ── Factories ──────────────────────────────────────────────────────────────

/**
 * Create a HarnessAdapter from a discriminated spec.
 * Returns the HarnessAdapter interface; the concrete class is hidden.
 */
export function createHarnessAdapter(spec: HarnessAdapterSpec): HarnessAdapter {
	switch (spec.kind) {
		case "builtin":
			return new BuiltinHarnessAdapter(spec.options);
		case "cli":
			return new CliHarnessAdapter(spec.config, spec.deps);
	}
}

/**
 * Minimal WS-like interface expected by RemoteHarnessAdapter.
 * Private to this file — mirrors the same private interface inside
 * remote-harness-adapter.ts. The factory parameter is typed as `unknown`
 * so callers (whose ws is a WSContext) are not forced to import this type.
 */
interface WsLike {
	send(data: string): void;
	close(): void;
	onmessage: ((evt: { data: string }) => void) | null;
	onclose: (() => void) | null;
	onerror: ((err: Error) => void) | null;
}

/**
 * Create a RemoteHarnessAdapter from a WebSocket connection + registration.
 * Returns HarnessAdapter & { dispatchMessage } — the product interface.
 * The concrete RemoteHarnessAdapter class is not exported from the barrel.
 *
 * @param ws - The WebSocket connection (accepted as unknown; WSContext
 *   satisfies WsLike structurally — same cast the pre-migration callers used
 *   as `ws as never`).
 * @param registration - The WorkerRegisterMessage received on WS connect.
 */
export function createRemoteHarnessAdapter(
	ws: unknown,
	registration: WorkerRegisterMessage,
): HarnessAdapter & { dispatchMessage(data: string): void } {
	return new RemoteHarnessAdapter(ws as WsLike, registration);
}

// ── Availability helper ────────────────────────────────────────────────────

/**
 * Check if a CLI harness binary is available on PATH.
 * Replaces the static CliHarnessAdapter.checkAvailability method.
 *
 * @returns true when the binary is found and executable; false otherwise.
 */
export function checkCliHarnessAvailability(
	binary: string,
	deps?: CliAvailabilityDeps,
): Promise<boolean> {
	return CliHarnessAdapter.checkAvailability(binary, deps);
}
