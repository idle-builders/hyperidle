# Q2 Design Synthesis

## Winner: Variant A (Dialog Form)

Variant A scores higher (7.5 vs 6.5) and has lower implementation cost. The decisive factors:

1. **Coherence with existing patterns.** HyperIdle already uses modal dialogs for founder actions (ConsequencePreviewDialog, AppetiteDialog). A creation dialog follows the same grammar. Variant B introduces inline-expand, a pattern used nowhere else in the system.

2. **Consistent form across entry points.** The same dialog works from Knowledge view, WorkBet, and TaskSheet. Only the pre-filled scope differs. Variant B requires three layout variations that must all be maintained.

3. **Accessibility.** Native `<dialog>` with `showModal()` provides focus trap and Escape handling for free. Variant B requires manual implementation of both.

4. **TaskSheet fit.** The TaskSheet is already vertically packed. Adding an inline form competes with the thread and request sections. A dialog floats above the sheet, adding no spatial pressure.

## Elements pulled from Variant B

**One element from B is worth taking:** the compact scope-row layout. Variant A placed scope_kind and scope_id as separate rows at the top of the dialog. Variant B's single horizontal row at the bottom is better:

- Scope is tertiary information (usually pre-filled)
- Placing it below title and body matches the information hierarchy (title first, body second, scope third)
- A single row with `[scope_kind ▾] [scope_id ▾]` is compact and progressive

**Adopted in the final design:** Scope row moves below the body textarea, on a single horizontal line with the scope_kind select and scope_id select side by side.

## Explicitly rejected

1. **Inline-expand creation.** New interaction grammar for one feature, three layout variations, manual focus management. Not worth the complexity for a low-volume action.
2. **Full-page creation form.** Overkill for 3 fields. The detail page already provides rich editing after creation.
3. **Toast feedback on creation.** No toast system exists in HyperIdle. The new item appearing in the list IS the feedback. Adding a toast for this one feature would require building toast infrastructure for one call site.
4. **Live markdown preview in the dialog.** The dialog is for capture, not editing. Preview is available on the detail page after save. Adding a preview panel doubles the dialog width or requires a tab toggle.
5. **"Quick create" (title-only, body later).** Requiring both title and body prevents empty knowledge items that accumulate as orphans. The founder can write a one-line body for quick notes.
