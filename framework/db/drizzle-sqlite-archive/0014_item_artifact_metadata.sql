-- L9: item artifact metadata for UI contract parity.
ALTER TABLE `items` ADD `reversibility` integer;
--> statement-breakpoint
ALTER TABLE `items` ADD `sandbox_result` text;
