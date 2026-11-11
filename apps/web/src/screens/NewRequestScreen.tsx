import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, DataState, Icon, IconButton } from "@index/ui";
import { ToolbarGroup, useFeedback, WorkspaceToolbar, type SaveStatusProps } from "@index/ui-patterns";
import type { RequestStatus } from "@dsp/domain";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { CheckPanel, issueText } from "../components/CheckPanel.tsx";
import { LinesEditor } from "../components/LinesEditor.tsx";
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
import { requestLabel } from "../lib/format.ts";
import { useDebounced } from "../lib/useDebounced.ts";

const EDITABLE: readonly RequestStatus[] = ["draft", "returned"];
const newId = (): string => `ln-${crypto.randomUUID().slice(0, 8)}`;

const errorText = (error: unknown): string =>
  error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : "Невідома помилка";

interface ServerState {
  id: string | null;
  revision: number;
  status: RequestStatus | null;
  version: number;
  /** Канонічний ключ рядків, які вже збережено. */
  savedKey: string;
}

/**
 * Нова заявка (і виправлення повернутої). Чернетка зберігається автоматично, дія одна явна —
 * «Подати». Праворуч — автоперевірки й вплив на бюджет напрямку, оновлюються під час заповнення.
 */
export function NewRequestScreen({ requestId }: { readonly requestId: string | undefined }) {
  const navigate = useNavigate();
  const feedback = useFeedback();

  const reference = useApiQuery("reference");
  const positionsQuery = useApiQuery("positions");
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
  const server = useRef<ServerState>({ id: null, revision: 0, status: null, version: 1, savedKey: linesKey([]) });

  const items = useMemo<readonly CatalogItem[]>(() => reference.data?.items ?? [], [reference.data]);
  const positions = useMemo<readonly CatalogPosition[]>(() => positionsQuery.data?.positions ?? [], [positionsQuery.data]);
  const positionMap = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const converted = useMemo(() => toRequestLines(history.present, positionMap, itemMap), [history.present, positionMap, itemMap]);
  const key = linesKey(converted.lines);

  // Інша заявка в адресі (або «Нова заявка» після відкритої): редактор починається заново.
  // Адреса, яку ми самі щойно виставили після створення чернетки, збігається з server.id й пропускається.
  useEffect(() => {
    if (requestId === server.current.id) return;
    server.current = { id: null, revision: 0, status: null, version: 1, savedKey: linesKey([]) };
    dispatch({ type: "load", lines: [] });
    setLoaded(requestId === undefined);
    setSaveState("idle");
  }, [requestId]);

  // Завантаження збереженої заявки (чернетка чи повернута) один раз, коли готові довідники.
  useEffect(() => {
    const request = detail.data?.request;
    if (!request || reference.data === undefined || request.id === server.current.id) return;
    server.current = { id: request.id, revision: request.revision, status: request.status, version: request.version, savedKey: linesKey(request.lines) };
    dispatch({ type: "load", lines: fromRequestLines(request.lines, items) });
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

  const latest = useRef(converted);
  latest.current = converted;
  const chain = useRef<Promise<void>>(Promise.resolve());

  const saveOnce = useCallback(async (): Promise<void> => {
    const { lines } = latest.current;
    const s = server.current;
    const lineKey = linesKey(lines);
    if (lineKey === s.savedKey) {
      setSaveState((prev) => (prev === "dirty" ? "saved" : prev));
      return;
    }
    if (s.id === null && lines.length === 0) return;
    setSaveState("saving");
    try {
      if (s.id === null) {
        const { request } = await create.mutateAsync({ body: { lines: [...lines] } });
        server.current = { id: request.id, revision: request.revision, status: request.status, version: request.version, savedKey: lineKey };
        // Адреса запам'ятовує заявку: після перезавантаження сторінки чернетка знайдеться.
        void navigate({ to: "/new", search: { id: request.id }, replace: true });
      } else {
        const { request } = await edit.mutateAsync({ params: { id: s.id }, body: { lines: [...lines], expectedRevision: s.revision } });
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
  const blocked = history.present.length === 0 || converted.incomplete.length > 0 || hasErrors || check.isFetching || linesKey(debouncedLines) !== key;

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      await saveNow();
      const s = server.current;
      if (s.id === null) return;
      const operation = isResubmit ? newVersion : submit;
      await operation.mutateAsync({ params: { id: s.id }, body: { expectedRevision: s.revision } });
      feedback.notify({
        key: "submitted",
        tone: "success",
        title: isResubmit ? "Нову версію подано" : "Заявку подано",
        description: `${requestLabel(s.id)} у черзі рівня 1.`,
      });
      void navigate({ to: "/my", search: { selected: s.id } });
    } catch (error) {
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

  const title = requestId ? `Заявка ${requestLabel(requestId)}` : "Нова заявка";
  const documentState = isResubmit ? `Повернуто · версія ${server.current.version}` : "Чернетка · зберігається автоматично";
  const dataReady = reference.data !== undefined && positionsQuery.data !== undefined;
  const failed = reference.isError || positionsQuery.isError || (requestId !== undefined && detail.isError);

  return (
    <ScreenFrame
      title={title}
      surfaceLabel="Заповнення заявки"
      {...(readOnly || failed ? {} : { documentState, saveStatus })}
      primaryAction={
        readOnly ? undefined : (
          <Button variant="primary" disabled={blocked || !loaded} loading={submitting} loadingLabel="Подання заявки" onClick={() => void onSubmit()}>
            {isResubmit ? "Подати нову версію" : "Подати"}
          </Button>
        )
      }
      actions={
        <WorkspaceToolbar label="Дії редактора заявки">
          <ToolbarGroup label="Історія змін">
            <IconButton label="Відмінити" icon={<Icon name="undo" />} disabled={readOnly || !canUndo(history)} onClick={() => dispatch({ type: "undo" })} />
            <IconButton label="Повторити" icon={<Icon name="redo" />} disabled={readOnly || !canRedo(history)} onClick={() => dispatch({ type: "redo" })} />
          </ToolbarGroup>
        </WorkspaceToolbar>
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
        <DataState kind="error" title="Не вдалося завантажити дані заявки" description="Оновіть сторінку або скиньте демо в демо-панелі." />
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
          <p className="screen__hint">
            Оберіть позиції з Попереднього переліку 2027 вашого напрямку. Для заміни виберіть схожий предмет: у межах одного КЕКВ ліміт не витрачається, на інший КЕКВ — списується.
          </p>
          <LinesEditor lines={history.present} positions={positions} items={items} dispatch={dispatch} problems={problems} newLineId={newId} />
        </>
      )}
    </ScreenFrame>
  );
}
