# Accepted Survivors

Rows that were convicted by the AU20 audit but cannot be removed without violating an enforced
architectural boundary. Each entry records the row, the boundary, and what would need to change
for a future deletion to succeed.

---

- `BakedWorkIntentRequest` — deleting the local mirror forces session-requests to import @hyperidle/work-intent-port, whose enforced audience excludes it. The duplication is real but the fix is a boundary change, not a deletion.

- `BakedContextKnowledgeItem` — local mirror of the same type in @hyperidle/work-intent-port; same boundary constraint as BakedWorkIntentRequest above. Cannot be deleted independently (BakedContextBundle references it).

- `BakedContextBundle` — local mirror of the same type in @hyperidle/work-intent-port; same boundary constraint as BakedWorkIntentRequest above. Used internally by BakedWorkIntentRequest.

- `triggerResolutionHistory` — table row (bundle-01, row 45). Table deletion is stage 3 only, after every reader and writer is gone. The type aliases `TriggerResolutionHistoryRow` and `NewTriggerResolutionHistoryRow` were deleted in this bundle; the table itself waits for the stage-3 pass.

- `filesystemCaptures` — table row (bundle-01, row 46). Table deletion is stage 3 only. The type aliases `FilesystemCaptureRow` and `NewFilesystemCaptureRow` were deleted in this bundle; the table and its INSERT site in mounter-registry wait for the stage-3 pass.
