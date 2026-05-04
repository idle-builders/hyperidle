## 8. Future Upgrade: Real-Time Co-Editing

Continuous file-watcher sync (§5) handles the normal case: agents write files, the fabric syncs them back within seconds. This is near-real-time but not keystroke-level.

If we ever need true real-time co-editing of a specific document (two humans, or a human and an agent editing the same practice simultaneously at the character level), we can layer Yjs (CRDT library) on top for that specific editing session, with the canonical store still being SQLite. Yjs handles the keystroke-level merge; the Knowledge Fabric handles the durable write. This is purely additive — the canonical store, workspace layout, manifest, and conflict resolution all stay the same.

---
