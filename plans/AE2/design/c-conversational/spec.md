# Variant C -- Conversational (Reference-Borrowed: Slack onboarding)

**Constraint:** Take inspiration from Slack's onboarding pattern -- minimal upfront form, then a conversational guide that walks you through setup in-context. The Assistant IS the onboarding.

**Thesis:** The user should not pick team functions from a grid. They should tell the Assistant what they want to do, and the Assistant configures the team. The setup form captures only the bare minimum (name + API key). Team composition happens in the Assistant thread as a conversation.

## User task

A first-time user fills out a minimal form (name + API key + optional repo path -- exactly what exists today). On submit, they land on `/work/portfolio` with the Assistant overlay open. The Assistant's first message is a structured welcome that asks what the user wants to build. The user types a natural-language response. The Assistant suggests a team composition and creates it (using AE3 tools -- but AE3 is out of scope, so for v1 the user picks from pre-set function bundles in the Assistant response).

Wait -- AE3 (Assistant tools for creating teams/agents) is explicitly out of scope. The Assistant cannot programmatically create teams in AE2. This variant must work WITHOUT the Assistant having creation tools.

**Revised approach:** The setup form gets a single "What are you building?" textarea. The answer is stored and seeded into the Assistant thread as context. Team function selection still happens in the form (as a simplified preset picker), but the Assistant's welcome message references the user's answer to provide personalized guidance.

## Layout

### Setup form (single scroll, same card as today)

```
[Brand + tagline]
[WelcomeVisual]

Set up your workspace

Your name          [input]
Anthropic API key  [input]
Project folder     [input + folder picker]

What are you building?
[textarea -- 3 rows, optional]
"A SaaS app for managing subscriptions"

[Development + Product]  [Development + Design]  [Full stack]  [Marketing + Growth]
   (preset bundles as radio-style pills, based on common patterns)

[Start HyperIdle]
```

### Preset function bundles

Instead of 8 individual function toggles, offer 4-5 curated presets:

| Preset | Functions | Agents created |
|---|---|---|
| **Software** | development, product | Builder, QA Engineer, Product Manager |
| **Software + Design** | development, product, design | Builder, QA Engineer, Product Manager, Designer |
| **Full team** | development, product, design, marketing | Builder, QA Engineer, Product Manager, Designer, Growth |
| **Marketing** | marketing, product | Growth, Brand Voice, Content Writer, Product Manager |
| **Custom** | (opens individual function toggles) | User picks |

### Preset pill layout

Horizontal row of pill-shaped radio buttons (DaisyUI `btn` group styled as radio):
- Unselected: `bg-[var(--surface-elevated)] border-[var(--border-default)] text-[var(--text-secondary)]`
- Selected: `bg-[rgba(22,118,79,0.06)] border-[var(--accent-primary)] text-[var(--accent-primary)]`
- Size: 13px/500, px-12 py-6, rounded-pill
- Selecting "Custom" expands the individual function chip grid below (same as Variant A)

Below the presets, a subtle agent list: "Creates: Builder, QA Engineer, Product Manager" in 12px `--text-tertiary`.

### Post-setup: Assistant welcome

The user lands on `/work/portfolio`. Assistant overlay auto-opens. First message (seeded server-side when the assistant thread is created during setup):

```
Welcome to HyperIdle, [Name].

Your team is ready: [Builder, QA Engineer, Product Manager] are standing by.
[If repo path provided:] I see you have connected [repo-name] as your project folder.

Here is what I suggest:
1. Create your first bet -- describe what you want built, and the team will pick it up.
2. Ask me anything -- I can help you understand how bets, tasks, and reviews work.

What would you like to do first?
```

This message is a real plain message posted by the assistant agent during setup, not canned UI copy.

## Component composition

- **Input** (design system) -- name, API key
- **Button** (design system) -- submit
- **Textarea** -- standard DaisyUI textarea for "What are you building?"
- **Preset pills** -- same visual treatment as Variant A chips but radio behavior (only one selected at a time, except "Custom" which opens multi-select)
- **AssistantOverlay** (existing shell) -- auto-opens post-setup

**New custom components: 0.**

## Information hierarchy

1. **Brand** -- "HyperIdle" (unchanged)
2. **WelcomeVisual** (unchanged)
3. **Form heading** -- "Set up your workspace" 20px/600
4. **Identity fields** -- name, API key, repo path
5. **Context field** -- "What are you building?" textarea (optional, 15px body)
6. **Preset selection** -- function bundles as pill group
7. **Agent preview** -- subtle text showing what gets created
8. **Submit** -- "Start HyperIdle"

## States

| State | What renders |
|---|---|
| **Initial** | Identity fields empty. Presets: "Software" pre-selected (sensible default). Context textarea empty. Submit disabled (needs name + API key). |
| **Filling** | User types name + API key. Optionally types what they are building. Optionally changes preset. Submit enables when name + API key filled. |
| **Custom expanded** | User clicked "Custom" -- individual function chips appear below presets (same as Variant A). |
| **Submitting** | Button spinner. Form disabled. |
| **Error** | Inline error. |
| **Post-setup** | `/work/portfolio`. Assistant overlay open. Welcome message visible. |

## Behavior

- **Preset selection:** Radio behavior. Clicking one deselects others. "Custom" is special: it reveals the individual function toggles.
- **Default preset:** "Software" is pre-selected so the user can skip the choice entirely (just fill name + key and go).
- **Context field:** Optional. The text is stored and used to seed the Assistant's welcome message with personalized guidance.
- **Post-submit:** The team creation API receives the selected functions. A welcome message is posted to the assistant thread server-side with context from the setup.
- **Keyboard:** Standard form navigation. Presets are a radio group with arrow key navigation.

## Mobile adaptation

Presets wrap to 2 per row. Context textarea full-width. No other changes needed.

## Signature

**Opinionated defaults.** The user does not need to understand team functions. "Software" is pre-selected. They type name + key and go. The complexity is hidden behind "Custom" for power users.

## Trade-offs

- **Bad at:** Users who want fine-grained control upfront. The preset bundles hide the individual function toggles behind "Custom."
- **Bad at:** Novel use cases. If someone is building something that does not fit the 4-5 presets, they must know to click "Custom."
- **Good at:** Speed for the 80% case. Most users are building software. Pre-select "Software" and they are one form-fill away from done.
- **Good at:** Making the Assistant feel central to the experience from minute one. The personalized welcome message creates an immediate relationship.
