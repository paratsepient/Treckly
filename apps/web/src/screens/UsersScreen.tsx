import { useMemo, useState } from "react";
import { Badge, Button, Checkbox, DataTable, Input, Select, type DataTableColumn } from "@index/ui";
import { useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { InfoHint } from "../components/InfoHint.tsx";
import { serviceName } from "../lib/format.ts";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";

type User = ApiOutput<"session">["users"][number];
type Reference = ApiOutput<"reference">;

const ROLE_TEXT: Record<User["roleKind"], string> = {
  author: "Автор заявок",
  preparer: "Уповноважена особа",
  approver: "Керівник",
  admin: "Адміністратор",
};

const errorText = (error: unknown): string => (error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : "Невідома помилка");

/** Форма картки: окремий компонент із ключем за користувачем, щоб чернетка полів скидалась при виборі іншого. */
function UserForm({ user, reference }: { readonly user: User; readonly reference: Reference }) {
  const feedback = useFeedback();
  const save = useApiMutation("updateUser");
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title);
  const [departmentId, setDepartmentId] = useState(user.departmentId ?? "");
  const [kekvs, setKekvs] = useState<readonly string[]>(user.kekvs);
  const [error, setError] = useState<string | undefined>();
  const departments = reference.units.filter((u) => u.kind === "department" && u.parentId === user.unitId);
  // Після збереження поля збігаються з профілем, тож «Зберегти» знову неактивна.
  const changed = name !== user.name || title !== user.title || departmentId !== (user.departmentId ?? "") || [...kekvs].sort().join() !== [...user.kekvs].sort().join();

  const toggle = (code: string, on: boolean) => setKekvs((list) => (on ? [...list, code] : list.filter((k) => k !== code)));
  const doSave = () => {
    setError(undefined);
    save.mutate(
      { params: { id: user.id }, body: { name: name.trim(), title: title.trim(), departmentId: departmentId === "" ? null : departmentId, kekvs: [...kekvs] } },
      {
        onSuccess: () => feedback.notify({ key: "user-saved", tone: "success", title: "Налаштування збережено", description: name.trim() }),
        onError: (e) => setError(errorText(e)),
      },
    );
  };

  return (
    <div className="user-form">
      <Input label="ПІБ" required maxLength={120} value={name} onChange={(e) => setName(e.currentTarget.value)} />
      <Input label="Посада" required maxLength={120} value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
      <Select
        label="Відділ (служба)"
        description={departments.length === 0 ? "У цьому підрозділі відділів немає." : "З відділу заявка автора бере службу автоматично."}
        disabled={departments.length === 0}
        value={departmentId}
        onChange={(e) => setDepartmentId(e.target.value)}
      >
        <option value="">Не вказано</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {serviceName(d.name)}
          </option>
        ))}
      </Select>
      <fieldset className="user-form__kekv">
        <legend>Доступні КЕКВ</legend>
        <p className="user-form__hint">За ними фільтруються майно й план особи в її в/ч. Нічого не обрано — доступні всі.</p>
        {reference.kekv.map((k) => (
          <Checkbox key={k.code} label={`${k.code} · ${k.name}`} checked={kekvs.includes(k.code)} onChange={(e) => toggle(k.code, e.currentTarget.checked)} />
        ))}
      </fieldset>
      {error ? (
        <p className="procurement-form__error" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant="primary" disabled={!changed || name.trim() === "" || title.trim() === ""} loading={save.isPending} loadingLabel="Збереження" onClick={doSave}>
        Зберегти
      </Button>
    </div>
  );
}

/**
 * Користувачі (адміністратор): базові налаштування людини — ПІБ, посада, відділ у в/ч (з нього заявка бере службу)
 * і доступні КЕКВ (за ними фільтруються її майно й план). Роль і підрозділ задає структура, тут вони лише видні.
 */
