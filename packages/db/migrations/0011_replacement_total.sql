-- Заміна тепер має кількість і суму нового предмета (рішення користувача 2026-11-13): старі рядки «ціна за штуку»
-- перетворюються на суму за тією самою кількістю.
UPDATE "request_lines"
SET "new_item" = ("new_item" - 'priceMinor') || jsonb_build_object('qty', "qty", 'totalMinor', ("new_item"->>'priceMinor')::bigint * "qty", 'measure', 'шт.')
WHERE "kind" = 'replacement' AND "new_item" ? 'priceMinor';
