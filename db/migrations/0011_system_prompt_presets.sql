CREATE TABLE `system_prompt_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`category` text NOT NULL,
	`scope` text NOT NULL,
	`book_id` text,
	`temperature` real DEFAULT 0.5 NOT NULL,
	`top_p` real DEFAULT 1 NOT NULL,
	`max_output_tokens` integer,
	`presence_penalty` real DEFAULT 0 NOT NULL,
	`frequency_penalty` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_edited_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `system_prompt_presets_scope_book_category_idx`
	ON `system_prompt_presets` (`scope`, `book_id`, `category`);
