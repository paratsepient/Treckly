import type { DailyList, Request } from "@dsp/domain";
import { formatDate, formatMoney, requestLabel } from "./format.ts";
import { escapeHtml } from "./reports.ts";
import { requestTotal } from "./totals.ts";

/**
 * Денний перелік рівня як документ: його реєструють у СЕДО й погоджує керівник рівня.
 * Модель без розмітки: з неї будуються і перегляд та друк (HTML), і Word.
 */

export interface ListDocInput {
  readonly list: Pick<DailyList, "id" | "level" | "unitId" | "date" | "status" | "requestIds" | "sedoNumber" | "formedBy" | "approvedBy">;
  readonly requests: readonly Pick<Request, "id" | "route" | "lines" | "title">[];
  readonly positions: readonly { readonly id: string; readonly priceMinor: number }[];
  readonly unitName: (id: string) => string;
  readonly userName: (id: string) => string;
  readonly levelName: string;
}

export interface ListDocModel {
  readonly fileName: string;
  readonly documentTitle: string;
  readonly title: string;
  readonly subtitle: string;
  readonly basis: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly numeric: readonly number[];
  readonly total: string;
  readonly signature: string;
}

export function listDocModel(input: ListDocInput): ListDocModel {
  const { list } = input;
  const byId = new Map(input.requests.map((r) => [r.id, r]));
  let total = 0;
  const rows = list.requestIds.map((id, index) => {
    const request = byId.get(id);
    const sum = request ? requestTotal(request, input.positions) : 0;
    total += sum;
    return [
      String(index + 1),
      requestLabel(id),
      request?.title || "—",
      request ? input.unitName(request.route[0]) : "—",
      request ? String(request.lines.length) : "—",
      formatMoney(sum).replace(/\s?грн$/u, ""),
    ];
  });
  const unit = input.unitName(list.unitId);
  const approved = list.status === "approved";
  return {
    fileName: `Перелік ${unit} ${list.date}.docx`,
    documentTitle: `Денний перелік ${unit} від ${formatDate(list.date)}`,
    title: "ПЕРЕЛІК",
    subtitle: `заявок, погоджених на рівні ${list.level} (${input.levelName}), ${unit}, від ${formatDate(list.date)}`,
    basis:
      `Сформував: ${input.userName(list.formedBy)}. ` +
      (approved ? `Погоджено${list.approvedBy ? `: ${input.userName(list.approvedBy)}` : ""}, СЕДО № ${list.sedoNumber ?? "—"}.` : "Чекає погодження керівника рівня."),
    head: ["№", "Заявка", "Назва", "в/ч", "Рядків", "Сума, грн"],
    rows,
    numeric: [4, 5],
    total: `Разом: ${formatMoney(total)}, заявок ${list.requestIds.length}.`,
    signature: approved ? "Погоджено в СЕДО; номер внесено в систему." : "_______________ (підпис керівника рівня)",
  };
}

const cells = (values: readonly string[], numeric: readonly number[], tag: "td" | "th" = "td"): string =>
  `<tr>${values.map((c, i) => `<${tag}${tag === "td" && numeric.includes(i) ? ' class="num"' : ""}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;

/** Денний перелік як окремий HTML-документ для перегляду й друку (А4). */
export function buildListHtml(input: ListDocInput): string {
  const m = listDocModel(input);
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
  p { margin: 0 0 0.2cm; }
  table { border-collapse: collapse; width: 100%; font-size: 11pt; line-height: 1.25; margin-top: 0.3cm; }
  th, td { border: 1px solid CanvasText; padding: 0.08cm 0.15cm; vertical-align: top; text-align: left; }
  th { font-weight: bold; text-align: center; }
  td.num { text-align: right; white-space: nowrap; }
  .total { margin-top: 0.25cm; font-weight: bold; }
  .signature { margin-top: 1.2cm; }
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
  <p class="signature">${escapeHtml(m.signature)}</p>
</body>
</html>`;
}
