## 11. What the Meta Layer Actually Ships at This Layer

To be deployable for anyone (per the constraint from RESEARCH_EXECUTION_LAYER.md), the meta layer ships:

1. **The Thread / Message data model.** SQLite-backed by default, swappable. The Thread primitive (§4.5) is the primary interaction contract, carrying typed messages (plain, review, questionnaire, verdict) attached to host entities.
2. **A small router** that takes any Item from any facilitator and sends it to the right view (Conversations / Rail / Work / Knowledge). The "facilitator → view" mapping in §7, made executable. <!-- @lore AD8a: historical — Rail removed in U6 -->
3. **One reference application — the Factory — as a native desktop app:**
   - **Electron desktop app** with the Hono API server embedded in-process. Four zones: IconRail + Submenu + Main pane (Conversations / Work / Knowledge) + Rail sidebar on the right. Desktop is the primary form factor. The same web app is accessible from mobile browsers for review triage and agent unblocking. No native mobile app. No offline support.
4. **A notification adapter** that hooks the review-thread stream into push services (APNs, Firebase, ntfy, plain email — deployer chooses). Notifications only fire for blocking reviews and agent-flagged urgent chats.
5. **A silence-mode + autonomy-level engine** that gates which items push, which queue, and which auto-resolve based on policy.

Everything else — beautification, themes, integrations — is downstream of this. The meta layer's job is the data model, the router, one reference app, and the notification/autonomy engine.

---
