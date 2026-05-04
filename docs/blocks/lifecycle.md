## 5. Lifecycle

Blocks have no independent lifecycle. They are derived, used by the renderer for the duration of a request (or cached by `body_sha`), and discarded. Their "lifecycle" is the lifecycle of the source markdown body:

1. **Body created or written** (by a human in the Knowledge view or by an agent through the file watcher writeback path).
2. **Ingestion runs derivation** (§8): the markdown body is parsed, blocks are emitted, ids are computed, the cache (if any) is populated.
3. **Surfaces render the derived blocks** (L16 bet pitch, L23 knowledge body, future surfaces).
4. **Body is edited.** Re-derivation runs. Blocks whose normalised content + outline path didn't change keep their ids; blocks whose content changed get new ids; blocks that disappeared are gone. Inbound thread anchors that pointed at a now-missing blockId are preserved with a "block deleted" indicator (per L26).
5. **Body is deleted.** All derived blocks are gone. Inbound thread anchors render with a "block deleted" indicator. The L1 thread itself remains under its own lifecycle.

There is no "block status", no "block draft", no "block archived". The state of a block is exactly the state of its source body.

---
