# How Knowledge Compounds

HyperIdle stores everything agents and humans produce in one document store. What one agent learns on one task is available to every agent on the team. The tenth task is faster than the first.

---

## One document store

All documents trace back to one table. A document has a scope (`factory | team | user`) that says who sees it, a slot that says what kind it is (ordinary, skill, rule, agent file, prompt), a status, and a position in a nested tree. Position says what a document is about; scope says who can read it.

Agents see documents as files in a `knowledge/` folder inside their working directory. Edits they make there write back to the same table. No synchronization problem — there is one source of truth.

---

## Statuses

| Status | Meaning |
|---|---|
| `proposed` | New, awaiting human or plugin review |
| `active` | Current and trusted |
| `stale` | Flagged for review |
| `archived` | Terminal; no longer active |

---

## Scope

- **Factory** — visible to everyone (previously "Shared")
- **Team** — sits in that team's space and goes into the context of that team's agents; everyone can read it
- **User** — private to one person

---

## Curation

Out of the box, no automatic curation runs. Documents accumulate as agents and humans write them.

Install the **document-management** plugin (**Settings → Plugins**) to add scheduled curation: a Document Librarian agent runs on a schedule to triage new documents, archive stale ones, and capture retros after tasks complete. These are ordinary subscriptions on the plugin's agent — you can inspect and adjust them from the agent's profile page.

---

## What makes this different

| | Typical agent memory | HyperIdle knowledge |
|---|---|---|
| **Structure** | Strings in a vector index | Scope, status, slot, tree position on one row |
| **Sharing** | Per-agent or per-project silo | Team knowledge, shared by design |
| **Curation** | Raw captures accumulate | Plugin-provided librarian agent, if installed |
| **Human access** | AI-generated and trusted automatically | AI-generated, human-editable at any time |

---

Next: [How Work Flows](./how-work-flows.md) for the process model.
