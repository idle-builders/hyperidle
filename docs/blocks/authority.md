## 11. Authority

- **Owner of the source body**: the host entity (a knowledge item, a bet pitch). Their existing authority model (L25 for knowledge edit/manage; bets per `PROCESS_LAYER.md`) governs.
- **Producer of Blocks**: the BlockDerivation function. No other code emits Blocks. Server-side renderers and client-side renderers call the *same* derivation.
- **Mutator of Block instances**: nothing (Blocks are values; recompute, never edit). To change a block, the user (or an agent) edits the source markdown.
- **Mutator of the BlockKind type set**: this concept doc. Adding or removing a kind requires updating §6 first, then SHARED.md, then consumers. PRs that change the kind set without the §6 update are non-conformant.
- **Owner of the BlockId algorithm**: this document (§8.4). Bumping the version tag (`blk:v1` → `blk:v2`) is a global migration event — every cached id is invalidated, every anchored thread re-resolves through the "block deleted" indicator until the next user action re-anchors.

---
