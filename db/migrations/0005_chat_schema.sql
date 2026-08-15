CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`title` text DEFAULT 'New chat' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer,
	`last_edited_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_threads_book_idx` ON `chat_threads` (`book_id`);
--> statement-breakpoint
CREATE INDEX `chat_threads_book_status_idx` ON `chat_threads` (`book_id`,`status`);
--> statement-breakpoint
CREATE INDEX `chat_threads_book_last_edited_idx` ON `chat_threads` (`book_id`,`last_edited_at`);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`position` integer NOT NULL,
	`model_id` text,
	`provider` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`reasoning_summary` text,
	`error` text,
	`created_at` integer,
	`last_edited_at` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_idx` ON `chat_messages` (`thread_id`);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_position_idx` ON `chat_messages` (`thread_id`,`position`);
--> statement-breakpoint
CREATE TABLE `chat_message_scene_refs` (
	`message_id` text NOT NULL,
	`scene_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `scene_id`),
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_message_scene_refs_scene_idx` ON `chat_message_scene_refs` (`scene_id`);
--> statement-breakpoint
CREATE TABLE `chat_message_codex_refs` (
	`message_id` text NOT NULL,
	`codex_entry_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `codex_entry_id`),
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`codex_entry_id`) REFERENCES `codex_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_message_codex_refs_entry_idx` ON `chat_message_codex_refs` (`codex_entry_id`);
