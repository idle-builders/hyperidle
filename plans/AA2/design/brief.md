DESIGN-CLASS: routine  ref=BetCreateDialog,KnowledgeCreateDialog,WorkRoutine  pattern=none

# AA2 Design Brief — Routine Management & Session Adaptation

## Classification rationale

Both axes match for **routine** classification:

1. **Existing component reference:** YES. `BetCreateDialog.tsx` and `KnowledgeCreateDialog.tsx` establish the native `<dialog>` creation flow pattern. `WorkRoutine.tsx` already has Pause/Resume and Trigger Now action buttons.
2. **Pattern match:** YES. The dialog pattern (min-w-[320px], max-w-[480px], pill buttons, form fields, cancel/create) is used twice in the codebase.

The cron schedule picker is composed from DaisyUI `select` elements (existing Select primitive from design-system), not a new design-system component. It is page-level UI inside the dialog, not a reusable Tier 0/1/2 primitive.

No new design-system components are introduced. Component budget: 0 new, 0 replaced.

## User task

A team lead wants to manage recurring agent work: create new routines, edit existing ones, pause/resume them, and soft-delete ones that are no longer needed. They do this from the Work surface, specifically from the WorkTeam page (where routines are listed) and the WorkRoutine detail page (where a single routine's config and run history are displayed).

## Interrogation probes (settled)

1. **Who and what decision?** A team lead deciding "should this agent do this recurring work on this schedule?" The creation form captures: what (name + description), who (agent), when (schedule), and how much (optional cost cap). All fields are concrete decisions, no optional-for-later.

2. **Smallest UI surface?** A creation dialog (not a full page). Same pattern as bet creation -- the dialog opens from the WorkTeam page, captures minimal required fields, and POSTs to the API. Edit is a secondary action on the WorkRoutine detail page -- inline editing of the same fields, not a separate dialog.

3. **Primary state?** Populated. Team leads interact with routines that already exist. Creation is a one-time act per routine. The detail page is the primary surface (already built in AA1).

4. **Composition from existing components?** 
   - Dialog: native `<dialog>` element (BetCreateDialog pattern)
   - Form fields: DaisyUI `select` for agent/team/schedule, DaisyUI `input` for name, `BodyEditor` for description
   - Schedule picker: composition of two DaisyUI `select` elements (preset + custom cron input)
   - Action buttons: existing pill buttons (`btn btn-sm btn-primary`, `btn btn-sm btn-ghost`)
   - Detail page additions: btn-ghost for Delete, confirmation sub-dialog for destructive action
   - Status: existing `StatusChip` component

5. **What gets truncated?** Routine name truncates with ellipsis in the team page routine row (already handled by AA1). Description truncates in the dialog preview. Cron expression is always fully visible (short strings).

6. **Mobile adaptation?** Dialog fills screen width on mobile (existing behavior from min-w-[320px] w-full). The WorkRoutine detail page is already mobile-adapted (single column). No special mobile treatment needed beyond the existing dialog responsive behavior.
