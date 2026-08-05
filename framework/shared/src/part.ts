/**
 * AM1 — Part vocabulary + source adapters.
 *
 * A `Part` is the typed rendering unit of a conversation. Parts are DERIVED
 * from a source (Message[] today; session events tomorrow — AM3) and NEVER
 * stored. The renderer (`layers/web/src/components/PartList.tsx`) imports
 * ONLY this module's `Part`/`Embed`/`OpenTarget` vocabulary — never a source
 * type (`Message`/`InlineRef`/`HarnessEvent`). That import-absence is the
 * AM1↔AM3 reuse boundary, enforced by a scoped `no-restricted-imports` ESLint
 * rule (W1). The adapters below are the ONLY place that knows the source.
 *
 * @lore AM1: `prose` (the render kind) is deliberately decoupled from `plain`
 * (the Message type). A session event (AM3) that renders as a text body is
 * also a `prose` Part — it is not a `plain` Message. Keeping the names
 * distinct is what makes the renderer source-agnostic (concept hard-rule 4).
 *
 * @lore AM1 C1: a block/entity routes to its HOST surface via the `host`
 * OpenTarget — total over `BlockHostKind` (the page resolves it through the
 * existing `resolveHostRoute`). No fabricated `knowledgeId`, no unhandled host.
 *
 * @lore AM1 W5: `EntityRef.kind === "message"` has no permalink route and is
 * excluded from `BlockHostKind` → it collapses to the `unknown` Embed
 * (label-only, no target). The adapter dispatch over `EntityRef.kind` is
 * exhaustive across all 5 members via `exhaustiveAssert`.
 */

import type { BlockHostKind } from "./blocks/types.js";
// AM3: session-activity type (NORMALIZED union — no harness-type param in adapter).
import type { ActivityEntry } from "./session-activity.js";
// The adapter body (and ONLY the adapter body) imports the source types.
import type { ArtifactRef, EntityRef, InlineRef, Message, VerdictPayload } from "./thread.js";
import { exhaustiveAssert, isRedactedPayload, verdictDecisionLabel } from "./thread.js";

// ── Part discriminant (closed, derived, never stored) ───────────────

/**
 * AM3: Extended with `tool` + `reasoning` (concept Phase 4, locked).
 * Stays closed + exhaustive + `unknown`-terminated. Adding a kind requires
 * a concept-doc update first (AM3 concept.md IS that update for these two).
 */
