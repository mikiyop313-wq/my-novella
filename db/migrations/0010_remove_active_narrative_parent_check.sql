PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__nullable_chapters` (
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
INSERT INTO `__nullable_chapters` (
	`id`,
	`title`,
	`book_id`,
	`act_id`,
	`position`,
	`status`,
	`archive_parent_title`,
	`summary`
)
SELECT
	`id`,
	`title`,
	`book_id`,
	`act_id`,
	`position`,
	`status`,
	`archive_parent_title`,
	`summary`
FROM `chapters`;
--> statement-breakpoint
CREATE TABLE `__nullable_scenes` (
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
	`point_of_view_override` text,
	`pov_character_id_override` text,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__nullable_scenes` (
	`id`,
	`title`,
	`book_id`,
	`chapter_id`,
	`position`,
	`status`,
	`archive_parent_title`,
	`prose`,
	`summary`,
	`word_count`,
	`point_of_view_override`,
	`pov_character_id_override`
)
SELECT
	`id`,
	`title`,
	`book_id`,
	`chapter_id`,
	`position`,
	`status`,
	`archive_parent_title`,
	`prose`,
	`summary`,
	`word_count`,
	`point_of_view_override`,
	`pov_character_id_override`
FROM `scenes`;
--> statement-breakpoint
DROP TABLE `scenes`;
--> statement-breakpoint
DROP TABLE `chapters`;
--> statement-breakpoint
ALTER TABLE `__nullable_chapters` RENAME TO `chapters`;
--> statement-breakpoint
ALTER TABLE `__nullable_scenes` RENAME TO `scenes`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
