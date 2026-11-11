import type { Request } from "@dsp/domain";
import { formatDate, formatMoney, requestLabel } from "./format.ts";
import { escapeHtml } from "./reports.ts";
import { requestTotal } from "./totals.ts";

/**
 * Рапорт за заявкою. Автор уводить лише позиції й обґрунтування, усе інше дає шаблон:
 * адресат (керівник першого рівня), текст прохання, таблиці, підсумок за КЕКВ і підпис.
 * Модель без розмітки: з неї будуються і друк (HTML), і Word (.docx), тож зміст однаковий.
 * Форму підтвердив користувач (2026-11-11): змінювати лише за його зразком.
 */

export interface RaportInput {
  readonly request: Pick<Request, "id" | "version" | "status" | "route" | "lines" | "justification" | "createdOn">;
  /** Автор: ПІБ у порядку «Прізвище Ім'я По батькові» і посада. */
  readonly author: { readonly name: string; readonly title: string } | undefined;
  readonly unitName: (id: string) => string;
  readonly positions: readonly { readonly id: string; readonly code: string; readonly name: string; readonly kekv: string; readonly priceMinor: number }[];
  /** Довідник предметів: одиниця виміру за кодом. */
  readonly items: readonly { readonly code: string; readonly measure: string }[];
  /** Дата рапорту: для чернетки — сьогодні, для поданої заявки — дата створення. */
  readonly date: string;
}

export interface RaportTable {
  readonly heading: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Номери стовпців із числами: вирівнюються праворуч. */
  readonly numeric: readonly number[];
}

export interface RaportModel {
  readonly fileName: string;
  readonly documentTitle: string;
  /** Адресат праворуч угорі, по рядку. */
  readonly addressee: readonly string[];
  readonly title: string;
  readonly request: string;
  /** Заміни стоять на початку рапорту, як і зараз у паперовій формі. */
  readonly tables: readonly RaportTable[];
  readonly total: string;
  readonly byKekv: string;
  readonly justificationHeading: string;
  /** Абзаци обґрунтування; порожній масив — автор ще не написав. */
  readonly justification: readonly string[];
  readonly signature: { readonly position: string; readonly rank: string; readonly name: string; readonly date: string };
  readonly footnote: string;
}

/** «в/ч А0001» → «військової частини А0001» (родовий відмінок для адресата). */
const unitGenitive = (name: string): string => name.replace(/^в\/ч\s+/u, "військової частини ");

/** «Прізвище Ім'я По батькові» → «Ім'я ПРІЗВИЩЕ», як у підписі службових документів. */
export function signatureName(fullName: string): string {
  const [surname, given] = fullName.trim().split(/\s+/u);
  if (!surname || !given) return fullName.trim();
  return `${given} ${surname.toLocaleUpperCase("uk-UA")}`;
}

/** «Напрямок …» усередині речення пишеться з малої літери. */
const lowerFirst = (value: string): string => value.charAt(0).toLocaleLowerCase("uk-UA") + value.slice(1);

const NUM = (value: number): string => new Intl.NumberFormat("uk-UA").format(value);
const MONEY = (minor: number): string => formatMoney(minor).replace(/\s?грн$/u, "").trim();

export function raportModel(input: RaportInput): RaportModel {
  const { request } = input;
  const positionOf = new Map(input.positions.map((p) => [p.id, p]));
  const measureOf = new Map(input.items.map((i) => [i.code, i.measure]));
  const unit = input.unitName(request.route[0]);
  const direction = input.unitName(request.route[3]);
  const label = requestLabel(request.id);

  const replacements = request.lines.filter((l) => l.kind === "replacement");
  const byList = request.lines.filter((l) => l.kind === "by_list");
  const kekvTotals = new Map<string, number>();
  const add = (kekv: string, sum: number) => kekvTotals.set(kekv, (kekvTotals.get(kekv) ?? 0) + sum);

  const replacementRows = replacements.map((line, index) => {
    if (line.kind !== "replacement") return [];
    const planned = positionOf.get(line.positionId);
    const sum = line.newItem.priceMinor * line.qty;
    add(line.newItem.kekv, sum);
    return [
      String(index + 1),
      planned ? `${planned.code} · ${planned.name}` : line.positionId,
      `${line.newItem.code} · ${line.newItem.name}`,
      measureOf.get(line.newItem.code) ?? "шт.",
      NUM(line.qty),
      line.newItem.kekv,
      MONEY(sum),
    ];
  });

  const listRows = byList.map((line, index) => {
    const position = positionOf.get(line.positionId);
    const price = position?.priceMinor ?? 0;
    const sum = price * line.qty;
    add(line.kekv, sum);
    return [
      String(index + 1),
      position?.code ?? line.positionId,
      position?.name ?? "—",
      measureOf.get(position?.code ?? "") ?? "шт.",
      NUM(line.qty),
      MONEY(price),
      MONEY(sum),
      line.kekv,
    ];
  });

  const tables: RaportTable[] = [];
  if (replacementRows.length > 0) {
    tables.push({
      heading: "1. Заміни позицій Попереднього переліку",
      head: ["№", "Позиція переліку, що замінюється", "Предмет натомість", "Од. виміру", "Кількість", "КЕКВ", "Сума, грн"],
      rows: replacementRows,
      numeric: [4, 6],
    });
  }
  if (listRows.length > 0) {
    tables.push({
      heading: `${tables.length + 1}. Позиції за Попереднім переліком`,
      head: ["№", "Код", "Найменування", "Од. виміру", "Кількість", "Ціна, грн", "Сума, грн", "КЕКВ"],
      rows: listRows,
      numeric: [4, 5, 6],
    });
  }

  const total = requestTotal(request, input.positions);
  const author = input.author;
  const paragraphs = request.justification
    .split(/\n+/u)
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    fileName: `Рапорт ${label}${request.version > 1 ? ` версія ${request.version}` : ""}.docx`,
    documentTitle: `Рапорт ${label}`,
    addressee: [`Командиру ${unitGenitive(unit)}`],
    title: "РАПОРТ",
    request:
      `Прошу Вашого погодження закупівлі майна для потреб ${unit} за Попереднім переліком на 2027 рік, ` +
      `${lowerFirst(direction)}, у кількості та на суму, наведені нижче.` +
      (replacementRows.length > 0 ? " Позиції, яких немає в переліку, подано як заміни на схожі заплановані." : ""),
    tables,
    total: `Разом: ${formatMoney(total)}.`,
    byKekv:
      kekvTotals.size > 1
        ? `У тому числі за КЕКВ: ${[...kekvTotals].sort(([a], [b]) => a.localeCompare(b)).map(([kekv, sum]) => `${kekv} — ${formatMoney(sum)}`).join("; ")}.`
        : "",
    justificationHeading: "Обґрунтування",
    justification: paragraphs,
    signature: {
      position: author ? `${author.title} ${unit}` : unit,
      rank: "_______________ (військове звання)",
      name: author ? signatureName(author.name) : "_______________",
      date: formatDate(input.date),
    },
    footnote: `Номер у системі ${label}, версія ${request.version}. Реєстраційний номер СЕДО вноситься після реєстрації.`,
  };
}

