-- A task's description can be an app: one whole HTML page that shows what the task is after.
ALTER TABLE "tasks" ADD COLUMN "description_format" text NOT NULL DEFAULT 'markdown';
