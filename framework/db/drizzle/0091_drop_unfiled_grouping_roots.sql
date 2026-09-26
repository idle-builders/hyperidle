-- @lore A fresh install ships with nothing: no folder is seeded, every
-- opinion arrives from a plugin or the person. 0080 inserted three grouping
-- roots (Product, Practices, General) into every database; this deletes
-- each one only where nobody used it — nothing was ever filed under it, no
-- task was made from it, and nobody edited it (every edit bumps `version`;
-- reads do not count). A root someone used stays, as their document.
-- Nothing else is cleaned.
DELETE FROM "documents" d
WHERE d."id" IN ('ki-mig-root-product', 'ki-mig-root-practices', 'ki-mig-root-general')
	AND d."version" = 1
	AND NOT EXISTS (SELECT 1 FROM "documents" c WHERE c."parent_kind" = 'document' AND c."parent_id" = d."id")
	AND NOT EXISTS (SELECT 1 FROM "tasks" t WHERE t."source_document_id" = d."id");
