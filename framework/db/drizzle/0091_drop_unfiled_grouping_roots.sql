DELETE FROM "documents" d
WHERE d."id" IN ('ki-mig-root-product', 'ki-mig-root-practices', 'ki-mig-root-general')
	AND d."version" = 1
	AND NOT EXISTS (SELECT 1 FROM "documents" c WHERE c."parent_kind" = 'document' AND c."parent_id" = d."id")
	AND NOT EXISTS (SELECT 1 FROM "tasks" t WHERE t."source_document_id" = d."id");
