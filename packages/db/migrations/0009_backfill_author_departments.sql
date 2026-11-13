-- Автори без відділу отримують перший відділ своєї в/ч: служба заявки береться з профілю (рішення користувача 2026-11-13).
UPDATE "users" SET "department_id" = (SELECT "id" FROM "units" WHERE "units"."kind" = 'department' AND "units"."parent_id" = "users"."unit_id" ORDER BY "units"."id" LIMIT 1) WHERE "role_kind" = 'author' AND "department_id" IS NULL;
