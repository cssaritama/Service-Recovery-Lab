CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`document` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_token_hash_unique` ON `workspaces` (`token_hash`);--> statement-breakpoint
CREATE INDEX `workspaces_expiry` ON `workspaces` (`expires_at`);