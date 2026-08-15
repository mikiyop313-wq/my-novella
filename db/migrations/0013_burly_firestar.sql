PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_book_settings` (
	`book_setting_id` text PRIMARY KEY NOT NULL,
	`language` text DEFAULT 'english' NOT NULL,
	`prose_tense` text DEFAULT 'past' NOT NULL,
	`point_of_view` text DEFAULT 'third_limited' NOT NULL,
	`synopsis_ai_context` integer DEFAULT true NOT NULL,
	`pov_character_id` text,
	`embedding_model` text,
	`local_embedding_model` text,
	`openrouter_embedding_model` text,
	`vector_search_enabled` integer DEFAULT true NOT NULL,
	`automatic_indexing_enabled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`book_setting_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`language`) REFERENCES `language`(`language_name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_book_settings`("book_setting_id", "language", "prose_tense", "point_of_view", "synopsis_ai_context", "pov_character_id", "embedding_model", "local_embedding_model", "openrouter_embedding_model", "vector_search_enabled", "automatic_indexing_enabled") SELECT "book_setting_id", "language", "prose_tense", "point_of_view", "synopsis_ai_context", "pov_character_id", "embedding_model", "local_embedding_model", "openrouter_embedding_model", "vector_search_enabled", "automatic_indexing_enabled" FROM `book_settings`;--> statement-breakpoint
DROP TABLE `book_settings`;--> statement-breakpoint
ALTER TABLE `__new_book_settings` RENAME TO `book_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;