export function UsersScreen() {
  const narrow = useMedia(NARROW);
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const [selected, setSelected] = useState<string | undefined>();
  const [query, setQuery] = useState("");

  const all = session.data?.users ?? [];
  const unitName = (id: string | null) => (id ? (reference.data?.units.find((u) => u.id === id)?.name ?? id) : "—");
  // Порядок за структурою: рівень (автори — разом із в/ч, рівень 1), підрозділ, роль; адміністратор — останнім.
  const ROLE_ORDER: Record<User["roleKind"], number> = { author: 0, preparer: 1, approver: 2, admin: 3 };
  const users = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk-UA");
    return [...all]
      .sort(
        (a, b) =>
          (a.roleKind === "admin" ? 9 : (a.level ?? 1)) - (b.roleKind === "admin" ? 9 : (b.level ?? 1)) ||
          unitName(a.unitId).localeCompare(unitName(b.unitId), "uk") ||
          ROLE_ORDER[a.roleKind] - ROLE_ORDER[b.roleKind],
      )
      .filter((u) => needle === "" || `${u.name} ${u.title} ${unitName(u.unitId)}`.toLocaleLowerCase("uk-UA").includes(needle));
  }, [all, query, reference.data]);
  const current = all.find((u) => u.id === selected);
  const role = (u: User) => `${ROLE_TEXT[u.roleKind]}${u.level ? ` · рівень ${u.level}` : ""}`;

  const columns: readonly DataTableColumn<User>[] = [
    { key: "name", header: "ПІБ", render: (u) => u.name },
    { key: "role", header: "Роль", render: role, width: 200 },
    { key: "unit", header: "Підрозділ", render: (u) => unitName(u.unitId), width: 200 },
    { key: "department", header: "Відділ", render: (u) => (u.departmentId ? serviceName(unitName(u.departmentId)) : "—"), width: 180 },
    {
      key: "kekv",
      header: "КЕКВ",
      render: (u) => (u.kekvs.length === 0 ? <Badge>Усі</Badge> : <span className="user-kekvs">{u.kekvs.map((k) => <Badge key={k}>{k}</Badge>)}</span>),
      width: 110,
    },
  ];

  const detail =
    current && reference.data ? (
      <DetailPanel title={current.name} subtitle={`${role(current)} · ${unitName(current.unitId)}`}>
        <UserForm key={current.id} user={current} reference={reference.data} />
      </DetailPanel>
    ) : (
      <DetailPanel title="Користувач" empty emptyText="Оберіть користувача в таблиці, щоб змінити його налаштування." />
    );

  const state = session.isPending || reference.isPending ? "loading" : session.isError || reference.isError ? "error" : users.length === 0 ? "empty" : "ready";
  const emptyTitle = all.length > 0 ? "Нікого не знайдено" : "Користувачів немає";
  return (
    <ScreenFrame
      title="Користувачі"
      meta={session.data ? `${all.length} користувачів` : undefined}
      surfaceLabel="Керування користувачами"
      actions={
        <InfoHint
          label="Що тут налаштовують"
          text="Оберіть людину й змініть її ПІБ, посаду, відділ у в/ч і доступні КЕКВ. Відділ стає службою в заявці автора автоматично. За КЕКВ фільтруються майно й план особи: подати можна лише позиції доступних КЕКВ. Роль і підрозділ задає структура."
        />
      }
      inspector={detail}
      inspectorLabel="Налаштування користувача"
      inspectorOpen={selected !== undefined}
      onInspectorOpenChange={(open) => {
        if (!open) setSelected(undefined);
      }}
      {...(selected ? { inspectorKey: selected } : {})}
    >
      <div className="filters">
        <Input label="Пошук" placeholder="Ім'я, посада або підрозділ" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
      </div>
      <DataTable
        label="Користувачі"
        columns={visibleColumns(columns, narrow || selected !== undefined, ["unit", "kekv"])}
        rows={users}
        getRowId={(u) => u.id}
        rowHeaderKey="name"
        variant="well"
        currentRowId={selected ?? null}
        onRowSelect={setSelected}
        state={state}
        stateTitle={state === "error" ? "Не вдалося завантажити користувачів" : emptyTitle}
      />
    </ScreenFrame>
  );
}
