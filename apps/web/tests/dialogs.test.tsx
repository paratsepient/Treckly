import "./setup.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { ReturnDialog } from "../src/components/ReturnDialog.tsx";
import { SedoDialog } from "../src/components/SedoDialog.tsx";
import { axeViolations, click, render, setValue } from "./helpers.tsx";

const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const button = (root: ParentNode, label: string) => [...root.querySelectorAll("button")].find((b) => text(b).includes(label)) as HTMLButtonElement;

// ── Повернення ────────────────────────────────────────────────────────────────

function returnDialog(props: Partial<Parameters<typeof ReturnDialog>[0]> = {}) {
  const calls: string[] = [];
  const ui = <ReturnDialog open label="ЗМ-0004" level={3} pending={false} onClose={() => calls.push("close")} onConfirm={(note) => calls.push(`confirm:${note}`)} {...props} />;
  return { ui, calls };
}

test("повернення: порожня примітка не надсилається, показується пояснення", () => {
  const { ui, calls } = returnDialog();
  const { unmount } = render(ui);
  const dialog = document.querySelector("dialog[open]")!;
  click(button(dialog, "Повернути автору"));
  assert.deepEqual(calls, [], "без примітки підтвердження не відбувається");
  assert.match(text(dialog), /Примітка обов'язкова/);
  setValue(dialog.querySelector("textarea")!, "   ");
  click(button(dialog, "Повернути автору"));
  assert.deepEqual(calls, [], "лише пробіли — теж порожньо");
  unmount();
});

test("повернення: примітка очищується від зайвих пробілів і передається; поле позначене обов'язковим", () => {
  const { ui, calls } = returnDialog();
  const { unmount } = render(ui);
  const dialog = document.querySelector("dialog[open]")!;
  const field = dialog.querySelector("textarea")!;
  assert.equal(field.required, true);
  setValue(field, "  Уточніть кількість  ");
  click(button(dialog, "Повернути автору"));
  assert.deepEqual(calls, ["confirm:Уточніть кількість"]);
  unmount();
});

test("повернення: пояснює наслідки залежно від рівня; відповідь сервера показується під полем", () => {
  const level3 = returnDialog();
  let view = render(level3.ui);
  assert.match(text(document.querySelector("dialog[open]")), /Автор і рівні від 1 до 2 отримають сповіщення/);
  view.unmount();
  view = render(returnDialog({ level: 2 }).ui);
  assert.match(text(document.querySelector("dialog[open]")), /Автор і рівень 1 отримають сповіщення/);
  assert.doesNotMatch(text(document.querySelector("dialog[open]")), /від 1 до 1/);
  view.unmount();
  view = render(returnDialog({ level: 1 }).ui);
  assert.match(text(document.querySelector("dialog[open]")), /Автор отримає сповіщення/);
  assert.doesNotMatch(text(document.querySelector("dialog[open]")), /рівні від/);
  view.unmount();
  view = render(returnDialog({ error: "Примітка до повернення обов'язкова." }).ui);
  assert.match(text(document.querySelector("dialog[open] .ix-field__error, dialog[open] [id$='-error']")), /обов'язкова/);
  view.unmount();
});

test("повернення: «Не повертати» закриває діалог без дій; закритий діалог нічого не показує", () => {
  const { ui, calls } = returnDialog();
  let view = render(ui);
  click(button(document.querySelector("dialog[open]")!, "Не повертати"));
  assert.deepEqual(calls, ["close"]);
  view.unmount();
  view = render(returnDialog({ open: false }).ui);
  assert.equal(document.querySelector("dialog[open]"), null);
  view.unmount();
});

test("повернення: примітка не переходить із однієї заявки на іншу", () => {
  const first = returnDialog({ label: "ЗМ-0001" });
  const view = render(first.ui);
  setValue(document.querySelector("dialog[open] textarea")!, "Чернетка примітки");
  view.unmount();
  const second = render(returnDialog({ label: "ЗМ-0002" }).ui);
  assert.equal((document.querySelector("dialog[open] textarea") as HTMLTextAreaElement).value, "");
  second.unmount();
});

test("axe: діалог повернення", async () => {
  const { unmount } = render(returnDialog().ui);
  assert.deepEqual(await axeViolations(document.body), []);
  unmount();
});

// ── СЕДО ──────────────────────────────────────────────────────────────────────

function sedoDialog(props: Partial<Parameters<typeof SedoDialog>[0]> = {}) {
  const calls: string[] = [];
  const ui = <SedoDialog open final={false} requestCount={2} totalText="82 000,00 ₴" pending={false} onClose={() => calls.push("close")} onConfirm={(n) => calls.push(`confirm:${n}`)} {...props} />;
  return { ui, calls };
}

test("СЕДО: без номера погодити не можна; номер передається як введено — формат перевіряє домен", () => {
  const { ui, calls } = sedoDialog();
  const { unmount } = render(ui);
  const dialog = document.querySelector("dialog[open]")!;
  const approve = button(dialog, "Погодити");
  assert.equal(approve.getAttribute("aria-disabled") === "true" || approve.disabled, true, "порожнє поле — кнопка неактивна");
  click(approve);
  assert.deepEqual(calls, []);
  setValue(dialog.querySelector("input")!, "7240001");
  click(button(dialog, "Погодити"));
  assert.deepEqual(calls, ["confirm:7240001"]);
  unmount();
});

test("СЕДО: нечисловий ввід теж іде на сервер, а його відповідь показується під полем", () => {
  const { ui, calls } = sedoDialog({ error: "Номер СЕДО — число (цифри без пробілів і літер)." });
  const { unmount } = render(ui);
  const dialog = document.querySelector("dialog[open]")!;
  setValue(dialog.querySelector("input")!, "abc");
  click(button(dialog, "Погодити"));
  assert.deepEqual(calls, ["confirm:abc"]);
  assert.match(text(dialog), /Номер СЕДО — число/);
  assert.equal(dialog.querySelector("input")!.getAttribute("aria-invalid"), "true");
  unmount();
});

test("СЕДО: рівень 5 — Відділ відмічає «Підписано Головою» з наслідками (резерв, витяги); інші рівні — «Погодити» без часткового погодження", () => {
  let view = render(sedoDialog({ final: true }).ui);
  let dialog = document.querySelector("dialog[open]")!;
  assert.match(text(dialog), /Відмітити підпис Голови/);
  assert.match(text(dialog), /резервує бюджет і формує витяги/);
  assert.ok(button(dialog, "Підписано Головою"));
  view.unmount();
  view = render(sedoDialog().ui);
  dialog = document.querySelector("dialog[open]")!;
  assert.match(text(dialog), /Часткового погодження немає/);
  assert.match(text(dialog), /Заявок: 2, на суму 82 000,00 ₴/);
  view.unmount();
});

test("СЕДО: номер не лишається від попереднього переліку", () => {
  let view = render(sedoDialog().ui);
  setValue(document.querySelector("dialog[open] input")!, "123");
  view.unmount();
  view = render(sedoDialog().ui);
  assert.equal((document.querySelector("dialog[open] input") as HTMLInputElement).value, "");
  view.unmount();
});

test("axe: діалог СЕДО", async () => {
  const { unmount } = render(sedoDialog().ui);
  assert.deepEqual(await axeViolations(document.body), []);
  unmount();
});
