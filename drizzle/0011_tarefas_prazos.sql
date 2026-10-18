ALTER TABLE kbos_tasks ALTER COLUMN project_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS due_at timestamptz;
--> statement-breakpoint
ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS description text;
--> statement-breakpoint
ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS assignee text;
--> statement-breakpoint
ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
--> statement-breakpoint
ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS done_at timestamptz;
--> statement-breakpoint
ALTER TABLE kbos_tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kbos_tasks_due_idx ON kbos_tasks (due_at);
--> statement-breakpoint
ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES kbos_contacts(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE kbos_projects ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES kbos_budgets(id) ON DELETE SET NULL;
