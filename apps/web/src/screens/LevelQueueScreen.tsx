import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, DataState, DataTable, Icon, IconButton, Textarea, type DataTableColumn } from "@index/ui";
import { Dialog, useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { daysAtLevel } from "@dsp/domain";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { InfoHint } from "../components/InfoHint.tsx";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";
import { PlanComparison } from "../components/PlanComparison.tsx";
import { RaportDialog } from "../components/RaportDialog.tsx";
import { DocumentActions, DocumentDialog } from "../components/DocumentDialog.tsx";
import { SedoDialog } from "../components/SedoDialog.tsx";
import { buildListHtml, listDocModel, type ListDocInput } from "../lib/list-doc.ts";
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
  /** Заявка, рапорт якої відкрито для ознайомлення (клік по рядку). */
  const [reading, setReading] = useState<Request | null>(null);
  /** Заявка, яку звіряють з переліком під таблицею; за замовчуванням — перша в черзі. */
  const [compared, setCompared] = useState<string | undefined>();
  const [returning, setReturning] = useState<Request | null>(null);
  const [returnError, setReturnError] = useState<string | undefined>();
  const [disbanding, setDisbanding] = useState<List | null>(null);
  /** Рівень 5: перелік, під яким відмічають підпис Голови, і перелік, відкритий як документ. */
  const [signing, setSigning] = useState<List | null>(null);
  const [signError, setSignError] = useState<string | undefined>();
  const [viewingList, setViewingList] = useState<string | null>(null);

  const form = useApiMutation("formList");
  const giveBack = useApiMutation("returnRequest");
  const disband = useApiMutation("disbandList");
  const sign = useApiMutation("approveList");
  const notSigned = useApiMutation("notSignedList");
  const [refused, setRefused] = useState<List | null>(null);
  const [refuseNote, setRefuseNote] = useState("");
  const [refuseError, setRefuseError] = useState<string | undefined>();

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

  const comparedRequest = rows.find((r) => r.id === compared) ?? rows[0];

  const formedByMe = useMemo(() => (queue.data?.lists ?? []).filter((l) => l.status === "formed"), [queue.data]);
  const requestById = useMemo(() => new Map([...(queue.data?.queue ?? []), ...(queue.data?.listed ?? [])].map((r) => [r.id, r])), [queue.data]);

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

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
          if (reading?.id === returning.id) setReading(null);
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

  const startReturn = (r: Request) => {
    setReturnError(undefined);
    setReturning(r);
  };

  const final = level === 5;
  const listInput = (list: List): ListDocInput => ({
    list,
    requests: list.requestIds.map((id) => requestById.get(id)).filter((r): r is Request => r !== undefined),
    positions: priced,
    unitName,
    userName: (id) => session.data?.users.find((u) => u.id === id)?.name ?? id,
    levelName: levelConfig?.name ?? "",
  });
  const listTotal = (list: List): number =>
    list.requestIds.reduce((sum, id) => {
      const r = requestById.get(id);
      return sum + (r ? requestTotal(r, priced) : 0);
    }, 0);
  const doSign = (sedoNumber: string) => {
    if (!signing) return;
    setSignError(undefined);
    sign.mutate(
      { params: { id: signing.id }, body: { sedoNumber, expectedRevisions: { [signing.id]: signing.revision } } },
      {
        onSuccess: ({ list, requests: moved }) => {
          setSigning(null);
          feedback.notify({
            key: "signed",
            tone: "success",
            title: "Перелік підписано Головою",
            description: `СЕДО № ${list.sedoNumber}. Бюджет зарезервовано, витяги по в/ч сформовано (заявок: ${moved.length}).`,
          });
        },
        onError: (error) => setSignError(errorText(error)),
      },
    );
  };
  const doNotSigned = () => {
    if (!refused) return;
    setRefuseError(undefined);
    notSigned.mutate(
      { params: { id: refused.id }, body: { note: refuseNote, expectedRevisions: { [refused.id]: refused.revision } } },
      {
        onSuccess: ({ requests: back }) => {
          setRefused(null);
          feedback.notify({
            key: "not-signed",
            tone: "success",
            title: "Відмічено: Голова не підписав",
            description: `Заявки повернуто авторам із приміткою (${back.length}); нижчі рівні отримали сповіщення.`,
          });
        },
        onError: (error) => setRefuseError(errorText(error)),
      },
    );
  };
  const viewed = formedByMe.find((l) => l.id === viewingList);

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
      width: 200,
      render: (r) => (
        // Клік по кнопках не вибирає рядок для звірки: подія не спливає до рядка.
        <span className="row-actions" onClick={(event) => event.stopPropagation()}>
          <IconButton variant="secondary" label={`Переглянути рапорт ${requestLabel(r.id)}`} icon={<Icon name="view" />} onClick={() => setReading(r)} />
          <Button onClick={() => startReturn(r)}>Повернути…</Button>
        </span>
      ),
    },
  ];

  const state = queue.isPending ? "loading" : queue.isError ? "error" : rows.length === 0 ? "empty" : "ready";

  return (
    <>
      <ScreenFrame
        title={`Черга рівня ${level}`}
        meta={queue.data ? `${rows.length} у черзі` : undefined}
        surfaceLabel="Черга рівня"
        actions={<InfoHint label="Як працює черга" text={"Кнопкою з оком біля заявки відкривається її рапорт для ознайомлення, а під таблицею видно, чи відповідає заявка плану в/ч. Оберіть заявки, які погоджуєте сьогодні, і сформуйте з них денний перелік: керівник погоджує його одним рішенням. Необрані заявки лишаються в черзі."} />}
        primaryAction={
          <Button variant="primary" iconStart={<Icon name="add" />} disabled={checked.size === 0} loading={form.isPending} loadingLabel="Формування переліку" onClick={doForm}>
            {`Сформувати перелік${checked.size > 0 ? ` (${checked.size})` : ""}`}
          </Button>
        }
      >
        <section className="queue-card" aria-label="Заявки в черзі та звірка з переліком">
        <DataTable
          label="Заявки в черзі рівня"
          columns={visibleColumns(columns, narrow, ["unit", "lines", "days"])}
          rows={rows}
          getRowId={(r) => r.id}
          rowHeaderKey="id"
          variant="well"
          currentRowId={comparedRequest?.id ?? null}
          onRowSelect={setCompared}
          state={state}
          stateTitle={state === "error" ? "Не вдалося завантажити чергу" : "Черга порожня"}
          {...(state === "empty" ? { stateDescription: "Нових заявок на вашому рівні немає. Заявки з'являться, коли нижчий рівень погодить свій перелік." } : {})}
        />

        <PlanComparison request={comparedRequest} unitName={comparedRequest ? unitName(comparedRequest.route[0]) : ""} withStock={final} />
        </section>

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
                    <Badge tone="info">{final ? "Чекає підпису Голови" : "Чекає погодження керівника"}</Badge>
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
                  {final ? (
                    // Рівень 5: Відділ друкує перелік, несе на підпис Голові й відмічає підпис з номером СЕДО.
                    <div className="list-card__final">
                      <p className="list-card__note">Роздрукуйте або завантажте перелік, передайте на підпис Голові й після підпису відмітьте «Підписано Головою». Якщо Голова не підписав — відмітьте це з приміткою: заявки повернуться авторам.</p>
                      <div className="list-card__actions">
                        <IconButton variant="secondary" label={`Переглянути перелік від ${formatDateShort(list.date)}`} icon={<Icon name="view" />} onClick={() => setViewingList(list.id)} />
                        <DocumentActions
                          what="перелік"
                          html={buildListHtml(listInput(list))}
                          makeDocx={async () => (await import("../lib/docx-export.ts")).buildListDocx(listInput(list))}
                          fileName={listDocModel(listInput(list)).fileName}
                        />
                        {mine ? <Button onClick={() => setDisbanding(list)}>Розформувати</Button> : null}
                        <Button
                          onClick={() => {
                            setRefuseError(undefined);
                            setRefuseNote("");
                            setRefused(list);
                          }}
                        >
                          Голова не підписав…
                        </Button>
                        <Button
                          variant="primary"
                          iconStart={<Icon name="success" />}
                          onClick={() => {
                            setSignError(undefined);
                            setSigning(list);
                          }}
                        >
                          Підписано Головою
                        </Button>
                      </div>
                    </div>
                  ) : mine ? (
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

      <RaportDialog
        request={reading ?? undefined}
        open={reading !== null}
        onClose={() => setReading(null)}
        extraActions={
          reading ? (
            <>
              <Button
                onClick={() => {
                  startReturn(reading);
                  setReading(null);
                }}
              >
                Повернути…
              </Button>
              {/* Рішення після читання: заявка йде в добірку для денного переліку (як галочка в таблиці) або з неї виходить. */}
              <Button
                variant={checked.has(reading.id) ? "secondary" : "primary"}
                iconStart={<Icon name={checked.has(reading.id) ? "close" : "add"} />}
                onClick={() => {
                  toggle(reading.id, !checked.has(reading.id));
                  setReading(null);
                }}
              >
                {checked.has(reading.id) ? "Прибрати з переліку" : "Додати до переліку"}
              </Button>
            </>
          ) : undefined
        }
      />
      <SedoDialog
        open={signing !== null}
        final
        requestCount={signing?.requestIds.length ?? 0}
        totalText={signing ? formatMoney(listTotal(signing)) : ""}
        pending={sign.isPending}
        error={signError}
        onClose={() => setSigning(null)}
        onConfirm={doSign}
      />
      <Dialog
        open={refused !== null}
        onClose={() => setRefused(null)}
        kind="confirm"
        title="Голова не підписав перелік?"
        description={`Часткового підпису немає: усі заявки переліку (${refused?.requestIds.length ?? 0}) повернуться авторам із вашою приміткою, рівні 4–1 отримають сповіщення. Бюджет не резервувався.`}
        actions={
          <>
            <Button onClick={() => setRefused(null)}>Скасувати</Button>
            <Button variant="destructive" loading={notSigned.isPending} loadingLabel="Повернення" disabled={refuseNote.trim() === ""} onClick={doNotSigned}>
              Повернути авторам
            </Button>
          </>
        }
      >
        <Textarea label="Чому не підписано" required rows={3} maxLength={2000} value={refuseNote} error={refuseError} onChange={(e) => setRefuseNote(e.currentTarget.value)} />
      </Dialog>
      <DocumentDialog
        open={viewed !== undefined}
        onClose={() => setViewingList(null)}
        title={viewed ? listDocModel(listInput(viewed)).documentTitle : "Перелік"}
        description="Перелік за день на підпис Голові: роздрукуйте або завантажте його й передайте на підпис Голові."
        html={viewed ? buildListHtml(listInput(viewed)) : null}
        makeDocx={viewed ? async () => (await import("../lib/docx-export.ts")).buildListDocx(listInput(viewed)) : null}
        fileName={viewed ? listDocModel(listInput(viewed)).fileName : "Перелік.docx"}
        what="перелік"
      />
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
