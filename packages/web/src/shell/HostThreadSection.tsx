/**
 * HostThreadSection — L18 shared thread surface for bet, task, knowledge, artifact hosts.
 *
 * This is the single convergence point for all four detail surfaces.
 * Calls useHostThread(hostKind, hostId) and renders the thread.
 *
 * @lore L18: The prefill prop is set when the user selects "Discuss" from a
 * block's actions popover. The chip indicator above the composer shows the
 * block excerpt and includes blockId in postPlainHostMessage payload.
 *
 * @lore L18: inline=true is used by TaskSheet — no section wrapper, no heading.
 * All four detail pages mount this once each.
 */

import type { HostKind } from "@hyperidle/shared";
import type { JSX } from "react";

export interface HostThreadSectionProps {
	hostKind: HostKind;
	hostId: string;
	/** Section header text. Defaults to "Discussion". */
	title?: string;
	/** When true (TaskSheet), no <section> wrapper, no header chrome. */
	inline?: boolean;
	/** Set when a block-anchored discussion is initiated from the host surface. */
	prefill?: { blockId: string; blockExcerpt: string };
}

/**
 * @lore L18 stub: the implementation renders in Phase B. This stub exists so
 * tests can import the module and the TypeScript project compiles.
 *
 * NOTE: This is NOT the final implementation. See plans/L18/architecture.md.
 */
export function HostThreadSection({
	hostKind: _hostKind,
	hostId: _hostId,
	title: _title = "Discussion",
	inline: _inline = false,
	prefill: _prefill,
}: HostThreadSectionProps): JSX.Element {
	// @lore L18: stub — implementation lands in Phase B (write-code).
	// The stub is intentionally minimal: it renders nothing useful so tests
	// that assert the real behavior (messages, composer, prefill chip) fail.
	return <div data-testid="host-thread-section-stub" />;
}
