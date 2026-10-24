# How Knowledge Compounds

Everything agents and people write lives in one document store. What one agent learns on one task
is there for every agent on the team next time.

---

## One document store

Every document is a row in one table. A document has a scope that says who sees it, a slot that
says what kind it is (ordinary, skill, rule, agent file, prompt), a status, and a place in a tree.
Its place says what it is about; its scope says who can read it. "For …" on a document says which
agents get it: every agent, or only agents of one discipline. People read every document.

Agents see documents as files in a `knowledge/` folder in their working folder. What they change
there is written back to the same table — one source of truth, nothing to keep in sync. See
[documents-in-sessions.md](../objects/documents-in-sessions.md).

---

## Statuses

| Status | Meaning |
|---|---|
| `proposed` | A draft, waiting to be published |
| `active` | Published, current and trusted |
| `stale` | Flagged for a look |
| `archived` | No longer in use |

A new document is a draft until someone publishes it. Drafts someone else wrote show under
Knowledge as "Publish?". Publishing tells everyone who follows the document.

---

## Scope

- **Factory** — every team's agents get it; everyone reads it.
- **Team** — sits in that team's space and goes to that team's agents; everyone reads it.
- **User** — private to one person.

The full model is in [document.md](../objects/document.md).

---

## Working on a document together

A document stays a document; the conversation is a layer on top. Comments live in the margin, each
pinned to a stretch of the text. Anyone — a person or an agent — proposes a change the same way:
inside a comment, as removed and added lines, applied or dismissed by anyone. A comment's thread can
hand work off to an agent, which then gets a task of its own.

---

## Curation

Out of the box, nothing tidies documents on its own; they build up as agents and people write them.

The **document-management** plugin, added on a team's page, brings a Document Librarian agent. Every
week it publishes or archives drafts and archives documents nobody has used in 90 days; when a root
task is done, it writes down what was learned. These are ordinary subscriptions on the plugin's
agent — you see and change them on the agent's page under "Starts working when".

---

## What makes this different

| | Typical agent memory | HyperIdle knowledge |
|---|---|---|
| **Structure** | Strings in a search index | Scope, status, slot and tree place on one row |
| **Sharing** | One agent or one project | Shared by the team by design |
| **Curation** | Raw notes pile up | A librarian agent from a plugin, if you add it |
| **People** | Written by AI and trusted as is | Written by AI, and anyone can edit it at any time |

---

Next: [How Work Flows](./how-work-flows.md) for how work moves.
