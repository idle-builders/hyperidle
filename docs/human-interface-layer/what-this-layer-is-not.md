## 12. What This Layer Is Not

To prevent scope creep, a list of things the human interface layer explicitly does not own:

- **The agent runtime.** Not our problem; lives in the harness (Claude SDK, Letta, Goose, etc.).
- **Skill execution.** Skills run in the workspace; we just route their output to the right view.
- **Memory storage.** Owned by the knowledge fabric (KNOWLEDGE_ARCHITECTURE.md).
- **Observability backends.** We emit traces to the configured adapter (console, OpenTelemetry planned); we don't run them.
- **Workflow orchestration.** No DAGs. Items flow through routing; that's it.
- **Multiple applications.** One app, two form factors. Not four.
- **Per-product custom dashboards.** If a deployer wants a custom view, they build it on top of the same Item / Response store.

If we end up writing code that fits one of these descriptions, we've crossed a layer boundary and should stop.

---
