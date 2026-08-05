/**
 * AU21 §9 Increment 12 (Decision H3), Wave D — RED.
 *
 * `SessionEndedEvent` (`../events.js`) does not yet carry the per-model-tier
 * accumulated token counts that `run-orchestration/provisioner.ts`'s
 * `accumulateSessionTokensOnBet` currently reads off its own in-process
 * `accumulatedTokens` variable and writes into `bets.tokensActualJson` via
 * `ports.work.updateBetById` (`provisioner.ts:680`). Wave D moves that
 * writeback into a core-api `session_ended` subscriber — mirroring
 * `costInCents`/`routineRunOutcome`'s additive growth on this SAME event type
 * for routine's own cost-writeback (Increment 4) — so the event itself must
 * carry the token delta for the subscriber to merge, since core-api can no
 * longer read it back out of orchestration's in-memory state.
 *
 * RED via `npm run check` (TS2353 "object literal may only specify known
 * properties" / TS2339 "property does not exist"), NOT via vitest — same
 * pattern as Increment 12 Wave A's
 * `baked-work-intent-context-bundle.integration.test.ts`: the object literal
 * below does not yet type-check against `SessionEndedEvent` until the
 * `tokensByTier` field is added.
 *
 * Shape mirrors `provisioner.ts`'s own `accumulateSessionTokensOnBet`
 * parameter type verbatim: `Partial<Record<string, { prompt: number;
 * completion: number }>>`, keyed by `ModelTier`.
 */

import { describe, expect, test } from "vitest";
import type { SessionEndedEvent } from "../events.js";

describe("SessionEndedEvent tokensByTier payload growth (Increment 12 Wave D)", () => {
	test("SessionEndedEvent accepts an additive tokensByTier field carrying per-tier accumulated token counts", () => {
		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "session:wd-payload-1",
			sessionId: "wd-payload-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
			// NOT YET a field on SessionEndedEvent — this is this file's RED signal.
			tokensByTier: {
				workhorse: { prompt: 120, completion: 340 },
			},
		};

		expect(event.tokensByTier?.workhorse).toEqual({ prompt: 120, completion: 340 });
	});

	test("tokensByTier is optional — a SessionEndedEvent with no token accumulation omits it", () => {
		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "session:wd-payload-2",
			sessionId: "wd-payload-2",
			agentId: "agent-1",
			taskId: null,
			timestamp: Date.now(),
			outcome: "crashed",
		};

		expect(event.tokensByTier).toBeUndefined();
	});
});