export const PART_KINDS = [
	"prose",
	"review",
	"resolved",
	"questionnaire",
	"tool",
	"reasoning",
	"unknown",
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/**
 * AM3: Closed tool-family set — icon/verb/expanded-shape per family.
 * An unrecognized family falls back to "generic" (mirrors `unknown` Part discipline).
 *
 * @lore AM3: `generic` is the explicit fallback entry — never throw on an unknown
 * family; the closed set lives here so callers can dispatch without guessing.
 */
export const TOOL_KINDS = [
	"command",
	"file-read", // "read" alias
	"read",
	"file-change", // "edit" alias
	"edit",
	"search",
	"web-search",
	"mcp",
	"sub-agent",
	"create",
	"generic",
] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

/** A Part's identity derives from its source — no new opaque id minted. */
export type PartId = string;

export interface PartAuthor {
	readonly id: string;
	readonly name: string;
	readonly isAgent: boolean;
	/** Renderer-local: "is this the viewer" — set by the adapter, not stored. */
	readonly isMe: boolean;
}

interface BasePart {
	readonly id: PartId;
	readonly kind: PartKind;
	readonly author: PartAuthor;
	readonly createdAt: string;
	/** Zero-or-more Embeds the Part hosts (concept: Part → 0..n Embeds). */
	readonly embeds: ReadonlyArray<Embed>;
}

/** Opaque routing target the review hook resolves (betId/reviewId pair). */
export interface ReviewTarget {
	readonly betId: string;
	readonly reviewId: string;
}

export interface FoldDescriptor {
	readonly label?: string;
	readonly cta: string;
	readonly target: OpenTarget;
}

export type Part =
	| (BasePart & { readonly kind: "prose"; readonly text: string })
	| (BasePart & {
			readonly kind: "review";
			readonly title: string;
			readonly changeSet: Embed | null;
			readonly reviewTarget: ReviewTarget;
	  })
	| (BasePart & {
			readonly kind: "resolved";
			readonly label: string;
			readonly resolvedBy: string;
			readonly summary: string;
			readonly reviewTarget: ReviewTarget;
	  })
	| (BasePart & {
			readonly kind: "questionnaire";
			readonly question: string;
			readonly options: ReadonlyArray<string>;
	  })
	/**
	 * AM3: `tool` — one tool call the agent made. A compact row, not prose.
	 * Only `failed` uses the destructive color token (`--status-error`).
	 * A file-change carries a `diff` Embed (via `embeds`); sub-agent carries `opensSession`.
	 * Parts derived-never-stored; status transitions (running→ok/failed) are derived updates.
	 */
	| (BasePart & {
			readonly kind: "tool";
			/** Human-readable action label ("Run command", "Edit", "View", …). */
			readonly verb: string;
			/** Muted truncated preview — suppressed when absent. */
			readonly target?: string;
			/** Closed family set with a generic fallback. */
			readonly toolKind: ToolKind;
			/** running | ok | failed | neutral */
			readonly status: "running" | "ok" | "failed" | "neutral";
			/** Collapsed mono body; absent until expanded. */
			readonly output?: string;
			/** Sub-agent recursion: opens its own nested session view. */
			readonly opensSession?: { readonly sessionId: string; readonly label: string };
	  })
	/**
	 * AM3: `reasoning` — a span of agent thinking, collapsed "Thought for Ns".
	 * No status glyph (reasoning is never success/failure).
	 */
	| (BasePart & {
			readonly kind: "reasoning";
			/** Elapsed thinking time (ms) → "Thought for Ns" resting label. */
			readonly durationMs: number;
			/** The reasoning body, shown on expand — quieter than answer prose. */
			readonly text: string;
	  })
	| (BasePart & {
			readonly kind: "unknown";
			readonly reason: "wire-unrecognised-type" | "redacted";
	  });

// ── Embed discriminant (closed target-kind set) ─────────────────────

export const EMBED_KINDS = [
	"artifact",
	"block",
	"diff",
	"session-reference",
	"entity-ref",
	"mention",
	"unknown",
] as const;
export type EmbedKind = (typeof EMBED_KINDS)[number];

export type Embed =
	| {
			readonly kind: "artifact";
			readonly label: string;
			readonly meta?: string;
			readonly target: OpenTarget;
	  }
	| { readonly kind: "block"; readonly title: string; readonly target: OpenTarget }
	| {
			readonly kind: "diff";
			readonly label: string;
			readonly meta: string;
			readonly target: OpenTarget;
	  }
	| { readonly kind: "session-reference"; readonly sessionId: string; readonly summary?: string }
	| {
			readonly kind: "entity-ref";
			readonly entityKind: Exclude<EntityRef["kind"], "message">;
			readonly id: string;
			readonly label: string;
			readonly target: OpenTarget;
	  }
	| { readonly kind: "mention"; readonly identityId: string; readonly displayName: string }
	| { readonly kind: "unknown"; readonly label: string };

// ── OpenTarget — the routing seam (no router in the renderer) ────────

export type OpenTarget =
	| {
			readonly route: "host";
			readonly hostKind: BlockHostKind;
			readonly hostId: string;
			/** @lore AM5 T8: optional block anchor. open-handler appends #block-<encodeURIComponent(blockId)>
			 *  to the resolved path; KnowledgeDetail scrolls to the matching data-block-id element.
			 *  Security: blockId is matched by value comparison against known block ids, never
			 *  concatenated into a querySelector (selector-injection mitigation). */
			readonly blockId?: string;
	  }
	| { readonly route: "artifact"; readonly artifactId: string }
	| { readonly route: "review"; readonly betId: string; readonly reviewId: string }
	| { readonly route: "session"; readonly sessionId: string };

/** The single open-hook the renderer calls. Page binds to navigate(); story to console.info. */
export type OpenHandler = (target: OpenTarget) => void;

// ── Author grouping (source-agnostic; mirrors computeSenderGrouping) ─

/** A run of consecutive same-author Parts within the time window. */
export interface PartGroup {
	readonly author: PartAuthor;
	readonly parts: ReadonlyArray<Part>;
}

/** Author-grouping window — same as ThreadShell's 5-minute sender grouping. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Group consecutive same-author Parts within `GROUP_WINDOW_MS`. Pure;
 * source-agnostic (groups by `author.id` + time, never by `Message`).
 */
export function groupParts(parts: ReadonlyArray<Part>): ReadonlyArray<PartGroup> {
	const groups: PartGroup[] = [];
	let current: { author: PartAuthor; parts: Part[] } | null = null;
	let lastTime = 0;
	for (const part of parts) {
		const time = Date.parse(part.createdAt);
		const sameAuthor = current !== null && current.author.id === part.author.id;
		const withinWindow = Number.isFinite(time) && time - lastTime <= GROUP_WINDOW_MS;
		if (current !== null && sameAuthor && withinWindow) {
			current.parts.push(part);
		} else {
			current = { author: part.author, parts: [part] };
			groups.push(current);
		}
		lastTime = time;
	}
	return groups;
}

// ── Message → Part adapter (the ONLY place that knows Message) ───────

function resolveAuthor(
	senderId: string,
	viewerId: string,
	identities: ReadonlyArray<PartAuthor>,
): PartAuthor {
	const found = identities.find((i) => i.id === senderId);
	if (found !== undefined) {
		return { ...found, isMe: found.id === viewerId };
	}
	// Unknown sender — render quietly with the id as the name.
	return { id: senderId, name: senderId, isAgent: false, isMe: senderId === viewerId };
}

/** Map an ArtifactRef to an artifact/diff Embed (text_diff → diff). */
function artifactRefToEmbed(ref: ArtifactRef): Embed {
	const target: OpenTarget = { route: "artifact", artifactId: ref.id };
	if (ref.kind === "text_diff") {
		return { kind: "diff", label: ref.id, meta: "", target };
	}
	return { kind: "artifact", label: ref.id, target };
}

/** Map one InlineRef to one Embed. Exhaustive over all InlineRef kinds. */
function inlineRefToEmbed(ref: InlineRef): Embed {
	if (ref.kind === "block") {
		return {
			kind: "block",
			title: ref.blockId,
			// @lore AM5 T8: thread blockId so the open-handler can append #block-<id>
			target: { route: "host", hostKind: ref.hostKind, hostId: ref.hostId, blockId: ref.blockId },
		};
	}
	if (ref.kind === "mention") {
		return { kind: "mention", identityId: ref.identityId, displayName: ref.displayName };
	}
	// EntityRef — exhaustive over all 5 EntityRef.kind members (W5).
	switch (ref.kind) {
		case "artifact":
			return { kind: "artifact", label: ref.id, target: { route: "artifact", artifactId: ref.id } };
		case "knowledge_item":
		case "task":
		case "bet":
			return {
				kind: "entity-ref",
				entityKind: ref.kind,
				id: ref.id,
				label: ref.id,
				target: { route: "host", hostKind: ref.kind, hostId: ref.id },
			};
		case "message":
			// W5: no permalink route exists for a message ref → quiet, non-navigating.
			return { kind: "unknown", label: ref.id };
		default:
			return exhaustiveAssert(ref);
	}
}

function refsToEmbeds(refs: ReadonlyArray<InlineRef> | undefined): ReadonlyArray<Embed> {
	if (refs === undefined) return [];
	return refs.map(inlineRefToEmbed);
}

/**
 * Map Message[] → Part[]. The ONLY adapter that knows `Message`. A verdict
 * message is NOT its own Part — it echoes onto the `resolved` Part of the
 * message it resolves (`resolvesMessageId`). Session activity NEVER becomes a
 * Part (concept hard-rule 3) — a session is an Embed only.
 */
export function derivePartsFromMessages(
	messages: ReadonlyArray<Message>,
	viewerId: string,
	identities: ReadonlyArray<PartAuthor>,
): Part[] {
	// First pass: index verdicts by the message they resolve. Keep the resolving
	// verdict's `senderId` (the person who took the decision) alongside its payload
	// so the resolved Part can attribute the verdict to a PERSON, not a message id.
	const verdicts = new Map<string, { payload: VerdictPayload; resolverId: string }>();
	for (const m of messages) {
		if (m.type === "verdict" && !isRedactedPayload(m.payload)) {
			verdicts.set(m.payload.resolvesMessageId, { payload: m.payload, resolverId: m.senderId });
		}
	}

	const parts: Part[] = [];
	for (const message of messages) {
		// A verdict produces no standalone Part — it folds onto its target.
		if (message.type === "verdict") continue;

		const author = resolveAuthor(message.senderId, viewerId, identities);
		const base = { id: message.id, author, createdAt: message.createdAt, embeds: [] as Embed[] };

		// Redacted payload → quiet unknown Part.
		if (isRedactedPayload(message.payload)) {
			parts.push({ ...base, kind: "unknown", reason: "redacted" });
			continue;
		}

		switch (message.type) {
			case "plain": {
				parts.push({
					...base,
					kind: "prose",
					text: message.payload.text,
					embeds: refsToEmbeds(message.payload.refs),
				});
				break;
			}
			case "review": {
				const verdict = verdicts.get(message.id);
				const reviewTarget: ReviewTarget = { betId: "", reviewId: message.id };
				if (verdict !== undefined || message.resolvedAt !== null) {
					parts.push({
						...base,
						kind: "resolved",
						label: verdict ? verdictDecisionLabel(verdict.payload.decision) : "RESOLVED",
						// The PERSON who took the verdict (resolver), not a message id. Falls
						// back to the review author when no verdict message is present.
						resolvedBy: verdict
							? resolveAuthor(verdict.resolverId, viewerId, identities).name
							: author.name,
						summary: message.payload.title,
						reviewTarget,
					});
				} else {
					parts.push({
						...base,
						kind: "review",
						title: message.payload.title,
						changeSet: artifactRefToEmbed(message.payload.artifactRef),
						reviewTarget,
					});
				}
				break;
			}
			case "questionnaire": {
				const verdict = verdicts.get(message.id);
				if (verdict !== undefined || message.resolvedAt !== null) {
					parts.push({
						...base,
						kind: "resolved",
						label: verdict ? verdictDecisionLabel(verdict.payload.decision) : "RESOLVED",
						resolvedBy: verdict
							? resolveAuthor(verdict.resolverId, viewerId, identities).name
							: author.name,
						summary: message.payload.question,
						reviewTarget: { betId: "", reviewId: message.id },
					});
				} else {
					parts.push({
						...base,
						kind: "questionnaire",
						question: message.payload.question,
						options: message.payload.options,
					});
				}
				break;
			}
			default: {
				// A row deserialized from the wire with a `type` outside MESSAGE_TYPES
				// (forward-compat / staged rollout) lands here — render quietly (N3).
				parts.push({ ...base, kind: "unknown", reason: "wire-unrecognised-type" });
				break;
			}
		}
	}
	return parts;
}

// ── Session ActivityEntry → Part adapter ─────────────────────────────

/**
 * Normalize a toolKind string to the closed ToolKind family set.
 * An unrecognized family → "generic" (never throw — mirrors `unknown` Part).
 *
 * @lore AM3: "read" and "file-read" are the same family; "edit" and "file-change"
 * similarly. We normalize both aliases to their canonical form here so the
 * renderer only dispatches on a consistent set.
 */
function normalizeToolKind(raw: string | undefined): ToolKind {
	if (raw === undefined || raw === "") return "generic";
	if ((TOOL_KINDS as ReadonlyArray<string>).includes(raw)) return raw as ToolKind;
	return "generic";
}

/**
 * Derive an `OpenTarget` for a file-diff Embed. The `target` routes to an
 * artifact surface; `meta` carries the `+N/−M` stat for the diff chip.
 *
 * @lore AM3: We use the diff label as the artifactId placeholder. In production
 * the session adapter will receive a real artifactId from the harness event;
 * for now the label (file path) serves as a stable handle the diff surface
 * resolves. Hard-rule: one diff renderer (`ReviewCodeDiff`) — never a new one.
 */
function diffEmbed(label: string, added: number, removed: number): Embed {
	return {
		kind: "diff",
		label,
		meta: `+${added}/−${removed}`,
		target: { route: "artifact", artifactId: label },
	};
}

/**
 * AM3: Map normalized `ActivityEntry[]` → `Part[]`.
 *
 * This is the ONLY place that knows `ActivityEntry`; the renderer (`PartList`)
 * imports only the `Part`/`Embed`/`OpenHandler` vocabulary — never `ActivityEntry`
 * or any harness type. Signature takes `ActivityEntry[]` only — NO harness-type
 * parameter (compile-time proof the renderer can't branch on backend, AC4).
 *
 * Mapping rules (architecture.md §b):
 *  - `tool_call`    → `tool` Part (verb/target/toolKind/status/output; file-change carries `diff` Embed)
 *  - `reasoning`    → `reasoning` Part (durationMs + text)
 *  - `answer_delta` → `prose` Part whose text grows (append; consecutive deltas merge)
 *  - `answer_settled`→ `prose` Part (final text)
 *  - `human_message`→ `prose` Part authored by the human (self/other pattern handles alignment)
 *
 * Exhaustive over `ActivityEntry["type"]` via the default branch with a lore note.
 *
 * @lore AM1 AC5: this is the executable half of the source-agnostic boundary.
 * Two adapters, one renderer, zero renderer change.
 * @lore AM3: Parts are derived-never-stored. Streaming prose Parts grow by
 * consecutive `answer_delta` entries being merged into one `prose` Part (the
 * Part's text is the concatenation). The Part's id derives from the FIRST delta's
 * timestamp to maintain stable identity across appends.
 */
export function derivePartsFromSession(
	entries: ReadonlyArray<ActivityEntry>,
	agent: PartAuthor,
): Part[] {
	const parts: Part[] = [];
	// Track the current in-progress prose Part for streaming merge.
	let streamingProse: { id: string; text: string; createdAt: string } | null = null;

	const flushStreaming = (): void => {
		if (streamingProse === null) return;
		parts.push({
			id: streamingProse.id,
			kind: "prose",
			author: agent,
			createdAt: streamingProse.createdAt,
			embeds: [],
			text: streamingProse.text,
		});
		streamingProse = null;
	};

	let seq = 0;
	for (const entry of entries) {
		const id = `sess-${entry.timestamp}-${seq++}`;
		const createdAt = new Date(entry.timestamp).toISOString();

		switch (entry.type) {
			case "tool_call": {
				// Flush any in-progress streaming prose before a new tool row
				flushStreaming();

				const d = entry.data;
				const toolKind = normalizeToolKind(d.toolKind);
				const embeds: Embed[] = [];

				// A file-change tool call carries a diff Embed (diffs never lost to folding)
				if (d.diff) {
					embeds.push(diffEmbed(d.diff.label, d.diff.added, d.diff.removed));
				}

				const toolPart: Part = {
					id,
					kind: "tool",
					author: agent,
					createdAt,
					embeds,
					verb: d.verb ?? d.toolName ?? "Tool call",
					target: d.target ?? (d.argsSummary !== "" ? d.argsSummary : undefined),
					toolKind,
					// Default to "neutral" when status is absent (Q1 buffer compat)
					status: d.status ?? "neutral",
					output: d.output,
					...(d.opensSession ? { opensSession: d.opensSession } : {}),
				};
				parts.push(toolPart);
				break;
			}

			case "reasoning": {
				flushStreaming();
				const d = entry.data;
				// Support both the new (durationMs+text) and legacy (excerpt) shapes
				const durationMs = d.durationMs ?? 0;
				const text = d.text ?? d.excerpt ?? "";
				parts.push({
					id,
					kind: "reasoning",
					author: agent,
					createdAt,
					embeds: [],
					durationMs,
					text,
				});
				break;
			}

			case "answer_delta": {
				// Append to current streaming prose Part (or start one)
				if (streamingProse === null) {
					streamingProse = { id, text: entry.data.text, createdAt };
				} else {
					streamingProse.text += entry.data.text;
				}
				break;
			}

			case "answer_settled": {
				// A settled answer closes any open streaming prose (with the final text)
				if (streamingProse !== null) {
					// Replace the accumulated streaming text with the definitive settled text
					streamingProse.text = entry.data.text;
					flushStreaming();
				} else {
					// Settled answer without preceding deltas (loaded from history)
					parts.push({
						id,
						kind: "prose",
						author: agent,
						createdAt,
						embeds: [],
						text: entry.data.text,
					});
				}
				break;
			}

			case "human_message": {
				flushStreaming();
				const d = entry.data;
				const humanAuthor: PartAuthor = {
					id: d.author.id,
					name: d.author.name,
					isAgent: false,
					isMe: d.author.isMe,
				};
				parts.push({
					id,
					kind: "prose",
					author: humanAuthor,
					createdAt,
					embeds: [],
					text: d.text,
				});
				break;
			}

			default: {
				// Forward-compat: a future ActivityEntry type lands here quietly.
				// @lore AM3: exhaustiveAssert would throw in strict TypeScript but
				// we must not throw at runtime (unknown future types degrade quietly).
				// The default branch is correct here (not `assertNeverPart`).
				break;
			}
		}
	}

	// Flush any trailing streaming prose
	flushStreaming();

	return parts;
}

// ── Tool-run aggregation grouping (architecture §c) ──────────────────

/**
 * A stream block — either a single (non-tool or standalone-running-tool) or
 * a tool-run aggregate (all completed tool calls within the agent turn).
 *
 * @lore AM3: Aggregation is a RENDERER grouping beside `groupParts` — NOT a
 * Part kind. Keeping it out of the union keeps the union small and exhaustive.
 * `ToolRunBlock` lives here (adapter layer) so the renderer can import one shape.
 */
export type ToolRunBlock =
	| { readonly kind: "single"; readonly part: Part }
	| {
			readonly kind: "tool-run";
			readonly tools: ReadonlyArray<Extract<Part, { kind: "tool" }>>;
			/** How many tools in the aggregate have status=failed (for the header signal). */
			readonly failedCount: number;
	  };

/**
 * THE AGGREGATION RULE (architecture §c, concept Phase 4, founder review round 5):
 *  - ALL COMPLETED tool calls fold into the turn's aggregate expander — INCLUDING failed ones.
 *  - The ONLY tool that renders STANDALONE is the currently-RUNNING one.
 *  - `aggregateAt` = 2: two consecutive completed calls already fold.
 *
 * @lore AM3: "diffs never lost" — the diff Embed stays on the tool Part inside
 * the aggregate; the Changed files panel always surfaces them regardless of fold.
 */
export function aggregateToolRun(
	toolParts: ReadonlyArray<Extract<Part, { kind: "tool" }>>,
	aggregateAt = 2,
): ToolRunBlock[] {
	const blocks: ToolRunBlock[] = [];
	let completedRun: Array<Extract<Part, { kind: "tool" }>> = [];

	const flushRun = (): void => {
		if (completedRun.length === 0) return;
		if (completedRun.length >= aggregateAt) {
			const failedCount = completedRun.filter((t) => t.status === "failed").length;
			blocks.push({ kind: "tool-run", tools: completedRun, failedCount });
		} else {
			for (const t of completedRun) blocks.push({ kind: "single", part: t });
		}
		completedRun = [];
	};

	for (const tool of toolParts) {
		if (tool.status === "running") {
			// Running tool is the ONLY standalone tool; flush any preceding completed run
			flushRun();
			blocks.push({ kind: "single", part: tool });
		} else {
			// Completed (ok | failed | neutral) — folds into the aggregate
			completedRun.push(tool);
		}
	}
	flushRun();
	return blocks;
}

// ── Composer pills from HarnessCapabilityDescriptor (architecture §e) ─

import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
} from "./harness/harness-capability-descriptor.js";

