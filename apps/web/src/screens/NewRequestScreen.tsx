import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, DataState, Icon, IconButton, Input, Select, Textarea } from "@index/ui";
import { InfoHint } from "../components/InfoHint.tsx";
import { Dialog, ToolbarGroup, useFeedback, WorkspaceToolbar, type SaveStatusProps } from "@index/ui-patterns";
import type { RequestStatus } from "@dsp/domain";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { CheckPanel, issueText } from "../components/CheckPanel.tsx";
import { LinesEditor } from "../components/LinesEditor.tsx";
import { RaportButton } from "../components/RaportDialog.tsx";
import { SedoDialog } from "../components/SedoDialog.tsx";
import {
  canRedo,
  canUndo,
  editorReducer,
  emptyHistory,
  fromRequestLines,
  linesKey,
  toRequestLines,
  type CatalogItem,
  type CatalogPosition,
} from "../lib/editor-state.ts";
import { formatMoney, FUNDING_LABELS, requestLabel, serviceName } from "../lib/format.ts";
import { requestTotal } from "../lib/totals.ts";
import { useDebounced } from "../lib/useDebounced.ts";

const EDITABLE: readonly RequestStatus[] = ["draft", "returned"];
const HINT =
  "Оберіть позиції, заплановані на вашу в/ч у Попередньому переліку 2027, і напишіть обґрунтування — решту рапорту система заповнить за шаблоном. " +
  "Для заміни виберіть схожий предмет: у межах одного КЕКВ ліміт не витрачається, на інший КЕКВ — списується. " +
  "КЕКВ — код видатків бюджету: 2210 — предмети й матеріали, 2220 — медикаменти, 3110 — обладнання довгострокового користування. " +
  "СЕДО — система електронного документообігу: там ви реєструєте рапорт і отримуєте номер, який вводите при поданні.";
const newId = (): string => `ln-${crypto.randomUUID().slice(0, 8)}`;

const errorText = (error: unknown): string =>
  error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : "Невідома помилка";

interface ServerState {
  id: string | null;
  revision: number;
  status: RequestStatus | null;
  version: number;
  /** Канонічний ключ рядків і обґрунтування, які вже збережено. */
  savedKey: string;
}

/** Ключ збереження: рядки й обґрунтування разом — зміна будь-чого з них зберігається. */
const draftKey = (linesKeyValue: string, justification: string, title = "", funding: Funding = "general"): string =>
  JSON.stringify([linesKeyValue, justification, title, funding]);
type Funding = "general" | "special";
const EMPTY_KEY = draftKey(linesKey([]), "");

/**
 * Нова заявка (і виправлення повернутої). Чернетка зберігається автоматично, дія одна явна —
 * «Подати». Праворуч — автоперевірки й вплив на бюджет напрямку, оновлюються під час заповнення.
 */
