CREATE TABLE `codex_entry_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`codex_entry_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer,
	`last_edited_at` integer,
	FOREIGN KEY (`codex_entry_id`) REFERENCES `codex_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `codex_entry_notes_entry_idx` ON `codex_entry_notes` (`codex_entry_id`);
