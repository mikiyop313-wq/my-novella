CREATE TABLE `book_settings` (
	`book_setting_id` text PRIMARY KEY NOT NULL,
	`language` text DEFAULT 'english' NOT NULL,
	`prose_tense` text DEFAULT 'past' NOT NULL,
	`point_of_view` text DEFAULT 'third_limited' NOT NULL,
	`synopsis_ai_context` integer DEFAULT true NOT NULL,
	`pov_character_id` text,
	`embedding_model` text DEFAULT 'local' NOT NULL,
	`local_embedding_model` text DEFAULT 'mixedbread-ai/mxbai-embed-large-v1' NOT NULL,
	`openrouter_embedding_model` text,
	`vector_search_enabled` integer DEFAULT true NOT NULL,
	`automatic_indexing_enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`book_setting_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`language`) REFERENCES `language`(`language_name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `language` (
	`language_name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subcategories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`parent_category_id` text NOT NULL,
	FOREIGN KEY (`parent_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subcategories_name_parent_category_id_unique` ON `subcategories` (`name`,`parent_category_id`);--> statement-breakpoint
CREATE TABLE `chat_branch_selections` (
	`thread_id` text NOT NULL,
	`branch_group_id` text NOT NULL,
	`selected_message_id` text NOT NULL,
	PRIMARY KEY(`thread_id`, `branch_group_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selected_message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_branch_selections_selected_idx` ON `chat_branch_selections` (`selected_message_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`parent_message_id` text,
	`branch_group_id` text NOT NULL,
	`branch_order` integer DEFAULT 0 NOT NULL,
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
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_idx` ON `chat_messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_thread_position_idx` ON `chat_messages` (`thread_id`,`position`);--> statement-breakpoint
CREATE INDEX `chat_messages_parent_idx` ON `chat_messages` (`parent_message_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_branch_group_idx` ON `chat_messages` (`thread_id`,`branch_group_id`);--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`title` text DEFAULT 'New chat' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_model_id` text,
	`created_at` integer,
	`last_edited_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_threads_book_idx` ON `chat_threads` (`book_id`);--> statement-breakpoint
CREATE INDEX `chat_threads_book_status_idx` ON `chat_threads` (`book_id`,`status`);--> statement-breakpoint
CREATE INDEX `chat_threads_book_last_edited_idx` ON `chat_threads` (`book_id`,`last_edited_at`);--> statement-breakpoint
CREATE TABLE `codex_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`type` text DEFAULT 'character' NOT NULL,
	`name` text NOT NULL,
	`alias` text,
	`description` text,
	`image` blob,
	`status` text DEFAULT 'active' NOT NULL,
	`tracking_setting` text DEFAULT 'include_when_detected' NOT NULL,
	`created_at` integer,
	`last_edited_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `codex_entries_book_type_idx` ON `codex_entries` (`book_id`,`type`);--> statement-breakpoint
CREATE INDEX `codex_entries_book_name_idx` ON `codex_entries` (`book_id`,`name`);--> statement-breakpoint
CREATE TABLE `codex_entry_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`codex_entry_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer,
	`last_edited_at` integer,
	FOREIGN KEY (`codex_entry_id`) REFERENCES `codex_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `codex_entry_notes_entry_idx` ON `codex_entry_notes` (`codex_entry_id`);--> statement-breakpoint
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
CREATE INDEX `codex_entry_progression_entry_idx` ON `codex_entry_progression` (`codex_entry_id`);--> statement-breakpoint
CREATE INDEX `codex_entry_progression_scene_idx` ON `codex_entry_progression` (`scene_id`);--> statement-breakpoint
CREATE TABLE `acts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`book_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`summary` text,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`book_id` text NOT NULL,
	`act_id` text,
	`position` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`archive_parent_title` text,
	`summary` text,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`act_id`) REFERENCES `acts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter_id` text,
	`position` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`archive_parent_title` text,
	`prose` text,
	`summary` text,
	`word_count` integer DEFAULT 0,
	`include_in_context` integer DEFAULT true NOT NULL,
	`point_of_view_override` text,
	`pov_character_id_override` text,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `active_system_prompt_presets` (
	`book_id` text NOT NULL,
	`category` text NOT NULL,
	`preset_id` text NOT NULL,
	PRIMARY KEY(`book_id`, `category`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preset_id`) REFERENCES `system_prompt_presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `active_system_prompt_presets_preset_idx` ON `active_system_prompt_presets` (`preset_id`);--> statement-breakpoint
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
	`default_model_id` text,
	`created_at` integer NOT NULL,
	`last_edited_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "system_prompt_presets_scope_book_check" CHECK(("system_prompt_presets"."scope" = 'global' AND "system_prompt_presets"."book_id" IS NULL) OR ("system_prompt_presets"."scope" = 'book' AND "system_prompt_presets"."book_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `system_prompt_presets_scope_book_category_idx` ON `system_prompt_presets` (`scope`,`book_id`,`category`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_book_tags` (
	`book_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`book_id`, `category_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_book_tags`("book_id", "category_id") SELECT "book_id", "category_id" FROM `book_tags`;--> statement-breakpoint
DROP TABLE `book_tags`;--> statement-breakpoint
ALTER TABLE `__new_book_tags` RENAME TO `book_tags`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`synopsis` text,
	`language` text DEFAULT 'english' NOT NULL,
	`cover_image` blob,
	`word_count` integer,
	`created_at` integer,
	`last_edited_at` integer,
	FOREIGN KEY (`language`) REFERENCES `language`(`language_name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_books`("id", "title", "author", "status", "synopsis", "language", "cover_image", "word_count", "created_at", "last_edited_at") SELECT "id", "title", "author", "status", "synopsis", "language", "cover_image", "word_count", "created_at", "last_edited_at" FROM `books`;--> statement-breakpoint
DROP TABLE `books`;--> statement-breakpoint
ALTER TABLE `__new_books` RENAME TO `books`;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "name", "type", "is_custom") SELECT "id", "name", "type", "is_custom" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_type_unique` ON `categories` (`name`,`type`);