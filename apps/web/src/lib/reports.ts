import { LINE_STATUS_LABELS, formatDate, formatDateShort, formatMoney, requestLabel, statusText } from "./format.ts";
import { requestTotal } from "./totals.ts";
import type { DailyList, Extract, Request } from "@dsp/domain";

/** Екранування тексту для HTML: усе, що потрапляє у звіт із даних, проходить через нього. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface FinalReportInput {
  readonly title: string;
  readonly today: string;
  readonly requests: readonly Request[];
  readonly lists: readonly DailyList[];
  readonly extracts: readonly Extract[];
  readonly positions: readonly { readonly id: string; readonly name: string; readonly priceMinor: number }[];
  readonly unitName: (id: string) => string;
}

export interface ExtractBlock {
  readonly heading: string;
  readonly requests: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/**
 * Зміст звіту без розмітки: з нього будуються і друк (HTML), і Word (.docx), тож обидва
 * формати завжди показують те саме.
 */
export interface FinalReportModel {
  readonly title: string;
  readonly subtitle: string;
  readonly summary: string;
  readonly requestHead: readonly string[];
  /** Порожній список — «Затверджених заявок немає». */
  readonly requestRows: readonly (readonly string[])[];
  readonly extracts: readonly ExtractBlock[];
}

export function finalReportModel(input: FinalReportInput): FinalReportModel {
  const { requests, lists, extracts, positions } = input;
  const sedoOf = (id: string): string => {
    const list = lists.find((l) => l.requestIds.includes(id));
    return list?.sedoNumber != null ? String(list.sedoNumber) : "—";
  };
  const nameOf = (positionId: string): string => positions.find((p) => p.id === positionId)?.name ?? positionId;
  const total = requests.reduce((sum, r) => sum + requestTotal(r, positions), 0);

  return {
    title: input.title,
    subtitle: `Станом на ${formatDate(input.today)}. Демонстраційні дані, СЕДО імітується.`,
    summary: `Заявок: ${requests.length}, на суму ${formatMoney(total)}.`,
    requestHead: ["Номер", "в/ч", "СЕДО №", "Рядків", "Сума", "Статус"],
    requestRows: requests.map((r) => [requestLabel(r.id), input.unitName(r.route[0]), sedoOf(r.id), String(r.lines.length), formatMoney(requestTotal(r, positions)), statusText(r.status, r.level)]),
    extracts: extracts.map((x) => ({
      heading: `Витяг по ${input.unitName(x.unitId)} від ${formatDateShort(x.date)}`,
      requests: `Заявки: ${x.requestIds.map(requestLabel).join(", ")}`,
      head: ["Заявка", "Позиція", "Кількість", "Тип", "Статус"],
      rows: x.lines.map((l) => [requestLabel(l.requestId), nameOf(l.positionId), String(l.qty), l.kind === "replacement" ? "Заміна" : "За переліком", LINE_STATUS_LABELS[l.status]]),
    })),
  };
}

const cells = (values: readonly string[], tag: "td" | "th" = "td"): string => `<tr>${values.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;

/**
 * Остаточний перелік і витяги для друку. Окремий мінімальний документ: його друкують із
 * прихованого iframe, тож розкладка застосунку (фіксована оболонка, панелі) на друк не впливає.
 */
export function buildFinalReport(input: FinalReportInput): string {
  const m = finalReportModel(input);
  const requestRows = m.requestRows.length === 0 ? `<tr><td colspan="${m.requestHead.length}">Затверджених заявок немає.</td></tr>` : m.requestRows.map((r) => cells(r)).join("");
  const extractBlocks =
    m.extracts.length === 0
      ? "<p>Витягів ще немає.</p>"
      : m.extracts
          .map(
            (x) => `
    <section>
      <h3>${escapeHtml(x.heading)}</h3>
      <p>${escapeHtml(x.requests)}</p>
      <table>
        <thead>${cells(x.head, "th")}</thead>
        <tbody>${x.rows.map((r) => cells(r)).join("")}</tbody>
      </table>
    </section>`,
          )
          .join("");

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<title>${escapeHtml(m.title)}</title>
<style>
  body { font: 12pt/1.4 system-ui, sans-serif; margin: 2cm; color: CanvasText; background: Canvas; }
  h1 { font-size: 18pt; margin: 0 0 0.2cm; }
  h2 { font-size: 14pt; margin: 0.8cm 0 0.2cm; }
  h3 { font-size: 12pt; margin: 0.6cm 0 0.1cm; }
  p { margin: 0 0 0.2cm; }
  table { border-collapse: collapse; width: 100%; margin: 0.2cm 0; }
  th, td { border: 1px solid GrayText; padding: 0.1cm 0.2cm; text-align: left; vertical-align: top; }
  section { break-inside: avoid; }
</style>
</head>
<body>
  <h1>${escapeHtml(m.title)}</h1>
  <p>${escapeHtml(m.subtitle)}</p>
  <h2>Підписані Головою заявки</h2>
  <p>${escapeHtml(m.summary)}</p>
  <table>
    <thead>${cells(m.requestHead, "th")}</thead>
    <tbody>${requestRows}</tbody>
  </table>
  <h2>Витяги по в/ч</h2>
  ${extractBlocks}
</body>
</html>`;
}

/**
 * Друкує окремий HTML-документ через прихований iframe (у діалозі друку можна обрати «Зберегти
 * як PDF»). Працює без інтернету й без сторонніх бібліотек.
 */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;inset-inline-start:-9999px";
  frame.srcdoc = html;
  frame.addEventListener("load", () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Діалог друку блокує потік; прибираємо iframe після нього.
    setTimeout(() => frame.remove(), 1000);
  });
  document.body.append(frame);
}
