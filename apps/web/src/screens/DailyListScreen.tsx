import { useEffect, useMemo, useState } from "react";
import { Badge, Button, DataState, DataTable, Icon, type DataTableColumn } from "@index/ui";
import { useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { RaportDialog } from "../components/RaportDialog.tsx";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";
import { SedoDialog } from "../components/SedoDialog.tsx";
import { formatDateShort, formatMoney, requestLabel } from "../lib/format.ts";
import { requestTotal } from "../lib/totals.ts";

type Queue = ApiOutput<"levelQueue">;
type List = Queue["lists"][number];
type Request = Queue["listed"][number];

/**
 * Денний перелік для керівника рівня: бачить сформовані переліки й погоджує кожен одним
 * рішенням із числовим номером СЕДО (на рівні 5 це затвердження Головою). Часткового
 * погодження немає: заявки переходять далі всі разом.
 */
export function DailyListScreen() {
  const feedback = useFeedback();
  const session = useApiQuery("session");
  const narrow = useMedia(NARROW);
  const reference = useApiQuery("reference");
  const positions = useApiQuery("positions");
  const user = session.data?.user;
  const level = user?.level ?? 0;
  const final = level === 5;
  const queue = useApiQuery("levelQueue", { params: { level: String(level) } }, { enabled: level > 0 });
  const approve = useApiMutation("approveList");

  const [selected, setSelected] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Заявка переліку, рапорт якої відкрито для ознайомлення. */
  const [reading, setReading] = useState<Request | null>(null);
  const [dialogError, setDialogError] = useState<string | undefined>();

  const lists = queue.data?.lists ?? [];
  const waiting = useMemo(() => lists.filter((l) => l.status === "formed"), [lists]);
  const done = useMemo(() => lists.filter((l) => l.status === "approved"), [lists]);
  const requests = useMemo(() => new Map((queue.data?.listed ?? []).map((r) => [r.id, r])), [queue.data]);
  const priced = positions.data?.positions ?? [];
  const unitName = (id: string) => reference.data?.units.find((u) => u.id === id)?.name ?? id;
  const userName = (id: string) => session.data?.users.find((u) => u.id === id)?.name ?? id;
  const levelConfig = reference.data?.levels.find((l) => l.level === level);

  const totalOf = (list: List): number => list.requestIds.reduce((sum, id) => sum + (requests.get(id) ? requestTotal(requests.get(id) as Request, priced) : 0), 0);

  // Перший перелік обирається сам, а вибраний, що зник (погоджений чи розформований), скидається.
  useEffect(() => {
    if (selected !== undefined && waiting.some((l) => l.id === selected)) return;
    setSelected(waiting[0]?.id);
  }, [waiting, selected]);

  const current = waiting.find((l) => l.id === selected);
  const verb = final ? "Затвердити" : "Погодити";

  const doApprove = (sedoNumber: string) => {
    if (!current) return;
    setDialogError(undefined);
    approve.mutate(
      { params: { id: current.id }, body: { sedoNumber, expectedRevisions: { [current.id]: current.revision } } },
      {
        onSuccess: ({ list, requests: moved }) => {
          setDialogOpen(false);
          feedback.notify({
            key: "approved",
            tone: "success",
            title: final ? "Перелік затверджено" : "Перелік погоджено",
            description: final
              ? `СЕДО № ${list.sedoNumber}. Бюджет зарезервовано, витяги по в/ч сформовано (заявок: ${moved.length}).`
              : `СЕДО № ${list.sedoNumber}. Заявки (${moved.length}) передано на рівень ${level + 1}.`,
          });
        },
        onError: (error) => setDialogError(error instanceof ApiClientError ? error.message : "Невідома помилка"),
      },
    );
  };

  const columns: readonly DataTableColumn<List>[] = [
    { key: "date", header: "Перелік від", render: (l) => formatDateShort(l.date), width: 140 },
    { key: "by", header: "Сформував", render: (l) => userName(l.formedBy) },
    { key: "count", header: "Заявок", numeric: true, render: (l) => l.requestIds.length, width: 100 },
    { key: "total", header: "Сума", numeric: true, render: (l) => formatMoney(totalOf(l)), width: 170 },
    { key: "status", header: "Статус", render: () => <Badge tone="info">Чекає погодження</Badge>, width: 190 },
  ];

  const state = queue.isPending ? "loading" : queue.isError ? "error" : waiting.length === 0 ? "empty" : "ready";

  const inspector = (
    <DetailPanel
      title={current ? `Перелік від ${formatDateShort(current.date)}` : "Перелік"}
      subtitle={current ? `${current.requestIds.length} заявок · ${formatMoney(totalOf(current))}` : undefined}
      empty={!current}
      emptyText="Сформованих переліків, що чекають погодження, немає."
    >
      {current ? (
        <ul className="list-requests">
          {current.requestIds.map((id) => {
            const r = requests.get(id);
            return (
              <li key={id} className="list-requests__item">
                <p className="list-requests__name">
                  {r ? (
                    <button type="button" className="list-requests__open" onClick={() => setReading(r)}>
                      {requestLabel(id)}
                      <span className="ix-sr-only">: відкрити рапорт</span>
                    </button>
                  ) : (
                    requestLabel(id)
                  )}
                  {r ? ` · ${unitName(r.route[0])}` : ""}
                </p>
                {r ? (
                  <>
                    <p className="list-requests__meta">{formatMoney(requestTotal(r, priced))}</p>
                    <ul className="list-requests__lines">
                      {r.lines.map((line) => (
                        <li key={line.id}>
                          {priced.find((p) => p.id === line.positionId)?.name ?? line.positionId} × {line.qty}
                          {line.kind === "replacement" ? ` → заміна: ${line.newItem.name} (КЕКВ ${line.newItem.kekv})` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </DetailPanel>
  );

  return (
    <>
      <ScreenFrame
        title={final ? "Затвердження переліку" : "Денний перелік"}
        meta={queue.data ? `${waiting.length} чекає` : undefined}
        surfaceLabel="Денні переліки на погодження"
        primaryAction={
          <Button
            variant="primary"
            iconStart={<Icon name="success" />}
            disabled={!current}
            onClick={() => {
              setDialogError(undefined);
              setDialogOpen(true);
            }}
          >
            {verb}
          </Button>
        }
        inspector={inspector}
        inspectorLabel="Склад переліку"
        inspectorOpen={current !== undefined}
        inspectorPlacement="aside"
        footer={
          <section className="lists" aria-labelledby="done-title">
            <h2 id="done-title" className="lists__title">
              Погоджені переліки
            </h2>
            {done.length === 0 ? (
              <DataState kind="empty" size="compact" title="Погоджених переліків ще немає" />
            ) : (
              <ul className="done-lists">
                {done.map((l) => (
                  <li key={l.id} className="done-lists__item">
                    <Badge tone="success">Погоджено</Badge> {formatDateShort(l.date)} · СЕДО № {l.sedoNumber} · заявок {l.requestIds.length}
                  </li>
                ))}
              </ul>
            )}
          </section>
        }
        {...(current ? { inspectorKey: current.id } : {})}
      >
        <p className="screen__hint">
          {final
            ? "Затвердження резервує бюджет за заявками переліку й формує витяги по в/ч. Потрібен числовий номер СЕДО."
            : "Погодження стосується переліку цілком: усі його заявки разом переходять на наступний рівень. Потрібен числовий номер СЕДО."}
        </p>
        <DataTable
          label="Переліки, що чекають погодження"
          columns={visibleColumns(columns, narrow, ["by", "status"])}
          rows={waiting}
          getRowId={(l) => l.id}
          rowHeaderKey="date"
          variant="well"
          currentRowId={selected ?? null}
          onRowSelect={setSelected}
          state={state}
          stateTitle={state === "error" ? "Не вдалося завантажити переліки" : "Переліків на погодження немає"}
          {...(state === "empty" ? { stateDescription: "Перелік з'явиться, коли уповноважена особа сформує його з обраних заявок." } : {})}
        />

      </ScreenFrame>

      <RaportDialog request={reading ?? undefined} open={reading !== null} onClose={() => setReading(null)} />
      <SedoDialog
        open={dialogOpen}
        final={final}
        requestCount={current?.requestIds.length ?? 0}
        totalText={current ? formatMoney(totalOf(current)) : ""}
        pending={approve.isPending}
        error={dialogError}
        onClose={() => setDialogOpen(false)}
        onConfirm={doApprove}
      />
    </>
  );
}
