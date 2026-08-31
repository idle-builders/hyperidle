# Improvements — Work Layer

Cross-cutting improvement notes for the work layer (Bets, Tasks, Sessions, Routines).

## 1. Bet pitch rendering (L16)

The bet pitch is a markdown body that should render through the Block primitive. Currently the `WorkBet` page uses a `<pre>` fallback that does not respect the block structure. Migrating to `deriveBlocks` + `*BlockView` components would enable per-block discussion (L26) and richer rendering.

## 2. Task body rendering

Same pattern as bets: task description fields should pass through `deriveBlocks` and render with `BlockView` components, enabling block-level anchoring and discussion.

## 3. Session transcript blocks

Session transcripts could be structured as Blocks to allow fine-grained reference and quoting in follow-up conversations.

## 4. Routine definition rendering

Routine definitions contain markdown that would benefit from Block-level rendering for documentation purposes.

## 5. Block IDs in cross-references

Work items that reference each other should use stable block ids as anchor points rather than line numbers or character offsets. The BlockId algorithm defined in `docs/blocks/contracts.md § 8.4` provides a stable, content-addressed identifier that survives edits to surrounding content. Using block ids in cross-references between Bets, Tasks, and Knowledge items would make references resilient to document restructuring.

## 6. Artifact attachment rendering

Artifacts attached to bets and tasks should display inline previews using block-level rendering where the artifact body is markdown.
