CREATE TABLE `book_tags` (
	`book_id` text NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`book_id`, `category_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`status` text NOT NULL,
	`genre` text,
	`cover_image` blob,
	`created_at` integer,
	`last_edited_at` integer
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text,
	`sort_order` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_type_unique` ON `categories` (`name`,`type`);