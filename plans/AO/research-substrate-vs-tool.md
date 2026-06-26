# Research — Substrate vs Tool: how production agents reach external state

**Date:** 2026-06-26 · **Method:** deep-research harness — 5 search angles, 24 sources fetched, 104 claims, 25 adversarially verified (23 confirmed 3-0, 2 killed). Primary sources: MCP spec, Anthropic, Google Drive API, Glean, Notion, Cognition/Devin docs.

**Question.** Where is the line between *materialize a local working copy the agent edits + writes back* (substrate) and *access the live system through API tool calls* (tool) — for non-code systems (inboxes, ticketing/CRM, drives/docs)?

## Verdict (high confidence)

Production agent systems draw a **sharp, consistent line**:
- **Code repos ARE materialized** — cloned into a per-session sandbox; the agent edits files, runs tests, writes back via git branch→PR→merge. (Devin: per-task sandboxed VM with shell+editor+browser, repo cloned in, "editing files, running tests, and making pull requests." Claude Code: same local-filesystem model.)
- **Non-code systems of record (email, tickets, CRM, cloud drives) are NEVER materialized** as an editable-and-synced working copy. They are reached through **live API tool calls** (actions) or a **retrieval/index corpus** (reads). Write-back is **always discrete API mutation** (Drive create-file, CRM PATCH, refund). No surveyed system materializes a non-code corpus, lets an agent edit it in place, and syncs it back the way git does.

## The vocabulary encodes the split

- **MCP** separates **tools** (model-controlled *actions/operations* on external systems — query DB, call API, compute; invoked via `tools/call`) from **resources** (application-controlled, **read-only** data by URI; `resources/read` + subscribe — *no write method exists*). *Caveat:* resources are read-only attachments with **no write-back or history** — they are the **read-side of a substrate, not a full editable substrate**. So resource-vs-tool maps onto **read-data vs take-action**, only partially onto **materialized-substrate vs tool**.
- **Connector platforms** (Glean, Notion) separate a **read/index path** from a separately-configured **action/tool path**. Glean's read taxonomy: **Indexed** (crawled+stored in the vendor tenant, read at query time) · **Live** (call the source during the request) · **Hybrid**. Agents take action through **separately-configured tools**; the index is **never mutated by the agent**.

## The clean three-way read taxonomy

1. **live-API-call** (tool) — query/act on the live system of record.
2. **vendor-tenant-index** (knowledge/retrieval) — a RAG corpus materialized *for read* in the platform's tenant; the agent never edits it. (Notion AI's Drive connector ingests to a Turbopuffer vector DB and answers from embeddings, "rather than making live API calls.")
3. **agent-editable-sandbox-filesystem** (substrate) — **code-only** in every surveyed system; the agent edits files and writes back with version control.

## Why systems of record are not materialized

They **own their own consistency, permissions, and concurrency**. Google Drive keeps a **linear revision history — no branching/merging**, and its revisions API exposes **no merge/conflict mechanism**; concurrent edits reconcile via OT/CRDT (native Docs) or **"[Conflict]" duplicate copies** (synced binaries) — nothing git-like. A stale local mirror of a live SoR is undesirable. The materialized-substrate model is reserved for **code + document-authoring**, where a filesystem + version-control + test/diff loop is the native workflow.

## Decision rule (the synthesis)

> **Materialize a substrate only when the system has file-like, version-controlled, branch/merge-capable working artifacts the agent iterates on** (code repos; document authoring). **Use live tools/retrieval for every stateful external system of record** (inbox, ticket queue, CRM, and cloud-drive lookup — read via index, write via discrete API actions).

The discriminator is **not** "does an API exist" (everything has one) — it is **what the work is**: *author/transform a coherent corpus* → substrate; *operate a live system of record* → tool; *look something up* → knowledge/retrieval. The **same** Drive folder is a **substrate** when the job is "revise these 10 docs" and a **tool/knowledge** when the job is "find the Q3 report."

| System | Side | Why |
|---|---|---|
| Code repo (git) | **Substrate** | file-like, version-controlled, branch/merge, test loop — canonical |
| Doc-authoring set (Obsidian / markdown folder) | **Substrate** | a corpus edited as files; write-back = file/git; **publish via discrete action** |
| Email inbox (Gmail/Outlook) | **Tool** | live SoR; read=query, act=send/draft; no synced maildir |
| Ticket queue (Zendesk/Linear) | **Tool** | live SoR; read/update via API |
| CRM (Salesforce/HubSpot) | **Tool** | live SoR; PATCH via API |
| Cloud drive (lookup) | **Knowledge** (read) / **Tool** (write) | read via index; write via discrete create-file; no edit-and-syncback |

## Open questions (flagged by the research, for `/architecture`)

- **Document authoring is the one genuine middle.** Code clearly materializes; inbox/CRM/ticket clearly don't. A long document the agent drafts/iterates **may** warrant a materialized substrate even though its system of record (Drive/Notion) does not — the artifact lives in the sandbox and is **published via a discrete API action at the end**. Obsidian (local markdown files) is the most plausible non-code substrate.
- **Email is always live** IMAP/API query + discrete send/draft; no source modeled an inbox as a synced local maildir.
- **Index freshness** (substrate-built-on-index going stale vs the live SoR) is a retrieval concern, not a substrate one.

## Sources (primary)

- MCP spec — tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP — Anthropic announcement: https://www.anthropic.com/news/model-context-protocol
- Claude Code MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- Google Drive revisions API: https://developers.google.com/workspace/drive/api/guides/manage-revisions
- Glean connectors (indexed/live/hybrid + action tools): https://docs.glean.com/connectors/about
- Notion AI Drive connector (RAG index): https://www.notion.com/help/notion-ai-connectors-for-google-drive
- Cognition / Devin (repo materialization): https://cognition.com/blog/introducing-devin · https://docs.devin.ai
