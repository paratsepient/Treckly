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

const row = (cells: readonly unknown[], tag: "td" | "th" = "td"): string => `<tr>${cells.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;

/**
 * Остаточний перелік і витяги для друку. Окремий мінімальний документ: його друкують із
 * прихованого iframe, тож розкладка застосунку (фіксована оболонка, панелі) на друк не впливає.
 */
export function buildFinalReport(input: FinalReportInput): string {
  const { requests, lists, extracts, positions } = input;
  const sedoOf = (id: string): string => {
    const list = lists.find((l) => l.requestIds.includes(id));
    return list?.sedoNumber != null ? String(list.sedoNumber) : "—";
  };
  const nameOf = (positionId: string): string => positions.find((p) => p.id === positionId)?.name ?? positionId;
  const total = requests.reduce((sum, r) => sum + requestTotal(r, positions), 0);

  const requestRows =
    requests.length === 0
      ? `<tr><td colspan="6">Затверджених заявок немає.</td></tr>`
      : requests
          .map((r) => row([requestLabel(r.id), input.unitName(r.route[0]), sedoOf(r.id), r.lines.length, formatMoney(requestTotal(r, positions)), statusText(r.status, r.level)]))
          .join("");

  const extractBlocks =
    extracts.length === 0
      ? "<p>Витягів ще немає.</p>"
      : extracts
          .map(
            (x) => `
    <section>
      <h3>Витяг по ${escapeHtml(input.unitName(x.unitId))} від ${escapeHtml(formatDateShort(x.date))}</h3>
      <p>Заявки: ${escapeHtml(x.requestIds.map(requestLabel).join(", "))}</p>
      <table>
        <thead>${row(["Заявка", "Позиція", "Кількість", "Тип", "Статус"], "th")}</thead>
        <tbody>${x.lines.map((l) => row([requestLabel(l.requestId), nameOf(l.positionId), l.qty, l.kind === "replacement" ? "Заміна" : "За переліком", LINE_STATUS_LABELS[l.status]])).join("")}</tbody>
      </table>
    </section>`,
          )
          .join("");

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.title)}</title>
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
  <h1>${escapeHtml(input.title)}</h1>
  <p>Станом на ${escapeHtml(formatDate(input.today))}. Демонстраційні дані, СЕДО імітується.</p>
  <h2>Остаточний перелік</h2>
  <p>Заявок: ${requests.length}, на суму ${escapeHtml(formatMoney(total))}.</p>
  <table>
    <thead>${row(["Номер", "в/ч", "СЕДО №", "Рядків", "Сума", "Статус"], "th")}</thead>
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
