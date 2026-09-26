---
paths:
  - "docs/**/*.md"
---

# Documentation

`docs/` is the authoritative account of the product — not a changelog, not a design journal. It is
split by topic (`architecture/`, `process-layer/`, `agent-layer/`, `ui-design/`,
`knowledge-architecture/`, `human-interface-layer/`, `information-architecture/`, `blocks/`,
`requirements/`, `deployment/`, `guides/`), each folder carrying an `index.md` with
its section links. Superseded pages move to `docs/archive/` rather than lingering with a warning on
top.

## Writing

- Plain, simple language. No domain lingo where an ordinary word works, no marketing register, no
  effort or time estimates.
- Durable domain language only. Planning labels — track letters, work-item ids — stay inside
  `.pipeline/`. A doc that names a track and what it did is dated the day that track ends.
- Say what is true now. Not what is planned, not what was true before, not what a work item intends.
- One authoritative account per subject. If two pages would both explain a mechanism, one explains it
  and the other links.

## Truth

- **Verify against the code, never against a neighbouring doc.** An authoritative-looking page can be
  wrong: `docs/` currently contains pages describing packages that no longer exist and mechanisms that
  were rejected. Read the source, then write.
- **If your change makes a doc false, fix the doc in the same change.** A stale doc is worse than a
  missing one, because it is believed.
- Never restate a rule that a linter or governance owns — link to it. A second copy drifts, and then
  agents follow the wrong copy.
