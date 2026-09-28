/**
 * L2 Block primitive types. Concept: docs/interface/blocks.md.
 *
 * @lore AU44-b8: moved here from framework/domain-model/src/blocks/types.ts.
 * block-derivation dissolved into core-ui (batch 7); types follow their producer.
 */

export const BLOCK_KINDS = [
	"heading",
	"paragraph",
	"list",
	"quote",
	"code",
	"table",
	"divider",
	"image",
	"html",
	"unknown",
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

// @lore BB1: "bet" removed — root tasks (parentTaskId===null) replace bets.
export const BLOCK_HOST_KINDS = ["task", "document", "artifact", "agent", "user"] as const;
export type BlockHostKind = (typeof BLOCK_HOST_KINDS)[number];

/**
 * @lore Branded BlockId — nominal type prevents passing arbitrary strings
 * where a derived BlockId is required. Construct only via blockId().
 */
export type BlockId = string & { readonly __brand: "BlockId" };

export const BLOCK_ID_VERSION = "blk:v1" as const;

/** Defence-in-depth allowlist for image URLs. AC-15a. */
export const IMAGE_URL_SAFE_SCHEMES = ["http:", "https:", "data:image/"] as const;

/** Defence-in-depth allowlist for inline-link URLs. */
export const LINK_URL_SAFE_SCHEMES = ["http:", "https:", "mailto:", "tel:"] as const;

/** 256 KB body cap. See L2-plan § 4.1.1. */
export const MAX_BODY_BYTES = 256 * 1024;

export interface BlockAnchor {
	blockId: BlockId;
}

export type InlineNode =
	| { type: "text"; value: string }
	| { type: "strong"; children: InlineNode[] }
	| { type: "emphasis"; children: InlineNode[] }
	| { type: "inlineCode"; value: string }
	| { type: "link"; href: string; children: InlineNode[] }
	| { type: "break" };

export interface ListItem {
	children: BlockPayload[];
}

export type BlockPayload =
	| {
			kind: "heading";
			level: 1 | 2 | 3 | 4 | 5 | 6;
			text: string;
			inline: InlineNode[];
	  }
	| { kind: "paragraph"; inline: InlineNode[] }
	| {
			kind: "list";
			ordered: boolean;
			start: number | null;
			items: ListItem[];
	  }
	| { kind: "quote"; children: BlockPayload[] }
	| { kind: "code"; lang: string | null; text: string }
	| {
			kind: "table";
			align: ("left" | "right" | "center" | null)[];
			header: InlineNode[][];
			rows: InlineNode[][][];
	  }
	| { kind: "divider" }
	| { kind: "image"; alt: string; url: string; title: string | null }
	| { kind: "html"; raw: string }
	| {
			kind: "unknown";
			raw: string;
			reason: "parser-unrecognised" | "body-too-large" | "sanitiser-stripped";
	  };

export interface Block {
	id: BlockId;
	kind: BlockKind;
	source: {
		hostKind: BlockHostKind;
		hostId: string;
		bodyDigest: string;
		range: { start: number; end: number };
	};
	payload: BlockPayload;
	anchor: BlockAnchor;
	order: number;
}

export interface BlockDerivationResult {
	blocks: Block[];
}
