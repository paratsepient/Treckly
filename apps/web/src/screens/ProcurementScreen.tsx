import { useMemo, useState } from "react";
import { Badge, Button, DataState, Icon, Input, SegmentedControl, Textarea } from "@index/ui";
import { Dialog, useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { InfoHint } from "../components/InfoHint.tsx";
import { RaportButton } from "../components/RaportDialog.tsx";
import { formatDateShort, formatMoney, requestLabel, STATUS_TONES, statusText } from "../lib/format.ts";
import { requestTotal } from "../lib/totals.ts";

type Request = ApiOutput<"registry">["requests"][number];
type Tab = "waiting" | "on_base" | "done";

const TABS: readonly { value: Tab; label: string; statuses: readonly Request["status"][] }[] = [
  { value: "waiting", label: "Чекає закупівлі", statuses: ["extract_issued"] },
  { value: "on_base", label: "На складі бази", statuses: ["procured"] },
  { value: "done", label: "Завершені", statuses: ["issued", "not_procured"] },
];

const errorText = (error: unknown): string => (error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : "Невідома помилка");

/**
 * Закупівлі й видача (адміністрація): після підпису Голови й витягу заявка чекає закупівлі. Адміністрація
 * підтверджує закупівлю з документом приймання (нове — на складі бази, закріплене за в/ч), видає нове одним актом
 * (старе із замін — на інший облік) або закриває як не виконано (резерв бюджету вивільняється).
 */
export function ProcurementScreen() {
  const feedback = useFeedback();
  const registry = useApiQuery("registry");
  const positions = useApiQuery("positions");
  const reference = useApiQuery("reference");
  const procure = useApiMutation("procureRequest");
  const issue = useApiMutation("issueRequest");
  const notProcured = useApiMutation("notProcuredRequest");

  const [tab, setTab] = useState<Tab>("waiting");
  const [procuring, setProcuring] = useState<Request | null>(null);
  const [issuing, setIssuing] = useState<Request | null>(null);
  const [failing, setFailing] = useState<Request | null>(null);
  const [doc, setDoc] = useState("");
  const [recipient, setRecipient] = useState("Склад бази");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [act, setAct] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();

  const all = registry.data?.requests ?? [];
  const priced = positions.data?.positions ?? [];
  const unitName = (id: string) => reference.data?.units.find((u) => u.id === id)?.name ?? id;
  const nameOf = (positionId: string) => priced.find((p) => p.id === positionId)?.name ?? positionId;
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.value, all.filter((r) => t.statuses.includes(r.status)).length])), [all]);
  const rows = all.filter((r) => (TABS.find((t) => t.value === tab)?.statuses ?? []).includes(r.status));

  const openProcure = (r: Request) => {
    setError(undefined);
    setDoc("");
    setRecipient("Склад бази");
    setQuantities(Object.fromEntries(r.lines.map((l) => [l.id, String(l.qty)])));
    setProcuring(r);
  };
  const done = (title: string, description: string) => feedback.notify({ key: "procurement", tone: "success", title, description });

  const doProcure = () => {
    if (!procuring) return;
    setError(undefined);
    const qty = Object.fromEntries(Object.entries(quantities).map(([id, v]) => [id, Number.parseInt(v, 10) || 0]));
    procure.mutate(
      { params: { id: procuring.id }, body: { acceptanceDoc: doc, recipient, quantities: qty, expectedRevision: procuring.revision } },
      {
        onSuccess: () => {
          done(`${requestLabel(procuring.id)}: закупівлю підтверджено`, "Нове на складі бази, закріплене за в/ч. Автор отримав сповіщення.");
          setProcuring(null);
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  };
  const doIssue = () => {
    if (!issuing) return;
    setError(undefined);
    issue.mutate(
      { params: { id: issuing.id }, body: { act, expectedRevision: issuing.revision } },
      {
        onSuccess: () => {
          done(`${requestLabel(issuing.id)}: нове видано`, "Видано одним актом; старе із замін передано на інший облік.");
          setIssuing(null);
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  };
  const doFail = () => {
    if (!failing) return;
    setError(undefined);
    notProcured.mutate(
      { params: { id: failing.id }, body: { note, expectedRevision: failing.revision } },
      {
        onSuccess: () => {
          done(`${requestLabel(failing.id)}: закрито як не виконано`, "Статус заміни знято, резерв бюджету вивільнено.");
          setFailing(null);
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  };

  return (
    <ScreenFrame
      title="Закупівлі й видача"
      meta={registry.data ? `Чекає закупівлі: ${counts["waiting"] ?? 0} · на складі бази: ${counts["on_base"] ?? 0}` : undefined}
      surfaceLabel="Закупівлі й видача"
      actions={
        <InfoHint
          label="Як працює закупівля"
          text="Після підпису Голови й витягу заявка чекає закупівлі. Підтвердіть закупівлю з документом приймання (кількість має збігатися із заявкою) — нове ляже на склад бази за в/ч. Потім видайте нове одним актом: старе із замін передається на інший облік. Якщо закупівля зірвалась — закрийте як не виконано, резерв бюджету вивільниться."
        />
      }
    >
      <SegmentedControl
        label="Етап закупівлі"
        hideLabel
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        options={TABS.map((t) => ({ value: t.value, label: `${t.label} · ${counts[t.value] ?? 0}` }))}
      />
      {registry.isPending ? (
        <DataState kind="loading" title="Завантаження заявок…" />
      ) : registry.isError ? (
        <DataState kind="error" title="Не вдалося завантажити заявки" />
      ) : rows.length === 0 ? (
        <DataState kind="empty" title={tab === "waiting" ? "Нічого не чекає закупівлі" : tab === "on_base" ? "На складі бази нічого не лежить" : "Завершених закупівель ще немає"} />
      ) : (
        <ul className="request-cards" aria-label={TABS.find((t) => t.value === tab)?.label ?? ""}>
          {rows.map((r) => (
            <li key={r.id}>
              <article className="request-card procurement-card" aria-label={`${requestLabel(r.id)} · ${unitName(r.route[0])}`}>
                <header className="request-card__head">
                  <span className="request-card__number">{requestLabel(r.id)}</span>
                  <Badge tone={STATUS_TONES[r.status]}>{statusText(r.status, r.level)}</Badge>
                </header>
                <p className="request-card__title" data-empty={r.title ? undefined : "true"}>
                  {r.title || unitName(r.route[0])}
                </p>
                <ul className="procurement-card__lines">
                  {r.lines.map((l) => (
                    <li key={l.id}>
                      {l.kind === "replacement" ? `${l.newItem.name} (замість: ${nameOf(l.positionId)})` : nameOf(l.positionId)} × {l.qty}
                    </li>
                  ))}
                </ul>
                {r.procurement ? (
                  <p className="procurement-card__info">
                    {r.procurement.acceptanceDoc ? `Документ приймання: ${r.procurement.acceptanceDoc}. Отримувач: ${r.procurement.recipient ?? "—"}. ` : ""}
                    {r.procurement.issueAct ? `Акт видачі: ${r.procurement.issueAct}${r.procurement.issuedAt ? ` від ${formatDateShort(r.procurement.issuedAt)}` : ""}. ` : ""}
                    {r.procurement.note ? `Примітка: ${r.procurement.note}` : ""}
                  </p>
                ) : null}
                <footer className="request-card__foot">
                  <strong className="request-card__sum">{formatMoney(requestTotal(r, priced))}</strong>
                  <span>{unitName(r.route[0])}</span>
                </footer>
                <div className="procurement-card__actions">
                  <RaportButton request={r} />
                  {r.status === "extract_issued" ? (
                    <>
                      <Button
                        onClick={() => {
                          setError(undefined);
                          setNote("");
                          setFailing(r);
                        }}
                      >
                        Не виконано…
                      </Button>
                      <Button variant="primary" iconStart={<Icon name="success" />} onClick={() => openProcure(r)}>
                        Підтвердити закупівлю…
                      </Button>
                    </>
                  ) : null}
                  {r.status === "procured" ? (
                    <Button
                      variant="primary"
                      iconStart={<Icon name="success" />}
                      onClick={() => {
                        setError(undefined);
                        setAct("");
                        setIssuing(r);
                      }}
                    >
                      Видати актом…
                    </Button>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={procuring !== null}
        onClose={() => setProcuring(null)}
        title={`Підтвердити закупівлю ${procuring ? requestLabel(procuring.id) : ""}`}
        description="Фактична кількість має збігатися із заявкою; інакше заявку треба змінити."
        size="medium"
        actions={
          <>
            <Button onClick={() => setProcuring(null)}>Скасувати</Button>
            <Button variant="primary" loading={procure.isPending} loadingLabel="Підтвердження" disabled={doc.trim() === "" || recipient.trim() === ""} onClick={doProcure}>
              Підтвердити закупівлю
            </Button>
          </>
        }
      >
        <div className="procurement-form">
          <Input label="Документ приймання" required value={doc} onChange={(e) => setDoc(e.currentTarget.value)} placeholder="Наприклад, АП-2027-17" />
          <Input label="Отримувач" required value={recipient} onChange={(e) => setRecipient(e.currentTarget.value)} />
          {procuring?.lines.map((l) => (
            <Input
              key={l.id}
              label={`Фактична кількість: ${l.kind === "replacement" ? l.newItem.name : nameOf(l.positionId)} (у заявці ${l.qty})`}
              inputMode="numeric"
              value={quantities[l.id] ?? ""}
              onChange={(e) => setQuantities((q) => ({ ...q, [l.id]: e.currentTarget.value }))}
            />
          ))}
          {error ? <p className="procurement-form__error" role="alert">{error}</p> : null}
        </div>
      </Dialog>

      <Dialog
        open={issuing !== null}
        onClose={() => setIssuing(null)}
        title={`Видати нове за ${issuing ? requestLabel(issuing.id) : ""}`}
        description="Усе нове за заявкою видається одним актом; у тому ж акті МВО здає старе із замін, воно передається на інший облік."
        actions={
          <>
            <Button onClick={() => setIssuing(null)}>Скасувати</Button>
            <Button variant="primary" loading={issue.isPending} loadingLabel="Видача" disabled={act.trim() === ""} onClick={doIssue}>
              Видати
            </Button>
          </>
        }
      >
        <div className="procurement-form">
          <Input label="Номер акта видачі" required value={act} onChange={(e) => setAct(e.currentTarget.value)} />
          {error ? <p className="procurement-form__error" role="alert">{error}</p> : null}
        </div>
      </Dialog>

      <Dialog
        open={failing !== null}
        onClose={() => setFailing(null)}
        kind="confirm"
        title={`Закрити ${failing ? requestLabel(failing.id) : ""} як не виконано?`}
        description="Закупівля не відбулася: статус заміни знімається, резерв бюджету вивільняється, автор отримає сповіщення з приміткою."
        actions={
          <>
            <Button onClick={() => setFailing(null)}>Скасувати</Button>
            <Button variant="destructive" loading={notProcured.isPending} loadingLabel="Закриття" disabled={note.trim() === ""} onClick={doFail}>
              Закрити як не виконано
            </Button>
          </>
        }
      >
        <div className="procurement-form">
          <Textarea label="Примітка" required rows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
          {error ? <p className="procurement-form__error" role="alert">{error}</p> : null}
        </div>
      </Dialog>
    </ScreenFrame>
  );
}
