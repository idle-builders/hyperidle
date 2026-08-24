// Block derivation — merged from framework/block-derivation (AU44 batch7)
// Block types — moved from framework/domain-model (AU44 batch8)
export { blockId } from "./block-id.js";
export { deriveBlocks } from "./derive-blocks.js";
export { derivePayloads } from "./derive-payloads.js";
export { EMPTY_SLUG_SENTINEL, normalisedPayload, slug } from "./normalise.js";
export type {
	Block,
	BlockAnchor,
	BlockDerivationResult,
	BlockHostKind,
	BlockId,
	BlockKind,
	BlockPayload,
	InlineNode,
	ListItem,
} from "./types.js";
export {
	BLOCK_HOST_KINDS,
	BLOCK_ID_VERSION,
	BLOCK_KINDS,
	IMAGE_URL_SAFE_SCHEMES,
	LINK_URL_SAFE_SCHEMES,
	MAX_BODY_BYTES,
} from "./types.js";
