import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, DataState, DataTable, Icon, type DataTableColumn } from "@index/ui";
import { Dialog, useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { daysAtLevel } from "@dsp/domain";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";
import { RaportButton } from "../components/RaportDialog.tsx";
import { requestTabs } from "../components/RequestTabs.tsx";
import { ReturnDialog } from "../components/ReturnDialog.tsx";
import { formatDateShort, formatMoney, requestLabel } from "../lib/format.ts";
import { requestTotal } from "../lib/totals.ts";

type Queue = ApiOutput<"levelQueue">;
type Request = Queue["queue"][number];
type List = Queue["lists"][number];

const errorText = (error: unknown): string => (error instanceof ApiClientError ? error.message : "Невідома помилка");

/**
 * Черга рівня для уповноваженої особи: обирає заявки, формує з них денний перелік і повертає
 * заявки автору з приміткою. Необрані лишаються в черзі. Сформований, але непогоджений
 * перелік можна розформувати (правила 4–5).
 */
export function LevelQueueScreen() {
  const feedback = useFeedback();
  const session = useApiQuery("session");
  const narrow = useMedia(NARROW);
  const reference = useApiQuery("reference");
  const positions = useApiQuery("positions");
  const user = session.data?.user;
  const level = user?.level ?? 0;
  const unitId = user?.unitId ?? "";
  const queue = useApiQuery("levelQueue", { params: { level: String(level) } }, { enabled: level > 0 });

  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [inspected, setInspected] = useState<string | undefined>();
  const [returning, setReturning] = useState<Request | null>(null);
  const [returnError, setReturnError] = useState<string | undefined>();
  const [disbanding, setDisbanding] = useState<List | null>(null);

  const detail = useApiQuery("requestDetail", { params: { id: inspected ?? "" } }, { enabled: inspected !== undefined });
  const form = useApiMutation("formList");
  const giveBack = useApiMutation("returnRequest");
  const disband = useApiMutation("disbandList");

  const rows = queue.data?.queue ?? [];
  const priced = positions.data?.positions ?? [];
  const unitName = (id: string) => reference.data?.units.find((u) => u.id === id)?.name ?? id;
  const levelConfig = reference.data?.levels.find((l) => l.level === level);
  const today = session.data?.today ?? "";

  // Позначки прибираються, коли заявка зникла з черги (її сформували, повернули чи відкликали).
  useEffect(() => {
    setChecked((prev) => {
      const alive = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const formedByMe = useMemo(() => (queue.data?.lists ?? []).filter((l) => l.status === "formed"), [queue.data]);
  const requestById = useMemo(() => new Map([...(queue.data?.queue ?? []), ...(queue.data?.listed ?? [])].map((r) => [r.id, r])), [queue.data]);

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allChecked = rows.length > 0 && checked.size === rows.length;

  const doForm = () => {
    const requestIds = rows.filter((r) => checked.has(r.id)).map((r) => r.id);
    const expectedRevisions = Object.fromEntries(rows.filter((r) => checked.has(r.id)).map((r) => [r.id, r.revision]));
    form.mutate(
      { body: { level: level as 1 | 2 | 3 | 4 | 5, unitId, requestIds, expectedRevisions } },
      {
        onSuccess: ({ requests }) =>
          feedback.notify({
            key: "list-formed",
            tone: "success",
            title: `Перелік сформовано: заявок ${requests.length}`,
            description:
              rows.length > requests.length
                ? `Керівник отримав сповіщення. Необрані заявки (${rows.length - requests.length}) лишились у черзі.`
                : "Керівник отримав сповіщення.",
          }),
        onError: (error) => feedback.notify({ key: "list-error", tone: "error", title: "Перелік не сформовано", description: errorText(error) }),
      },
    );
  };

  const doReturn = (note: string) => {
    if (!returning) return;
    setReturnError(undefined);
    giveBack.mutate(
      { params: { id: returning.id }, body: { note, expectedRevision: returning.revision } },
      {
        onSuccess: () => {
          feedback.notify({ key: "returned", tone: "success", title: `${requestLabel(returning.id)} повернуто автору`, description: "Автор і нижчі рівні отримали сповіщення з приміткою." });
          if (inspected === returning.id) setInspected(undefined);
          setReturning(null);
        },
        onError: (error) => setReturnError(errorText(error)),
      },
    );
  };

  const doDisband = () => {
    if (!disbanding) return;
    disband.mutate(
      { params: { id: disbanding.id }, body: {} },
      {
        onSuccess: ({ requests }) => feedback.notify({ key: "disbanded", tone: "success", title: "Перелік розформовано", description: `Заявок повернулось у чергу: ${requests.length}.` }),
        onError: (error) => feedback.notify({ key: "disband-error", tone: "error", title: "Не вдалося розформувати", description: errorText(error) }),
        onSettled: () => setDisbanding(null),
      },
    );
  };

  const columns: readonly DataTableColumn<Request>[] = [
    {
      key: "pick",
      header: "Обрати",
      width: 80,
      // Клік по прапорцю лише обирає заявку, а не відкриває її картку (подія не спливає до рядка).
      render: (r) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Checkbox label={`Обрати ${requestLabel(r.id)} до переліку`} hideLabel checked={checked.has(r.id)} onChange={(event) => toggle(r.id, event.target.checked)} />
        </span>
      ),
    },
    { key: "id", header: "Номер", mono: true, render: (r) => requestLabel(r.id), width: 150 },
    { key: "unit", header: "Автор (в/ч)", render: (r) => unitName(r.route[0]) },
    { key: "lines", header: "Рядків", numeric: true, render: (r) => r.lines.length, width: 90 },
    { key: "total", header: "Сума", numeric: true, render: (r) => formatMoney(requestTotal(r, priced)), width: 160 },
    { key: "days", header: "Днів на рівні", numeric: true, render: (r) => daysAtLevel(r, today), width: 130 },
    {
      key: "act",
      header: "Дія",
      width: 140,
      render: (r) => (
        <Button
          onClick={() => {
            setReturnError(undefined);
            setReturning(r);
          }}
        >
          Повернути…
        </Button>
      ),
    },
  ];

  const state = queue.isPending ? "loading" : queue.isError ? "error" : rows.length === 0 ? "empty" : "ready";
  const request = detail.data?.request;

  return (
    <>
      <ScreenFrame
        title={`Черга рівня ${level}`}
        meta={queue.data ? `${rows.length} у черзі` : undefined}
        surfaceLabel="Черга рівня"
        primaryAction={
          <Button variant="primary" iconStart={<Icon name="add" />} disabled={checked.size === 0} loading={form.isPending} loadingLabel="Формування переліку" onClick={doForm}>
            {`Сформувати перелік${checked.size > 0 ? ` (${checked.size})` : ""}`}
          </Button>
        }
        inspector={
          <DetailPanel
            title={inspected ? requestLabel(inspected) : "Заявка"}
            subtitle={request ? `Версія ${request.version}` : undefined}
            empty={!inspected}
            emptyText="Оберіть заявку в таблиці, щоб побачити рядки й трек."
            actions={request ? <RaportButton request={request} /> : undefined}
            tabs={
              detail.data
                ? requestTabs({ detail: detail.data, positions: priced, levels: (reference.data?.levels ?? []).map((l) => ({ level: l.level, name: l.name })) })
                : undefined
            }
          >
            {inspected && detail.isPending ? <DataState kind="loading" size="compact" /> : null}
            {inspected && detail.isError ? <DataState kind="error" size="compact" title="Не вдалося завантажити заявку" /> : null}
          </DetailPanel>
        }
        inspectorLabel="Картка заявки"
        inspectorOpen={inspected !== undefined}
        onInspectorOpenChange={(open) => {
          if (!open) setInspected(undefined);
        }}
        {...(inspected ? { inspectorKey: inspected } : {})}
      >
        <p className="screen__hint">
          Оберіть заявки, які погоджуєте сьогодні, і сформуйте з них денний перелік: керівник погоджує його одним рішенням. Необрані заявки лишаються в черзі.
        </p>
        <div className="queue__select-all">
          <Checkbox
            label="Обрати всі заявки в черзі"
            checked={allChecked}
            indeterminate={checked.size > 0 && !allChecked}
            disabled={rows.length === 0}
            onChange={(event) => setChecked(event.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
          />
        </div>
        <DataTable
          label="Заявки в черзі рівня"
          columns={visibleColumns(columns, narrow || inspected !== undefined, narrow ? ["unit", "lines", "days"] : ["lines"])}
          rows={rows}
          getRowId={(r) => r.id}
          rowHeaderKey="id"
          variant="well"
          currentRowId={inspected ?? null}
          onRowSelect={setInspected}
          state={state}
          stateTitle={state === "error" ? "Не вдалося завантажити чергу" : "Черга порожня"}
          {...(state === "empty" ? { stateDescription: "Нових заявок на вашому рівні немає. Заявки з'являться, коли нижчий рівень погодить свій перелік." } : {})}
        />

        <section className="lists" aria-labelledby="formed-title">
          <h2 id="formed-title" className="lists__title">
            Сформовані переліки
          </h2>
          {formedByMe.length === 0 ? (
            <DataState kind="empty" size="compact" title="Сформованих переліків немає" description="Перелік з'явиться тут після кнопки «Сформувати перелік»." />
          ) : (
            formedByMe.map((list) => {
              const mine = list.formedBy === user?.id;
              return (
                <article key={list.id} className="list-card" aria-label={`Перелік від ${formatDateShort(list.date)}`}>
                  <header className="list-card__head">
                    <h3 className="list-card__title">Перелік від {formatDateShort(list.date)}</h3>
                    <Badge tone="info">Чекає погодження керівника</Badge>
                  </header>
                  <ul className="list-card__items">
                    {list.requestIds.map((id) => {
                      const r = requestById.get(id);
                      return (
                        <li key={id}>
                          {requestLabel(id)}
                          {r ? ` · ${unitName(r.route[0])} · ${formatMoney(requestTotal(r, priced))}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                  {mine ? (
                    <Button onClick={() => setDisbanding(list)}>Розформувати</Button>
                  ) : (
                    <p className="list-card__note">Розформувати може лише той, хто сформував перелік.</p>
                  )}
                </article>
              );
            })
          )}
        </section>
      </ScreenFrame>

      <ReturnDialog
        open={returning !== null}
        label={returning ? requestLabel(returning.id) : ""}
        level={level}
        pending={giveBack.isPending}
        error={returnError}
        onClose={() => setReturning(null)}
        onConfirm={doReturn}
      />
      <Dialog
        open={disbanding !== null}
        onClose={() => setDisbanding(null)}
        title="Розформувати перелік?"
        description="Заявки повернуться в чергу рівня, і перелік можна буде сформувати знову. Керівник більше не побачить його на погодженні."
        kind="confirm"
        actions={
          <>
            <Button onClick={() => setDisbanding(null)}>Не розформовувати</Button>
            <Button variant="destructive" loading={disband.isPending} loadingLabel="Розформування" onClick={doDisband}>
              Розформувати
            </Button>
          </>
        }
      />
    </>
  );
}
