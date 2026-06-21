/**
 * AM1 — Part vocabulary + source adapters.
 *
 * A `Part` is the typed rendering unit of a conversation. Parts are DERIVED
 * from a source (Message[] today; session events tomorrow — AM3) and NEVER
 * stored. The renderer (`packages/web/src/components/PartList.tsx`) imports
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
// The adapter body (and ONLY the adapter body) imports the source types.
import type { ArtifactRef, EntityRef, InlineRef, Message, VerdictPayload } from "./thread.js";
import { exhaustiveAssert, isRedactedPayload, verdictDecisionLabel } from "./thread.js";

// ── Part discriminant (closed, derived, never stored) ───────────────

export const PART_KINDS = ["prose", "review", "resolved", "questionnaire", "unknown"] as const;
export type PartKind = (typeof PART_KINDS)[number];

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
	| { readonly route: "host"; readonly hostKind: BlockHostKind; readonly hostId: string }
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
			target: { route: "host", hostKind: ref.hostKind, hostId: ref.hostId },
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
	// First pass: index verdicts by the message they resolve.
	const verdicts = new Map<string, VerdictPayload>();
	for (const m of messages) {
		if (m.type === "verdict" && !isRedactedPayload(m.payload)) {
			verdicts.set(m.payload.resolvesMessageId, m.payload);
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
						label: verdict ? verdictDecisionLabel(verdict.decision) : "RESOLVED",
						resolvedBy: verdict ? verdict.resolvesMessageId : author.name,
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
						label: verdict ? verdictDecisionLabel(verdict.decision) : "RESOLVED",
						resolvedBy: verdict ? verdict.resolvesMessageId : author.name,
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

/**
 * AM1↔AM3 reuse stub. AM3 grows this into the real session-event adapter; in
 * AM1 it exists to prove the renderer input is source-agnostic — whatever it
 * returns is the SAME `Part[]` contract `derivePartsFromMessages` returns.
 *
 * @lore AM1 AC5: this is the executable half of the source-agnostic boundary.
 * Two adapters, one renderer, zero renderer change.
 */
export function derivePartsFromSession(): Part[] {
	return [];
}