export function NewRequestScreen({ requestId }: { readonly requestId: string | undefined }) {
  const navigate = useNavigate();
  const feedback = useFeedback();

  const reference = useApiQuery("reference");
  const positionsQuery = useApiQuery("positions");
  const propertyQuery = useApiQuery("property");
  const mineQuery = useApiQuery("myRequests");
  const budgetQuery = useApiQuery("budget");
  const detail = useApiQuery("requestDetail", { params: { id: requestId ?? "" } }, { enabled: requestId !== undefined });

  const create = useApiMutation("createRequest");
  const edit = useApiMutation("editLines");
  const submit = useApiMutation("submitRequest");
  const newVersion = useApiMutation("newVersion");

  const [history, dispatch] = useReducer(editorReducer, undefined, () => emptyHistory());
  const [loaded, setLoaded] = useState(requestId === undefined);
  const [saveState, setSaveState] = useState<SaveStatusProps["state"]>("idle");
  const [savedAt, setSavedAt] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [justification, setJustification] = useState("");
  /** Назва заявки від автора; порожня — показується номер. */
  const [name, setName] = useState("");
  const [funding, setFunding] = useState<Funding>("general");
  const session = useApiQuery("session");
  const departmentName = reference.data?.units.find((u) => u.id === session.data?.user.departmentId)?.name;
  const service = departmentName ? serviceName(departmentName) : "";
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const server = useRef<ServerState>({ id: null, revision: 0, status: null, version: 1, savedKey: EMPTY_KEY });

  const items = useMemo<readonly CatalogItem[]>(() => reference.data?.items ?? [], [reference.data]);
  // Автор може замовити лише те, що заплановано на його в/ч: у виборі лише позиції плану, а «можна замовити» —
  // менше з плану в/ч і доступного за переліком напрямку. Позиції рядків, що вже є в заявці, лишаються (їх покаже перевірка).
  const plannedByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of propertyQuery.data?.items ?? []) if (row.tab === "planned") map.set(row.item.code, (map.get(row.item.code) ?? 0) + row.qty);
    return map;
  }, [propertyQuery.data]);
  const allPositions = useMemo<readonly CatalogPosition[]>(() => positionsQuery.data?.positions ?? [], [positionsQuery.data]);
  // Інші заявки в/ч: скільки вже замовлено (план рахується разом із ними) і які позиції зайняті незавершеними.
  const { ordered, busy } = useMemo(() => {
    const orderedMap = new Map<string, number>();
    const busySet = new Set<string>();
    for (const r of mineQuery.data?.requests ?? []) {
      if (r.id === requestId) continue;
      const counts = r.status !== "draft" && r.status !== "withdrawn" && r.status !== "not_procured";
      const unfinished = r.status === "at_level" || r.status === "in_list" || r.status === "returned";
      for (const line of r.lines) {
        if (counts) orderedMap.set(line.positionId, (orderedMap.get(line.positionId) ?? 0) + line.qty);
        if (unfinished) busySet.add(line.positionId);
      }
    }
    return { ordered: orderedMap, busy: busySet };
  }, [mineQuery.data, requestId]);
  const positions = useMemo<readonly CatalogPosition[]>(() => {
    const inEditor = new Set(history.present.map((l) => l.positionId));
    return allPositions
      .filter((p) => inEditor.has(p.id) || (plannedByCode.has(p.code) && !busy.has(p.id)))
      .map((p) => ({ ...p, availableQty: Math.max(0, Math.min(p.availableQty, (plannedByCode.get(p.code) ?? p.availableQty) - (ordered.get(p.id) ?? 0))) }));
  }, [allPositions, plannedByCode, history.present, ordered, busy]);
  const positionMap = useMemo(() => new Map(allPositions.map((p) => [p.id, p])), [allPositions]);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const converted = useMemo(() => toRequestLines(history.present, positionMap, itemMap), [history.present, positionMap, itemMap]);
  const key = draftKey(linesKey(converted.lines), justification, name, funding);

  // Інша заявка в адресі (або «Нова заявка» після відкритої): редактор починається заново.
  // Адреса, яку ми самі щойно виставили після створення чернетки, збігається з server.id й пропускається.
  useEffect(() => {
    if (requestId === server.current.id) return;
    server.current = { id: null, revision: 0, status: null, version: 1, savedKey: EMPTY_KEY };
    dispatch({ type: "load", lines: [] });
    setJustification("");
    setName("");
    setFunding("general");
    setLoaded(requestId === undefined);
    setSaveState("idle");
  }, [requestId]);

  // Завантаження збереженої заявки (чернетка чи повернута) один раз, коли готові довідники.
  useEffect(() => {
    const request = detail.data?.request;
    if (!request || reference.data === undefined || request.id === server.current.id) return;
    server.current = { id: request.id, revision: request.revision, status: request.status, version: request.version, savedKey: draftKey(linesKey(request.lines), request.justification, request.title, request.funding) };
    dispatch({ type: "load", lines: fromRequestLines(request.lines, items) });
    setJustification(request.justification);
    setName(request.title);
    setFunding(request.funding);
    setLoaded(true);
  }, [detail.data, reference.data, items]);

  const readOnly = server.current.status !== null && !EDITABLE.includes(server.current.status);

  // Автоперевірки: показують проблеми й вплив на бюджет, поки автор заповнює.
  const debouncedLines = useDebounced(converted.lines, 350);
  const check = useApiQuery(
    "checkRequest",
    { body: { lines: [...debouncedLines], ...(server.current.id ? { requestId: server.current.id } : {}) } },
    { enabled: loaded && debouncedLines.length > 0, keepPrevious: true },
  );
  const report = debouncedLines.length > 0 ? (check.data?.report ?? null) : null;

  const latest = useRef({ lines: converted.lines, justification, name, funding });
  latest.current = { lines: converted.lines, justification, name, funding };
  const chain = useRef<Promise<void>>(Promise.resolve());

  const saveOnce = useCallback(async (): Promise<void> => {
    const { lines, justification: text, name: label, funding: source } = latest.current;
    const s = server.current;
    const lineKey = draftKey(linesKey(lines), text, label, source);
    if (lineKey === s.savedKey) {
      setSaveState((prev) => (prev === "dirty" ? "saved" : prev));
      return;
    }
    if (s.id === null && lines.length === 0 && text.trim() === "" && label.trim() === "") return;
    setSaveState("saving");
    try {
      if (s.id === null) {
        const { request } = await create.mutateAsync({ body: { lines: [...lines], justification: text, title: label, funding: source } });
        server.current = { id: request.id, revision: request.revision, status: request.status, version: request.version, savedKey: lineKey };
        // Адреса запам'ятовує заявку: після перезавантаження сторінки чернетка знайдеться. Лише якщо людина
        // досі в редакторі: збереження, що завершилось уже після переходу в інший розділ, не повертає її назад.
        if (window.location.hash.startsWith("#/new")) void navigate({ to: "/new", search: { id: request.id }, replace: true });
      } else {
        const { request } = await edit.mutateAsync({ params: { id: s.id }, body: { lines: [...lines], justification: text, title: label, funding: source, expectedRevision: s.revision } });
        server.current = { ...s, revision: request.revision, savedKey: lineKey };
      }
      setSaveState("saved");
      setSavedAt(new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      setSaveState("error");
      feedback.notify({ key: "save-error", tone: "error", title: "Не вдалося зберегти чернетку", description: errorText(error) });
      throw error;
    }
  }, [create, edit, navigate, feedback]);

  /** Збереження виконуються по черзі: нова зміна не перетинається з попереднім запитом. */
  const saveNow = useCallback((): Promise<void> => {
    const next = chain.current.then(saveOnce);
    chain.current = next.catch(() => undefined);
    return next;
  }, [saveOnce]);

  useEffect(() => {
    if (!loaded || readOnly || key === server.current.savedKey) return;
    setSaveState("dirty");
    const timer = setTimeout(() => void saveNow().catch(() => undefined), 800);
    return () => clearTimeout(timer);
  }, [key, loaded, readOnly, saveNow]);

  const rowOf = useMemo(() => new Map(history.present.map((line, index) => [line.id, index + 1])), [history.present]);
  const problems = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of report?.errors ?? []) {
      if (issue.lineId === null) continue;
      map.set(issue.lineId, [...(map.get(issue.lineId) ?? []), issueText(issue, new Map())]);
    }
    return map;
  }, [report]);

  const returned = detail.data?.request.status === "returned" ? detail.data.request.returnInfo : null;
  const isResubmit = server.current.status === "returned";
  const hasErrors = (report?.errors.length ?? 0) > 0;
  const noJustification = justification.trim() === "";
  const noService = service.trim() === "";
  const noCondition = history.present.some((l) => l.kind === "replacement" && l.condition === "");
  // Що саме заважає подати: показуємо під кнопкою, а не лише робимо її сірою.
  const incompleteRows = converted.incomplete.map((id) => rowOf.get(id)).filter((n): n is number => n !== undefined);
  const submitWhy = [
    history.present.length === 0 ? "додайте хоча б один рядок" : null,
    incompleteRows.length > 0 ? `оберіть позицію й кількість (для заміни — ще й предмет) у ${incompleteRows.length === 1 ? "рядку" : "рядках"} ${incompleteRows.join(", ")}` : null,
    noCondition ? "вкажіть стан майна, яке замінюєте" : null,
    noJustification ? "напишіть обґрунтування" : null,
    hasErrors ? "виправте помилки автоперевірок (праворуч)" : null,
    noService ? "у вашому профілі не вказано відділ — зверніться до адміністратора" : null,
  ].filter((reason): reason is string => reason !== null);
  const blocked =
    history.present.length === 0 ||
    noService ||
    noCondition || converted.incomplete.length > 0 || noJustification || hasErrors || check.isFetching || linesKey(debouncedLines) !== linesKey(converted.lines);

  const [sedoOpen, setSedoOpen] = useState(false);
  const [sedoError, setSedoError] = useState<string | undefined>();
  const onSubmit = async (sedoNumber: string) => {
    setSubmitting(true);
    setSedoError(undefined);
    try {
      await saveNow();
      const s = server.current;
      if (s.id === null) return;
      const operation = isResubmit ? newVersion : submit;
      await operation.mutateAsync({ params: { id: s.id }, body: { expectedRevision: s.revision, sedoNumber } });
      setSedoOpen(false);
      feedback.notify({
        key: "submitted",
        tone: "success",
        title: isResubmit ? "Нову версію подано" : "Заявку подано",
        description: `${requestLabel(s.id)} у черзі рівня 1.`,
      });
      void navigate({ to: "/my", search: { selected: s.id } });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "SEDO_NUMBER_INVALID") {
        setSedoError(error.message);
        return;
      }
      setSedoOpen(false);
      feedback.notify({ key: "submit-error", tone: "error", title: "Заявку не подано", description: errorText(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const saveStatus: SaveStatusProps = {
    state: saveState,
    ...(savedAt ? { savedAt } : {}),
    onRetry: () => void saveNow().catch(() => undefined),
  };

  const number = requestId ? requestLabel(requestId) : undefined;
  const title = name.trim() !== "" ? name.trim() : number ? `Заявка ${number}` : "Нова заявка";
  // Стан документа — коротко; про збереження каже окремий індикатор поруч («Збережено о …»), щоб не суперечити йому.
  const documentState = isResubmit ? `Повернуто · версія ${server.current.version}` : "Чернетка";
  const dataReady = reference.data !== undefined && positionsQuery.data !== undefined && propertyQuery.data !== undefined && mineQuery.data !== undefined;
  // Рапорт показує те, що зараз на екрані: збережена заявка дає маршрут і номер, редактор — рядки й текст.
  const saved = detail.data?.request;
  const raportTotalText = formatMoney(requestTotal({ lines: converted.lines }, allPositions));
  const raportRequest = saved && saved.id === server.current.id ? { ...saved, lines: converted.lines, justification, service, funding } : undefined;
  const failed = reference.isError || positionsQuery.isError || propertyQuery.isError || (requestId !== undefined && detail.isError);

  const saveName = () => {
    setName(nameDraft.trim());
    setRenaming(false);
  };

  return (
    <>
    <ScreenFrame
      title={title}
      surfaceLabel="Заповнення заявки"
      {...(readOnly || failed ? {} : { documentState, saveStatus })}
      {...(name.trim() !== "" && number ? { meta: number } : {})}
      actions={
        <>
          {readOnly ? null : (
            <IconButton
              label="Перейменувати заявку"
              icon={<Icon name="rename" />}
              onClick={() => {
                setNameDraft(name);
                setRenaming(true);
              }}
            />
          )}
          {readOnly ? null : (
            // Джерело фінансування — короткий вибір у шапці, між перейменуванням і підказкою.
            <span className="header-funding">
              <Select label="Джерело фінансування" hideLabel value={funding} onChange={(event) => setFunding(event.target.value as Funding)}>
                {Object.entries(FUNDING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </span>
          )}
          {/* Пояснення до заповнення — у підказці біля назви: на екрані лишаються лише поля. */}
          <InfoHint label="Як заповнити заявку" text={HINT} />
        </>
      }
      inspector={
        <DetailPanel title="Перевірки і бюджет" subtitle="Оновлюються, поки ви заповнюєте заявку">
          <CheckPanel report={report} budget={budgetQuery.data} rowOf={rowOf} pending={check.isFetching} incompleteCount={converted.incomplete.length} />
        </DetailPanel>
      }
      inspectorLabel="Перевірки і бюджет"
      inspectorPlacement="aside"
    >
      {failed ? (
        <DataState kind="error" title="Не вдалося завантажити дані заявки" description="Оновіть сторінку або скиньте демо в демо-середовищі (кнопка «Демо» вгорі)." />
      ) : !dataReady || !loaded ? (
        <DataState kind="loading" title="Завантаження заявки…" />
      ) : readOnly ? (
        <DataState
          kind="denied"
          title="Заявку вже подано"
          description="Подану заявку не можна редагувати. Її статус і трек — у «Моїх заявках»; відкликати можна, поки її не затверджено."
          action={
            <Button variant="primary" onClick={() => void navigate({ to: "/my", search: { selected: server.current.id ?? undefined } })}>
              До моїх заявок
            </Button>
          }
        />
      ) : (
        <>
          {returned ? (
            <p className="return-note" role="note">
              <strong>{`Повернуто рівнем ${returned.level}.`}</strong> {returned.note}
              <span className="return-note__hint"> Виправте заявку й подайте нову версію: вона піде з першого рівня.</span>
            </p>
          ) : null}
          {/* Служба береться з профілю автора; на екрані лише попередження, якщо відділ не вказано. */}
          {service ? null : (
            <p className="return-note" role="note">
              Відділ у вашому профілі не вказано — зверніться до адміністратора: без нього заявку не подати.
            </p>
          )}
          <LinesEditor lines={history.present} positions={positions} items={items} dispatch={dispatch} problems={problems} newLineId={newId} />
          <section className="justification" aria-labelledby="justification-title">
            <h2 id="justification-title" className="justification__title">
              Обґрунтування
            </h2>
            <Textarea
              label="Обґрунтування потреби"
              hideLabel
              description="Навіщо підрозділу це майно: стан наявного, зміни в штаті, втрати. Текст піде в рапорт без змін; без нього заявку не подати."
              required
              rows={6}
              maxLength={4000}
              value={justification}
              onChange={(event) => setJustification(event.currentTarget.value)}
            />
          </section>
          {/* Дії форми — після того, що заповнюють: історія змін і рапорт ліворуч, «Подати» останньою праворуч. */}
          <div className="form-actions">
            <WorkspaceToolbar label="Дії редактора заявки">
              <ToolbarGroup label="Історія змін">
                <IconButton label="Відмінити" icon={<Icon name="undo" />} disabled={!canUndo(history)} onClick={() => dispatch({ type: "undo" })} />
                <IconButton label="Повторити" icon={<Icon name="redo" />} disabled={!canRedo(history)} onClick={() => dispatch({ type: "redo" })} />
              </ToolbarGroup>
            </WorkspaceToolbar>
            <span className="form-actions__main">
              <RaportButton request={raportRequest} label="Переглянути рапорт" />
              <Button
                variant="primary"
                disabled={blocked}
                loading={submitting}
                loadingLabel="Подання заявки"
                {...(submitWhy.length > 0 ? { "aria-describedby": "submit-why" } : {})}
                onClick={() => {
                  setSedoError(undefined);
                  setSedoOpen(true);
                }}>
                {isResubmit ? "Подати нову версію" : "Подати"}
              </Button>
            </span>
            {submitWhy.length > 0 ? (
              <p id="submit-why" className="form-actions__why">
                {`Щоб подати: ${submitWhy.join("; ")}.`}
              </p>
            ) : null}
          </div>
        </>
      )}
    </ScreenFrame>
    <SedoDialog
      open={sedoOpen}
      final={false}
      raport={{ resubmit: isResubmit }}
      requestCount={1}
      totalText={raportTotalText}
      pending={submitting}
      error={sedoError}
      onClose={() => setSedoOpen(false)}
      onConfirm={(value) => void onSubmit(value)}
    />
    <Dialog
      open={renaming}
      onClose={() => setRenaming(false)}
      title="Перейменувати заявку"
      description={`Назва допоможе впізнати заявку в списках. Номер ${number ?? "заявки"} лишається незмінним; порожня назва — показується номер.`}
      actions={
        <>
          <Button onClick={() => setRenaming(false)}>Скасувати</Button>
          <Button variant="primary" onClick={saveName}>
            Зберегти
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          saveName();
        }}
      >
        <Input label="Назва заявки" maxLength={120} value={nameDraft} placeholder="Наприклад, «Живлення для відділу зв'язку»" onChange={(event) => setNameDraft(event.currentTarget.value)} />
      </form>
    </Dialog>
    </>
  );
}
