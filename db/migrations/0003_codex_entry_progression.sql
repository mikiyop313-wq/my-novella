CREATE TABLE `codex_entry_progression` (
	`id` text PRIMARY KEY NOT NULL,
	`codex_entry_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`scene_id` text,
	`created_at` integer,
	`last_edited_at` integer,
	FOREIGN KEY (`codex_entry_id`) REFERENCES `codex_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `codex_entry_progression_entry_idx` ON `codex_entry_progression` (`codex_entry_id`);
--> statement-breakpoint
CREATE INDEX `codex_entry_progression_scene_idx` ON `codex_entry_progression` (`scene_id`);
