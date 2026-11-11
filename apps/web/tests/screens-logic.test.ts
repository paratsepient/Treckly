import assert from "node:assert/strict";
import test from "node:test";
import { journalText } from "../src/lib/journal-text.ts";
import { notificationTarget, notificationText, type NotificationLike } from "../src/lib/notification-text.ts";
import { requestTotal } from "../src/lib/totals.ts";

const note = (kind: NotificationLike["kind"], audience: NotificationLike["audience"]["kind"], text: string | null = null): NotificationLike => ({
  kind,
  audience: { kind: audience },
  requestId: "req-0004",
  note: text,
});

test("сповіщення: повернуту заявку автору й нижчим рівням розповідають по-різному, примітка — деталлю", () => {
  const forAuthor = notificationText(note("request_returned", "author", "Уточніть кількість"));
  assert.equal(forAuthor.title, "ЗМ-0004: заявку повернуто вам");
  assert.equal(forAuthor.detail, "Примітка: Уточніть кількість");
  const forLevel = notificationText(note("request_returned", "level", "Уточніть кількість"));
  assert.equal(forLevel.title, "ЗМ-0004: заявку повернуто автору");
  assert.equal(notificationText(note("request_returned", "author")).detail, null, "без примітки деталі немає");
});

test("сповіщення: кожен вид має власний текст із номером заявки; нагадування несе лічильник днів", () => {
  const kinds = ["request_submitted", "request_advanced", "list_formed", "request_returned", "request_withdrawn", "request_approved", "extract_issued", "reminder"] as const;
  const titles = kinds.map((k) => notificationText(note(k, "level")).title);
  assert.equal(new Set(titles).size, kinds.length, "тексти різні");
  assert.ok(titles.every((t) => t.startsWith("ЗМ-0004:")));
  assert.equal(notificationText(note("reminder", "level", "Днів на рівні: 7")).detail, "Днів на рівні: 7");
});

test("сповіщення: куди веде — автору до його заявки, уповноваженому до черги, керівнику до переліків", () => {
  const n = note("request_advanced", "level");
  assert.equal(notificationTarget(n, "author"), "#/my?selected=req-0004");
  assert.equal(notificationTarget(n, "preparer"), "#/queue");
  assert.equal(notificationTarget(n, "approver"), "#/lists");
});

test("журнал: усі типи подій домену мають людський текст, невідомий показується як є", () => {
  const known = ["request.created", "request.edited", "request.submitted", "request.resubmitted", "request.listed", "request.delisted", "request.advanced", "request.approved", "request.returned", "request.withdrawn", "request.extract_issued", "list.formed", "list.disbanded", "list.approved"];
  for (const type of known) assert.notEqual(journalText(type), type, type);
  assert.equal(journalText("щось.нове"), "щось.нове");
});

test("сума заявки: за переліком — ціна позиції, заміна — ціна нового предмета; невідома позиція не додає нічого", () => {
  const positions = [{ id: "p1", priceMinor: 100_00 }];
  const lines = [
    { kind: "by_list" as const, id: "a", positionId: "p1", qty: 3, kekv: "2210" },
    { kind: "replacement" as const, id: "b", positionId: "p1", qty: 2, kekv: "2210", newItem: { code: "N", name: "Н", kekv: "3110", priceMinor: 900_00 } },
    { kind: "by_list" as const, id: "c", positionId: "p-unknown", qty: 5, kekv: "2210" },
  ];
  assert.equal(requestTotal({ lines }, positions), 3 * 100_00 + 2 * 900_00);
  assert.equal(requestTotal({ lines: [] }, positions), 0);
});
