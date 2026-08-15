ALTER TABLE `acts` ADD `status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `chapters` ADD `status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `scenes` ADD `status` text DEFAULT 'active' NOT NULL;
