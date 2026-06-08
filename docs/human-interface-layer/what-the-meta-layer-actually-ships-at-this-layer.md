## 11. What the Process Layer Actually Ships at This Layer

To be deployable for anyone, the process layer ships:

1. **The Thread / Message data model.** SQLite-backed by default, swappable. The Thread primitive (§4.5) is the primary interaction contract, carrying typed messages (plain, review, questionnaire, verdict) attached to host entities.
2. **A small router** that takes any Item from any facilitator and sends it to the right view (Conversations / Work / Knowledge). The "facilitator → view" mapping in §7, made executable.
3. **One reference application — the Factory — as a native desktop app:**
   - **Electron desktop app** with the Hono API server embedded in-process. Two zones: Sidebar + Main pane (Conversations / Work / Knowledge). Desktop-only — no mobile form factor.
4. **A notification adapter** that hooks the review-thread stream into push services (APNs, Firebase, ntfy, plain email — deployer chooses). Notifications only fire for blocking reviews and agent-flagged urgent chats.
5. **A silence-mode + autonomy-level engine** that gates which items push, which queue, and which auto-resolve based on policy.

Everything else — beautification, themes, integrations — is downstream of this. The process layer's job is the data model, the router, one reference app, and the notification/autonomy engine.

---