/**
 * Derive the composer pill descriptors for the selected model from a
 * `HarnessCapabilityDescriptor`. Dispatch on `control.kind`; a model declaring
 * no option → no pill; an unknown control kind → no pill (closed union, no throw).
 *
 * Returns ONLY the `HarnessModelOptionDescriptor` entries that have a recognized
 * control kind (select | boolean | number | text). An unrecognized kind is silently
 * excluded — never throws (mirrors the `generic` ToolKind discipline).
 *
 * Signature: (descriptor, modelId) → HarnessModelOptionDescriptor[]
 * No harness-type parameter → no per-backend branch (AC4 uniformity proof).
 *
 * @lore AM3: The function is intentionally thin — it only filters recognized
 * control kinds. The UI component is responsible for rendering select/boolean/
 * number/text controls. This keeps the shared adapter free of React imports.
 */
const RECOGNIZED_CONTROL_KINDS = ["select", "boolean", "number", "text"] as const;

export function deriveComposerPills(
	descriptor: HarnessCapabilityDescriptor,
	modelId: string,
): HarnessModelOptionDescriptor[] {
	const model = descriptor.models.find((m) => m.id === modelId);
	if (model === undefined) return [];
	return model.options.filter((o) =>
		(RECOGNIZED_CONTROL_KINDS as ReadonlyArray<string>).includes(o.control.kind),
	);
}
