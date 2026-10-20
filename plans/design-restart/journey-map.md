# Journey map

Written 2026-10-20 for the cutover (`cutover-plan.md`). Each journey's main path is listed screen
to screen. Under each screen are the other actions on it and where they lead.

What the map shows:
- **Every screen type already exists in the design.** Most of what is "missing" is a link between
  existing screens. The studio draws these links but does not wire them; the new app wires every
  one.
- Each action is marked:
  - **design**: a small new design the journeys need
  - **remove**: taken out
  - **later**: the founder put it off
  - **backend**: the backend change goes in the cutover branch

The screen types are: sidebar (with notifications and the team switch), find or ask, thread
(including a review), task page, document, team page, user page, plugin page, first start, and
seven dialogs.

## The journeys

**First start** (install → first conversation)
- **First start** → "Start talking" → **Thread · Getting started** → "Connect a folder" →
  **Folder dialog** → "Save" → **Your page**
- First start, nothing found or not signed in → how to install or sign in, and Look again.
  *design*
- First start, join a team on a server → the server's address, instead of naming a new team.
  *design*
- In the thread:
  - "Connect GitHub" → service dialog
  - "Not now" → the hint goes

**Arrive** (the morning)
- **Sidebar** → 🔔 → **Notifications** → ⌘K → **Find or ask** → ↵ on a hit → **thread, task or
  document**
- Sidebar:
  - a row → its thread, task or document
  - You → your page
  - New conversation → an empty thread whose first line @mentions someone. *design*
- Notifications:
  - a row → the thread, task or document it is about
  - Mark all read. *backend*
  - What I follow. *remove*
- Find or ask:
  - Tab → the answer, saved as a thread
  - a source → that item
  - ⌘↵ open beside. *remove*

**Hand off**
- **Thread** → type @ → **Mention picker** → ↵ → **Thread with the work item strip** → "Open ›"
  → **Task page**
- In the thread:
  - Peek at session → steps, in place
  - an option on a question → answered in place. *backend*
  - "Look at it" → review
  - ticket ↗ → the outside system

**Judge**
- **Review** → Reject → **Reject dialog** → **Review, rejected** → (agent works) → **Review,
  round 2** → Approve → **Thread**
- In the review:
  - click on the result → a new pin and comment. *backend*
  - More space (preview and code) → full width
  - a question row → its pin
  - Anything overall? → a message in the thread
  - @someone → hands the review on
  - "open round 1 ›" → round 1, as it was. *backend*

**Run the shift**
- **Sidebar · Work** (team switch) → a row → **Task page, whole task** → a part → **one part** →
  Question row → **the question in the task's conversation** → an option → **answered**
- Sidebar: "The team ›" → team page.
- In the task box:
  - Hold, Follow, Ask for a review → in place. *backend*
  - Stop → the task says Stopped, with Start again (no confirm). *design*
  - Came from → the thread it was handed off in
  - N earlier sessions → the list opens in place
  - a review row → review
  - a document row → document
  - "also in Conversations" → the task's thread
  - the session cost line. *remove*

**Think**
- **Knowledge tree** → a row → **Document** → ✎ Edit → **editing** → comment → **Comment in the
  margin** → Apply → **Change applied** → Publish → **Published, followers told**
- In the tree:
  - New document → an empty document in edit mode. *design*
  - Change icon. *backend*
  - a space only folds and unfolds; it has no page of its own
- In the document:
  - Follow. *backend*
  - Also in Conversations → the comment's thread
  - @Builder in a comment → task card → task page

**People and set-up**
- **Team page** → an agent → **User page** → "Add a time or an event" → **Reason dialog** → Add
  → **Document: what to do then** → Done → **User page**
- On the team page:
  - Add someone, an agent → the new agent's page → Write its instructions
  - Add someone, a person → an invite. *later*
- On the user page:
  - a row in their list → task, review or thread
  - Open conversation → a thread with them
  - Edit → the edit dialog → the instructions document
  - Add a folder, Connect a service → their dialogs. *backend*
  - Instructions, a skill, a memory note, About → each opens as a document
  - Discipline → a fact in the box, set in Edit. *design*
  - Remove from the team → the team page, with Undo

**Your page**
- **Sidebar · You** → **Your page** → "Change what you are told about" → **Told-about dialog**
  → Save → **Your page**
- On your page:
  - notification switches
  - Looks (Light, Dark, Like this computer) → the app's theme
  - This app · lives on: a fact. Moving it is not designed. *later*
  - Agent programs on this computer: found or not, signed in or not, Look again. *design*
  - See what you follow. *remove*

**Plugins**
- **Team page** → Add a plugin → **Add a plugin dialog** → Add → **Plugin page** → an agent →
  **User page**
- On the plugin page:
  - Switch off or on
  - Remove → the team page, with Undo
  - Put the plugin's version back. *backend*
  - a skill → document

## Small designs the journeys need
- **New document:** a + in the knowledge tree. It opens empty, in edit mode. Without it, Think has
  no start.
- **New conversation:** a + over Conversations. An empty thread whose first line @mentions
  someone.
- **First start, nothing found:** no agent program, or not signed in. Says how to fix it, with
  Look again.
- **First start, join a server:** the server's address, instead of naming a new team.
- **Agent programs on your page:** which were found, which are signed in, and Look again. This
  replaces the old Harnesses settings.
- **Stop a task:** no confirm. The task says Stopped, with Start again.
- **Discipline:** a fact in the user's box, set in the Edit dialog.
- **Empty and failed:** one quiet line style for an empty list, and one for a page that failed to
  load.

## Removed
- **New task form:** work is created by handing off in a thread or a comment.
- **Org chart:** teams and owners already say who works for whom.
- **Keys for agent programs:** each program signs itself in. HyperIdle does not hold its key.
- **Server and worker settings:** where the app lives is a fact on your page, and joining is part
  of first start.
- **What you follow, as a list:** you follow and unfollow on the thing's own page.
- **Open beside:** there is no side-by-side view.
- **A page for a knowledge space:** a space only folds.
- **The session cost line:** the backend counts tokens, not money.
- **Confirm dialogs:** Remove and Stop act at once, with Undo or Start again.

## Settled by mapping, no new design
- **9 kinds of review content** map onto the 6 parts Judge drew: preview, code, image, numbers,
  text, and a list of items (a batch, such as three customer replies).
- **Skills, memory and About** are documents, and open as one.
- **A question** is a card in its thread. Its box row opens the thread at the card.
- **Round 1 from round 2** is the same review screen, in its rejected state.
- **Sessions:** Peek shows them in place, and earlier ones open as a list in place. There is no
  session page.
- **Inviting a person:** later, as the founder said.
