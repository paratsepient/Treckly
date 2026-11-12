import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Badge, Button, DataState, Icon } from "@index/ui";
import { Dialog, useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { RaportButton } from "../components/RaportDialog.tsx";
import { requestTabs } from "../components/RequestTabs.tsx";
import { daysAtLevel } from "@dsp/domain";
import { formatDateShort, formatMoney, requestLabel, STATUS_TONES, statusText } from "../lib/format.ts";
import { requestTotal } from "../lib/totals.ts";

type Request = ApiOutput<"myRequests">["requests"][number];
type Positions = ApiOutput<"positions">["positions"];

/** «Де зараз»: рівень, на якому заявка, або що з нею сталося. */
function whereNow(request: Request, levelNames: ReadonlyMap<number, string>): string {
  if (request.level !== null && (request.status === "at_level" || request.status === "in_list")) return `${request.level}. ${levelNames.get(request.level) ?? ""}`;
  if (request.status === "returned") return request.returnInfo ? `Автор (повернув рівень ${request.returnInfo.level})` : "Автор";
  if (request.status === "approved" || request.status === "extract_issued") return "Затверджено Головою, чекає закупівлі";
  if (request.status === "procured") return "На складі бази";
  if (request.status === "issued") return "Видано в/ч";
  if (request.status === "not_procured") return "Закупівля не відбулася";
  return "—";
}

const WITHDRAWABLE = ["draft", "at_level", "in_list", "returned"] as const;

/** «Мої заявки» з треком 5 рівнів: де зараз заявка і скільки днів вона там. */
export function MyRequestsScreen({ selected }: { readonly selected: string | undefined }) {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mine = useApiQuery("myRequests");
  const positions = useApiQuery("positions");
  const reference = useApiQuery("reference");
  const session = useApiQuery("session");
  const detail = useApiQuery("requestDetail", { params: { id: selected ?? "" } }, { enabled: selected !== undefined });
  const withdraw = useApiMutation("withdrawRequest");

  const levelNames = new Map((reference.data?.levels ?? []).map((l) => [l.level as number, l.name]));
  const today = session.data?.today ?? "";
  const rows = mine.data?.requests ?? [];
  const state = mine.isPending ? "loading" : mine.isError ? "error" : rows.length === 0 ? "empty" : "ready";

  const select = (id: string | undefined) => void navigate({ to: "/my", search: { selected: id } });


  const request = detail.data?.request;
  const canEdit = request && (request.status === "draft" || request.status === "returned");
  const canWithdraw = request && (WITHDRAWABLE as readonly string[]).includes(request.status);

  const doWithdraw = () => {
    if (!request) return;
    withdraw.mutate(
      { params: { id: request.id }, body: { expectedRevision: request.revision } },
      {
        onSuccess: () => feedback.notify({ key: "withdrawn", tone: "success", title: "Заявку відкликано", description: requestLabel(request.id) }),
        onError: (error) =>
          feedback.notify({ key: "withdraw-error", tone: "error", title: "Не вдалося відкликати", description: error instanceof ApiClientError ? error.message : "Невідома помилка" }),
        onSettled: () => setConfirmOpen(false),
      },
    );
  };

  const inspector = (
    <DetailPanel
      title={request?.title || (selected ? requestLabel(selected) : "Заявка")}
      subtitle={request ? `${request.title ? `${requestLabel(request.id)} · ` : ""}Версія ${request.version} · ${statusText(request.status, request.level)}` : undefined}
      empty={!selected}
      emptyText="Оберіть заявку в таблиці, щоб побачити її трек."
      actions={
        request ? (
          <>
            {canEdit ? (
              <Button
                variant="primary"
                iconStart={<Icon name="edit" />}
                onClick={() => void navigate({ to: "/new", search: { id: request.id } })}
              >
                {request.status === "returned" ? "Виправити й подати" : "Продовжити заповнення"}
              </Button>
            ) : null}
            <RaportButton request={request} />
            {canWithdraw ? (
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                Відкликати
              </Button>
            ) : null}
          </>
        ) : undefined
      }
      tabs={
        detail.data
          ? requestTabs({
              detail: detail.data,
              positions: positions.data?.positions ?? [],
              levels: (reference.data?.levels ?? []).map((l) => ({ level: l.level, name: l.name })),
            })
          : undefined
      }
    >
      {selected && detail.isPending ? <DataState kind="loading" size="compact" /> : null}
      {selected && detail.isError ? <DataState kind="error" size="compact" title="Не вдалося завантажити заявку" /> : null}
    </DetailPanel>
  );

  return (
    <>
      <ScreenFrame
        title="Мої заявки"
        meta={mine.data ? `${rows.length} заявок` : undefined}
        surfaceLabel="Мої заявки"
        primaryAction={
          <Button variant="primary" iconStart={<Icon name="add" />} onClick={() => void navigate({ to: "/new", search: { id: undefined } })}>
            Нова заявка
          </Button>
        }
        inspector={inspector}
        inspectorLabel="Картка заявки"
        inspectorOpen={selected !== undefined}
        onInspectorOpenChange={(open) => {
          if (!open) select(undefined);
        }}
        {...(selected ? { inspectorKey: selected } : {})}
      >
        {state !== "ready" ? (
          <DataState
            kind={state === "loading" ? "loading" : state === "error" ? "error" : "empty"}
            title={state === "loading" ? "Завантаження заявок…" : state === "error" ? "Не вдалося завантажити заявки" : "Заявок ще немає"}
            {...(state === "empty" ? { description: "Створіть першу заявку кнопкою «Нова заявка»." } : {})}
          />
        ) : (
          <ul className="request-cards" aria-label="Мої заявки">
            {rows.map((r) => {
              const atLevel = r.status === "at_level" || r.status === "in_list" || r.status === "returned";
              return (
                <li key={r.id}>
                  <article className="request-card" aria-current={r.id === selected ? "true" : undefined} aria-labelledby={`card-${r.id}`}>
                    <header className="request-card__head">
                      {/* Кнопка-номер розтягнута на всю картку: клік будь-де відкриває картку заявки. */}
                      <button type="button" id={`card-${r.id}`} className="request-card__open" onClick={() => select(r.id)}>
                        {requestLabel(r.id)}
                      </button>
                      <Badge tone={STATUS_TONES[r.status]}>{statusText(r.status, r.level)}</Badge>
                    </header>
                    <p className="request-card__title" data-empty={r.title ? undefined : "true"}>
                      {r.title || "Без назви"}
                    </p>
                    <dl className="request-card__facts">
                      <div>
                        <dt>Де зараз</dt>
                        <dd>{whereNow(r, levelNames)}</dd>
                      </div>
                      <div>
                        <dt>Днів на рівні</dt>
                        <dd>{atLevel ? daysAtLevel(r, today) : "—"}</dd>
                      </div>
                    </dl>
                    <footer className="request-card__foot">
                      <strong className="request-card__sum">{formatMoney(requestTotal(r, positions.data?.positions ?? []))}</strong>
                      <span>{`${r.lines.length} ${r.lines.length === 1 ? "рядок" : r.lines.length < 5 ? "рядки" : "рядків"} · ${formatDateShort(r.createdOn)}`}</span>
                    </footer>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </ScreenFrame>
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Відкликати заявку?"
        description={
          request?.status === "in_list"
            ? "Заявка входить у сформований перелік: його буде розформовано, а решта заявок повернеться в чергу рівня."
            : "Заявка закриється, а рівні, на яких вона була, отримають сповіщення. Скасувати відкликання не можна."
        }
        kind="confirm"
        actions={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Не відкликати</Button>
            <Button variant="destructive" loading={withdraw.isPending} loadingLabel="Відкликання" onClick={doWithdraw}>
              Відкликати
            </Button>
          </>
        }
      />
    </>
  );
}
