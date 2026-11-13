import type { DailyList, Extract, Request } from "@dsp/domain";
import { formatDate, formatMoney, LINE_STATUS_LABELS, requestLabel } from "./format.ts";
import { escapeHtml } from "./reports.ts";

/**
 * Витяг з остаточного переліку по в/ч: окремий документ на кожну в/ч, як його надсилають ініціатору.
 * Модель без розмітки: з неї будуються і перегляд та друк (HTML), і Word, тож зміст однаковий.
 */

export interface ExtractDocInput {
  readonly extract: Extract;
  /** Затверджені заявки (для назв, цін і предметів замін). */
  readonly requests: readonly Pick<Request, "id" | "lines" | "title">[];
  /** Затверджені Головою переліки (для номера СЕДО). */
  readonly lists: readonly Pick<DailyList, "requestIds" | "sedoNumber" | "date">[];
  readonly positions: readonly { readonly id: string; readonly code: string; readonly name: string; readonly priceMinor: number }[];
  readonly items: readonly { readonly code: string; readonly measure: string }[];
  readonly unitName: (id: string) => string;
}

export interface ExtractDocModel {
  readonly fileName: string;
  readonly documentTitle: string;
  readonly title: string;
  readonly subtitle: string;
  readonly basis: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly numeric: readonly number[];
  readonly total: string;
  readonly footnote: string;
}

export function extractDocModel(input: ExtractDocInput): ExtractDocModel {
  const { extract } = input;
  const unit = input.unitName(extract.unitId);
  const positionOf = new Map(input.positions.map((p) => [p.id, p]));
  const measureOf = new Map(input.items.map((i) => [i.code, i.measure]));
  const requestOf = new Map(input.requests.map((r) => [r.id, r]));
  const sedo = [...new Set(input.lists.filter((l) => l.requestIds.some((id) => extract.requestIds.includes(id))).map((l) => l.sedoNumber).filter((n) => n !== null))];

  let total = 0;
  const rows = extract.lines.map((line, index) => {
    const position = positionOf.get(line.positionId);
    const requestLine = requestOf.get(line.requestId)?.lines.find((l) => l.id === line.lineId);
    const replacement = requestLine?.kind === "replacement" ? requestLine.newItem : null;
    const code = replacement?.code || position?.code || line.positionId;
    const name = replacement ? `${replacement.name} (заміна: ${position?.name ?? line.positionId} × ${line.qty})` : (position?.name ?? line.positionId);
    // Заміна: кількість і сума нового предмета, як їх погоджено.
    const qty = replacement ? replacement.qty : line.qty;
    const sum = replacement ? replacement.totalMinor : (position?.priceMinor ?? 0) * line.qty;
    total += sum;
    return [
      String(index + 1),
      requestLabel(line.requestId),
      code,
      name,
      measureOf.get(code) ?? "шт.",
      String(qty),
      formatMoney(sum).replace(/\s?грн$/u, ""),
      LINE_STATUS_LABELS[line.status],
    ];
  });

  return {
    fileName: `Витяг ${unit} ${extract.date}.docx`,
    documentTitle: `Витяг по ${unit} від ${formatDate(extract.date)}`,
    title: "ВИТЯГ",
    subtitle: `з остаточного переліку закупівель на 2027 рік по ${unit}`,
    basis:
      `Затверджено Головою ${formatDate(extract.date)}` +
      (sedo.length > 0 ? `, СЕДО № ${sedo.join(", ")}` : "") +
      `. Заявки: ${extract.requestIds.map((id) => {
        const title = requestOf.get(id)?.title;
        return title ? `${requestLabel(id)} («${title}»)` : requestLabel(id);
      }).join(", ")}.`,
    head: ["№", "Заявка", "Код", "Найменування", "Од.", "Кількість", "Сума, грн", "Статус"],
    rows,
    numeric: [5, 6],
    total: `Разом: ${formatMoney(total)}.`,
    footnote: "Витяг сформовано системою автоматично після затвердження Головою. Позиції із заміною мають статус «Заміна погоджена» лише у витягу.",
  };
}

const cells = (values: readonly string[], numeric: readonly number[], tag: "td" | "th" = "td"): string =>
  `<tr>${values.map((c, i) => `<${tag}${tag === "td" && numeric.includes(i) ? ' class="num"' : ""}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;

/** Витяг як окремий HTML-документ для перегляду й друку (А4, шрифт службових документів). */
export function buildExtractHtml(input: ExtractDocInput): string {
  const m = extractDocModel(input);
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
  h1 { font-size: 14pt; font-weight: bold; text-align: center; letter-spacing: 0.15em; margin: 0; }
  .subtitle { text-align: center; margin: 0.1cm 0 0.5cm; }
  p { margin: 0 0 0.2cm; text-align: justify; }
  table { border-collapse: collapse; width: 100%; font-size: 11pt; line-height: 1.25; margin-top: 0.3cm; }
  th, td { border: 1px solid CanvasText; padding: 0.08cm 0.15cm; vertical-align: top; text-align: left; }
  th { font-weight: bold; text-align: center; }
  td.num { text-align: right; white-space: nowrap; }
  tr { break-inside: avoid; }
  .total { margin-top: 0.25cm; font-weight: bold; }
  .footnote { margin-top: 1cm; font-size: 10pt; }
</style>
</head>
<body>
  <h1>${escapeHtml(m.title)}</h1>
  <p class="subtitle">${escapeHtml(m.subtitle)}</p>
  <p>${escapeHtml(m.basis)}</p>
  <table>
    <thead>${cells(m.head, m.numeric, "th")}</thead>
    <tbody>${m.rows.map((r) => cells(r, m.numeric)).join("")}</tbody>
  </table>
  <p class="total">${escapeHtml(m.total)}</p>
  <p class="footnote">${escapeHtml(m.footnote)}</p>
</body>
</html>`;
}
