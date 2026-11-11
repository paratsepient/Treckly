import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
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
