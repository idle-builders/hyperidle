CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`producing_task_id` text NOT NULL,
	`kind` text NOT NULL,
	`preview_json` text,
	`cost_money_micros` integer,
	`cost_tokens_input` integer,
	`cost_tokens_output` integer,
	`cost_settled_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`producing_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `artifacts_producing_task_id_idx` ON `artifacts` (`producing_task_id`);--> statement-breakpoint
CREATE INDEX `artifacts_created_at_idx` ON `artifacts` (`created_at`);