const cellsHtml = (values: readonly string[], numeric: readonly number[], tag: "td" | "th" = "td"): string =>
  `<tr>${values.map((c, i) => `<${tag}${tag === "td" && numeric.includes(i) ? ' class="num"' : ""}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;

/** Рапорт як окремий HTML-документ для перегляду й друку (А4, шрифт службових документів). */
export function buildRaportHtml(input: RaportInput): string {
  const m = raportModel(input);
  const tables = m.tables
    .map(
      (t) => `
  <h2>${escapeHtml(t.heading)}</h2>
  <table>
    <thead>${cellsHtml(t.head, t.numeric, "th")}</thead>
    <tbody>${t.rows.map((r) => cellsHtml(r, t.numeric)).join("")}</tbody>
  </table>`,
    )
    .join("");
  const justification =
    m.justification.length > 0
      ? m.justification.map((p) => `<p class="indent">${escapeHtml(p)}</p>`).join("")
      : `<p class="indent missing">Обґрунтування ще не написано.</p>`;

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<title>${escapeHtml(m.documentTitle)}</title>
<style>
  @page { size: A4; margin: 2cm 1.5cm 2cm 3cm; }
  html { color-scheme: light; }
  body { font: 14pt/1.35 "Times New Roman", Times, serif; margin: 0; padding: 1.2cm 1.5cm 1.5cm 2cm; color: CanvasText; background: Canvas; }
  @media print { body { padding: 0; } }
  .addressee { margin: 0 0 1.2cm 50%; }
  .addressee p { margin: 0; text-align: left; }
  h1 { font-size: 14pt; font-weight: bold; text-align: center; letter-spacing: 0.15em; margin: 0 0 0.5cm; }
  h2 { font-size: 13pt; font-weight: bold; margin: 0.5cm 0 0.15cm; }
  p { margin: 0 0 0.2cm; text-align: justify; }
  .indent { text-indent: 1.25cm; }
  .missing { font-style: italic; }
  table { border-collapse: collapse; width: 100%; font-size: 11pt; line-height: 1.25; }
  th, td { border: 1px solid CanvasText; padding: 0.08cm 0.15cm; vertical-align: top; text-align: left; }
  th { font-weight: bold; text-align: center; }
  td.num { text-align: right; white-space: nowrap; }
  tr { break-inside: avoid; }
  .total { margin-top: 0.25cm; }
  .signature { display: grid; grid-template-columns: 1fr auto; gap: 0.1cm 1cm; margin-top: 1.2cm; break-inside: avoid; }
  .signature p { margin: 0; text-align: left; }
  .signature .name { text-align: right; align-self: end; }
  .footnote { margin-top: 1cm; font-size: 10pt; }
</style>
</head>
<body>
  <div class="addressee">${m.addressee.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
  <h1>${escapeHtml(m.title)}</h1>
  <p class="indent">${escapeHtml(m.request)}</p>
  ${tables}
  <p class="total"><strong>${escapeHtml(m.total)}</strong>${m.byKekv ? ` ${escapeHtml(m.byKekv)}` : ""}</p>
  <h2>${escapeHtml(m.justificationHeading)}</h2>
  ${justification}
  <div class="signature">
    <p>${escapeHtml(m.signature.position)}</p><p></p>
    <p>${escapeHtml(m.signature.rank)}</p><p class="name">${escapeHtml(m.signature.name)}</p>
    <p>${escapeHtml(m.signature.date)}</p><p></p>
  </div>
  <p class="footnote">${escapeHtml(m.footnote)}</p>
</body>
</html>`;
}
