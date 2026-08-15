ALTER TABLE `chat_messages` ADD `parent_message_id` text REFERENCES `chat_messages`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `branch_group_id` text;
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `branch_order` integer;
--> statement-breakpoint
UPDATE `chat_messages`
SET `branch_group_id` = (
  SELECT `first_message`.`id`
  FROM `chat_messages` AS `first_message`
  WHERE `first_message`.`thread_id` = `chat_messages`.`thread_id`
    AND `first_message`.`role` = `chat_messages`.`role`
    AND `first_message`.`position` = `chat_messages`.`position`
  ORDER BY `first_message`.`created_at`, `first_message`.`id`
  LIMIT 1
);
--> statement-breakpoint
WITH `ranked_messages` AS (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      PARTITION BY `thread_id`, `role`, `position`
      ORDER BY `created_at`, `id`
    ) - 1 AS `branch_order`
  FROM `chat_messages`
)
UPDATE `chat_messages`
SET `branch_order` = (
  SELECT `ranked_messages`.`branch_order`
  FROM `ranked_messages`
  WHERE `ranked_messages`.`id` = `chat_messages`.`id`
);
--> statement-breakpoint
UPDATE `chat_messages`
SET `parent_message_id` = (
  SELECT `parent_message`.`id`
  FROM `chat_messages` AS `parent_message`
  WHERE `parent_message`.`thread_id` = `chat_messages`.`thread_id`
    AND `parent_message`.`position` = (
      SELECT MAX(`previous_message`.`position`)
      FROM `chat_messages` AS `previous_message`
      WHERE `previous_message`.`thread_id` = `chat_messages`.`thread_id`
        AND `previous_message`.`position` < `chat_messages`.`position`
    )
  ORDER BY `parent_message`.`created_at`, `parent_message`.`id`
  LIMIT 1
)
WHERE `position` > 0;
--> statement-breakpoint
CREATE INDEX `chat_messages_parent_idx` ON `chat_messages` (`parent_message_id`);
--> statement-breakpoint
CREATE INDEX `chat_messages_branch_group_idx` ON `chat_messages` (`thread_id`, `branch_group_id`);
--> statement-breakpoint
CREATE TABLE `chat_branch_selections` (
  `thread_id` text NOT NULL,
  `branch_group_id` text NOT NULL,
  `selected_message_id` text NOT NULL,
  PRIMARY KEY(`thread_id`, `branch_group_id`),
  FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`selected_message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_branch_selections_selected_idx` ON `chat_branch_selections` (`selected_message_id`);
--> statement-breakpoint
INSERT INTO `chat_branch_selections` (`thread_id`, `branch_group_id`, `selected_message_id`)
SELECT
  `message_groups`.`thread_id`,
  `message_groups`.`branch_group_id`,
  (
    SELECT `selected_message`.`id`
    FROM `chat_messages` AS `selected_message`
    WHERE `selected_message`.`thread_id` = `message_groups`.`thread_id`
      AND `selected_message`.`branch_group_id` = `message_groups`.`branch_group_id`
    ORDER BY `selected_message`.`branch_order`, `selected_message`.`created_at`, `selected_message`.`id`
    LIMIT 1
  ) AS `selected_message_id`
FROM (
  SELECT `thread_id`, `branch_group_id`
  FROM `chat_messages`
  WHERE `branch_group_id` IS NOT NULL
  GROUP BY `thread_id`, `branch_group_id`
) AS `message_groups`;
