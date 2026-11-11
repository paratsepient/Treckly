import { useMemo, useState } from "react";
import { Badge, Button, DataState, DataTable, Icon, type DataTableColumn } from "@index/ui";
import { useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { formatDateShort, formatMoney, LINE_STATUS_LABELS, LINE_STATUS_TONES, requestLabel, STATUS_TONES, statusText } from "../lib/format.ts";
import { buildFinalReport, printHtml } from "../lib/reports.ts";
import { requestTotal } from "../lib/totals.ts";

type Final = ApiOutput<"final">;
type Request = Final["requests"][number];

/**
 * Остаточний перелік і витяги. Відділ і Голова бачать усі затверджені заявки, в/ч — лише свої.
 * Витяг формується після затвердження Головою; лише в ньому рядок заміни стає «Заміна погоджена».
 */
export function FinalScreen() {
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const positions = useApiQuery("positions");
  const query = useApiQuery("final");
  const feedback = useFeedback();
  const [exporting, setExporting] = useState(false);
  const isAuthor = session.data?.user.roleKind === "author";

  const requests = query.data?.requests ?? [];
  const extracts = query.data?.extracts ?? [];
  const lists = query.data?.lists ?? [];
  const priced = positions.data?.positions ?? [];
  const unitName = (id: string) => reference.data?.units.find((u) => u.id === id)?.name ?? id;
  const sedoOf = (id: string): string => {
    const list = lists.find((l) => l.requestIds.includes(id));
    return list?.sedoNumber != null ? String(list.sedoNumber) : "—";
  };
  const approvedOn = (id: string): string => {
    const list = lists.find((l) => l.requestIds.includes(id));
    return list ? formatDateShort(list.date) : "—";
  };
  const total = useMemo(() => requests.reduce((sum, r) => sum + requestTotal(r, priced), 0), [requests, priced]);
  const title = isAuthor ? "Витяги по в/ч" : "Остаточний перелік і витяги";

  const columns: readonly DataTableColumn<Request>[] = [
    { key: "id", header: "Номер", mono: true, render: (r) => requestLabel(r.id), width: 150 },
    { key: "unit", header: "в/ч", render: (r) => unitName(r.route[0]) },
    { key: "on", header: "Затверджено", render: (r) => approvedOn(r.id), width: 140 },
    { key: "sedo", header: "СЕДО №", mono: true, render: (r) => sedoOf(r.id), width: 140 },
    { key: "lines", header: "Рядків", numeric: true, render: (r) => r.lines.length, width: 90 },
    { key: "total", header: "Сума", numeric: true, render: (r) => formatMoney(requestTotal(r, priced)), width: 160 },
    { key: "status", header: "Статус", render: (r) => <Badge tone={STATUS_TONES[r.status]}>{statusText(r.status, r.level)}</Badge>, width: 190 },
  ];

  const state = query.isPending ? "loading" : query.isError ? "error" : requests.length === 0 ? "empty" : "ready";
  const report = { title, today: session.data?.today ?? "", requests, lists, extracts, positions: priced, unitName };
  const print = () => printHtml(buildFinalReport(report));
  /** Word вантажиться лише тут: бібліотека `docx` не збільшує початкове завантаження. */
  const exportDocx = async () => {
    setExporting(true);
    try {
      const { buildFinalDocx, downloadBlob } = await import("../lib/docx-export.ts");
      downloadBlob(await buildFinalDocx(report), `${isAuthor ? "vytiahy" : "ostatochnyi-perelik"}-${report.today}.docx`);
      feedback.notify({ key: "docx", tone: "success", title: "Документ Word збережено", description: "Файл .docx завантажено на цей комп'ютер." });
    } catch {
      feedback.notify({ key: "docx", tone: "error", title: "Не вдалося створити документ Word" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScreenFrame
      title={title}
      meta={query.data ? `${requests.length} затверджених · ${formatMoney(total)}` : undefined}
      surfaceLabel={title}
      actions={
        <Button iconStart={<Icon name="save" />} disabled={query.data === undefined} loading={exporting} loadingLabel="Створення документа Word" onClick={() => void exportDocx()}>
          Word (.docx)
        </Button>
      }
      primaryAction={
        <Button iconStart={<Icon name="share" />} disabled={query.data === undefined} onClick={print}>
          Друк / PDF
        </Button>
      }
    >
      <section className="lists" aria-labelledby="final-requests-title">
        <h2 id="final-requests-title" className="lists__title">
          Остаточний перелік
        </h2>
        <DataTable
          label="Затверджені заявки"
          columns={columns}
          rows={requests}
          getRowId={(r) => r.id}
          rowHeaderKey="id"
          variant="well"
          state={state}
          stateTitle={state === "error" ? "Не вдалося завантажити остаточний перелік" : "Затверджених заявок ще немає"}
          {...(state === "empty" ? { stateDescription: "Заявка потрапляє сюди після затвердження Головою: тоді ж резервується бюджет і формується витяг." } : {})}
        />
      </section>

      <section className="lists" aria-labelledby="extracts-title">
        <h2 id="extracts-title" className="lists__title">
          Витяги по в/ч
        </h2>
        {query.isPending ? (
          <DataState kind="loading" size="compact" />
        ) : extracts.length === 0 ? (
          <DataState kind="empty" size="compact" title="Витягів ще немає" description="Витяг по в/ч формується автоматично після затвердження заявок Головою." />
        ) : (
          extracts.map((extract) => (
            <article key={extract.id} className="list-card" aria-label={`Витяг по ${unitName(extract.unitId)}`}>
              <header className="list-card__head">
                <h3 className="list-card__title">
                  Витяг по {unitName(extract.unitId)} від {formatDateShort(extract.date)}
                </h3>
                <Badge tone="success">Сформовано</Badge>
              </header>
              <p className="list-card__note">Заявки: {extract.requestIds.map(requestLabel).join(", ")}</p>
              <ul className="extract-lines">
                {extract.lines.map((line) => (
                  <li key={`${line.requestId}:${line.lineId}`} className="extract-lines__item">
                    <span>
                      {requestLabel(line.requestId)} · {priced.find((p) => p.id === line.positionId)?.name ?? line.positionId} × {line.qty}
                      {line.kind === "replacement" ? " (заміна)" : ""}
                    </span>
                    <Badge tone={LINE_STATUS_TONES[line.status]}>{LINE_STATUS_LABELS[line.status]}</Badge>
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>
    </ScreenFrame>
  );
}
