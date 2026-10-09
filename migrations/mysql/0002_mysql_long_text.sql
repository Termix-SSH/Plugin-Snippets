-- snippets 0002: mysql_long_text
-- TEXT caps at 64KB on MySQL, too small for a long script or note.

ALTER TABLE `p_snippets_snippets` MODIFY COLUMN `content` longtext NOT NULL;
