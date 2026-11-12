import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, WidthType } from "docx";
import { extractDocModel, type ExtractDocInput } from "./extract-doc.ts";
import { listDocModel, type ListDocInput } from "./list-doc.ts";
import { raportModel, type RaportInput } from "./raport.ts";
import { finalReportModel, type FinalReportInput } from "./reports.ts";

const cell = (text: string, bold = false): TableCell =>
  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });

const table = (head: readonly string[], rows: readonly (readonly string[])[], emptyText: string): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h) => cell(h, true)) }),
      ...(rows.length === 0
        ? [new TableRow({ children: [new TableCell({ columnSpan: head.length, children: [new Paragraph(emptyText)] })] })]
        : rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))),
    ],
  });

/** Остаточний перелік і витяги як документ Word: той самий зміст, що й у друку. */
export function buildFinalDocument(input: FinalReportInput): Document {
  const m = finalReportModel(input);
  return new Document({
    creator: "Прототип обліку майна",
    title: m.title,
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(m.title)] }),
          new Paragraph(m.subtitle),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Остаточний перелік")] }),
          new Paragraph(m.summary),
          table(m.requestHead, m.requestRows, "Затверджених заявок немає."),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Витяги по в/ч")] }),
          ...(m.extracts.length === 0
            ? [new Paragraph("Витягів ще немає.")]
            : m.extracts.flatMap((x) => [
                new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(x.heading)] }),
                new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun(x.requests)] }),
                table(x.head, x.rows, ""),
              ])),
        ],
      },
    ],
  });
}

export async function buildFinalDocx(input: FinalReportInput): Promise<Blob> {
  return Packer.toBlob(buildFinalDocument(input));
}

// ── Рапорт ───────────────────────────────────────────────────────────────────

const FONT = "Times New Roman";
/** Розміри в docx — у половинах пункту: 28 = 14 pt. */
const SIZE = 28;
const TABLE_SIZE = 22;
const INDENT = 709; // 1,25 см у twip

const text = (value: string, options: { bold?: boolean; size?: number; italics?: boolean } = {}): TextRun =>
  new TextRun({ text: value, font: FONT, size: options.size ?? SIZE, bold: options.bold ?? false, italics: options.italics ?? false });

const body = (value: string, indent = true): Paragraph =>
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: indent ? { firstLine: INDENT } : {}, spacing: { after: 80 }, children: [text(value)] });

const raportTable = (head: readonly string[], rows: readonly (readonly string[])[], numeric: readonly number[]): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: head.map((h) => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text(h, { bold: true, size: TABLE_SIZE })] })] })),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: r.map(
              (c, i) => new TableCell({ children: [new Paragraph({ alignment: numeric.includes(i) ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [text(c, { size: TABLE_SIZE })] })] }),
            ),
          }),
      ),
    ],
  });

/** Рапорт у Word: той самий зміст, що й у перегляді та друку, на полях службового документа. */
export function buildRaportDocument(input: RaportInput): Document {
  const m = raportModel(input);
  return new Document({
    creator: "Прототип обліку майна",
    title: m.documentTitle,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 851 } } },
        children: [
          ...m.addressee.map((line) => new Paragraph({ indent: { left: 4677 }, children: [text(line)] })),
          new Paragraph({ spacing: { before: 480, after: 240 }, alignment: AlignmentType.CENTER, children: [text(m.title, { bold: true })] }),
          body(m.request),
          ...m.tables.flatMap((t) => [
            new Paragraph({ spacing: { before: 200, after: 80 }, children: [text(t.heading, { bold: true })] }),
            raportTable(t.head, t.rows, t.numeric),
          ]),
          new Paragraph({ spacing: { before: 160, after: 80 }, children: [text(m.total, { bold: true }), ...(m.byKekv ? [text(` ${m.byKekv}`)] : [])] }),
          new Paragraph({ spacing: { before: 200, after: 80 }, children: [text(m.justificationHeading, { bold: true })] }),
          ...(m.justification.length > 0 ? m.justification.map((p) => body(p)) : [new Paragraph({ indent: { firstLine: INDENT }, children: [text("Обґрунтування ще не написано.", { italics: true })] })]),
          new Paragraph({ spacing: { before: 720 }, children: [text(m.signature.position)] }),
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: 9354 }],
            children: [text(m.signature.rank), text(`\t${m.signature.name}`)],
          }),
          new Paragraph({ children: [text(m.signature.date)] }),
          new Paragraph({ spacing: { before: 480 }, children: [text(m.footnote, { size: 20 })] }),
        ],
      },
    ],
  });
}

/** Витяг по в/ч у Word: той самий зміст, що й у перегляді та друку. */
export function buildExtractDocument(input: ExtractDocInput): Document {
  const m = extractDocModel(input);
  return new Document({
    creator: "Прототип обліку майна",
    title: m.documentTitle,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 851 } } },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [text(m.title, { bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [text(m.subtitle)] }),
          body(m.basis, false),
          raportTable(m.head, m.rows, m.numeric),
          new Paragraph({ spacing: { before: 160 }, children: [text(m.total, { bold: true })] }),
          new Paragraph({ spacing: { before: 480 }, children: [text(m.footnote, { size: 20 })] }),
        ],
      },
    ],
  });
}

export async function buildExtractDocx(input: ExtractDocInput): Promise<Blob> {
  return Packer.toBlob(buildExtractDocument(input));
}

/** Денний перелік у Word: той самий зміст, що й у перегляді та друку. */
export async function buildListDocx(input: ListDocInput): Promise<Blob> {
  const m = listDocModel(input);
  const doc = new Document({
    creator: "Прототип обліку майна",
    title: m.documentTitle,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 851 } } },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [text(m.title, { bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [text(m.subtitle)] }),
          body(m.basis, false),
          raportTable(m.head, m.rows, m.numeric),
          new Paragraph({ spacing: { before: 160 }, children: [text(m.total, { bold: true })] }),
          new Paragraph({ spacing: { before: 720 }, children: [text(m.signature)] }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function buildRaportDocx(input: RaportInput): Promise<Blob> {
  return Packer.toBlob(buildRaportDocument(input));
}

/** Збереження файла без мережі: тимчасове посилання на Blob у пам'яті браузера. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
