import { useState } from "react";
import type { ReactNode } from "react";
import { Badge, Button, DataState, Icon, SegmentedControl } from "@index/ui";
import { Dialog, useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { useApiMutation, useApiQuery, useBackend } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { useShell } from "../app/shell-context.tsx";
import { formatDate } from "../lib/format.ts";
import type { Theme } from "../lib/storage.ts";

type User = ApiOutput<"session">["users"][number];
type Unit = ApiOutput<"reference">["units"][number];

/** Рівень погодження за видом підрозділу; відділи в/ч ролей не мають. */
const LEVEL_OF: Partial<Record<Unit["kind"], 1 | 2 | 3 | 4 | 5>> = { authority: 5, direction: 4, ru: 3, brigade: 2, unit: 1 };
const ROLE_ORDER = { author: 0, preparer: 1, approver: 2, admin: 3 } as const;

/** Що людина в цій ролі робить у процесі: одним рядком під посадою. */
function duty(user: User): string {
  switch (user.roleKind) {
    case "author":
      return "Подає заявки й рапорти, стежить за треком";
    case "preparer":
      return user.level === 5 ? "Формує остаточний перелік, друкує на підпис Голові й відмічає «Підписано Головою»" : "Перевіряє заявки й формує денний перелік";
    case "approver":
      return user.level === 5 ? "Підписує перелік на папері; у системі — моніторинг усього" : "Погоджує денний перелік з номером СЕДО";
    case "admin":
      return "Реєстр, зведення й журнал дій";
  }
}

function RoleCard({ user, current, onPick }: { readonly user: User; readonly current: boolean; readonly onPick: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="role-card" aria-current={current ? "true" : undefined} onClick={() => onPick(user.id)}>
        <span className="role-card__title">{user.title}</span>
        <span className="role-card__name">{user.name}</span>
        <span className="role-card__duty">{duty(user)}</span>
        {current ? (
          <span className="role-card__state">
            <Badge tone="info">Поточна роль</Badge>
          </span>
        ) : null}
      </button>
    </li>
  );
}

interface NodeProps {
  readonly unit: Unit;
  readonly depth: number;
  readonly units: readonly Unit[];
  readonly users: readonly User[];
  readonly currentId: string | undefined;
  readonly onPick: (id: string) => void;
}

/**
 * Вузол ієрархії: підрозділ, його ролі й підлеглі підрозділи. Заголовки йдуть h2…h6 за глибиною,
 * тож структуру видно і на екрані, і в зчитувачі екрана.
 */
function UnitNode({ unit, depth, units, users, currentId, onPick }: NodeProps) {
  const level = LEVEL_OF[unit.kind];
  const roles = users.filter((u) => u.unitId === unit.id).sort((a, b) => ROLE_ORDER[a.roleKind] - ROLE_ORDER[b.roleKind]);
  const children = units.filter((u) => u.parentId === unit.id && LEVEL_OF[u.kind] !== undefined);
  const Heading = `h${Math.min(depth + 2, 6)}` as "h2";
  const titleId = `unit-${unit.id}`;
  return (
    <section className="hierarchy__node" aria-labelledby={titleId}>
      <div className="hierarchy__head">
        {level ? <span className="hierarchy__level">{`Рівень ${level}`}</span> : null}
        <Heading id={titleId} className="hierarchy__unit">
          {unit.name}
        </Heading>
      </div>
      {roles.length > 0 ? (
        <ul className="hierarchy__roles" aria-label={`Ролі: ${unit.name}`}>
          {roles.map((user) => (
            <RoleCard key={user.id} user={user} current={user.id === currentId} onPick={onPick} />
          ))}
        </ul>
      ) : null}
      {children.length > 0 ? (
        <div className="hierarchy__children">
          {children.map((child) => (
            <UnitNode key={child.id} unit={child} depth={depth + 1} units={units} users={users} currentId={currentId} onPick={onPick} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Panel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="demo-env__item">
      <h3 className="demo-env__title">{title}</h3>
      {children}
    </div>
  );
}

/**
 * Демо-середовище: ролі розставлено за структурою — від Відділу оборонних ресурсів і Голови
 * до в/ч, тож видно, хто над ким і на якому рівні погодження. Вибір ролі без паролів веде на
 * її початковий екран. Тут же — дата демо, тема і скидання.
 */
export function DemoScreen() {
  const { theme, setTheme, goHome } = useShell();
  const backend = useBackend();
  const feedback = useFeedback();
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const reset = useApiMutation("resetDemo");
  /** Яке скидання підтверджують: чиста база чи демо-приклади. */
  const [confirm, setConfirm] = useState<"clean" | "examples" | null>(null);
  const [resetMode, setResetMode] = useState<"clean" | "examples">("clean");
  const doReset = (mode: "clean" | "examples") => {
    setConfirm(null);
    setResetMode(mode);
    reset.mutate(
      { body: { withExamples: mode === "examples" } },
      {
        // Кеш не скидається: порожній кеш показав би лоадер на весь екран і прибрав би це повідомлення.
        onSuccess: () =>
          feedback.notify({
            key: "demo-reset",
            tone: "success",
            title: mode === "clean" ? "Демо скинуто: рапортів немає" : "Демо заповнено прикладами",
          }),
        onError: () => feedback.notify({ key: "demo-reset", tone: "error", title: "Не вдалося скинути демо" }),
      },
    );
  };
  const nextDay = useApiMutation("nextDay");

  const users = session.data?.users ?? [];
  const units = reference.data?.units ?? [];
  const current = session.data?.user;
  const roots = units.filter((u) => u.parentId === null);
  const admins = users.filter((u) => u.unitId === null).sort((a, b) => a.name.localeCompare(b.name));
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "";

  const pick = (userId: string) => {
    if (userId === current?.id) {
      goHome();
      return;
    }
    backend.setUserId(userId);
    goHome();
  };

  const ready = session.data !== undefined && reference.data !== undefined;
  return (
    <ScreenFrame
      title="Демо-середовище"
      surfaceLabel="Вибір ролі й налаштування демо"
      meta={current ? `Зараз: ${current.title}${current.unitId ? ` · ${unitName(current.unitId)}` : ""} — ${current.name}` : undefined}
    >
      {!ready ? (
        session.isError || reference.isError ? (
          <DataState kind="error" title="Не вдалося завантажити структуру" />
        ) : (
          <DataState kind="loading" title="Завантаження структури…" />
        )
      ) : (
        <>
          <section className="demo-env" aria-labelledby="demo-env-title">
            <h2 id="demo-env-title" className="ix-sr-only">
              Налаштування середовища
            </h2>
            <Panel title="Дата демо">
              <p className="demo-env__value">{formatDate(session.data.today)}</p>
              <Button
                loading={nextDay.isPending}
                loadingLabel="Перехід на наступний день"
                iconStart={<Icon name="calendar" />}
                onClick={() =>
                  nextDay.mutate(
                    {},
                    {
                      onSuccess: ({ today }) =>
                        feedback.notify({ key: "next-day", tone: "info", title: `Наступний день: ${formatDate(today)}`, description: "Усі, у кого є заявки, отримали щоденні нагадування." }),
                      onError: () => feedback.notify({ key: "next-day", tone: "error", title: "Не вдалося перейти на наступний день" }),
                    },
                  )
                }
              >
                Наступний день
              </Button>
            </Panel>
            <Panel title="Тема">
              <SegmentedControl
                label="Тема"
                hideLabel
                value={theme}
                onValueChange={(value) => setTheme(value as Theme)}
                options={[
                  { value: "light", label: "Світла", icon: <Icon name="theme-light" /> },
                  { value: "dark", label: "Темна", icon: <Icon name="theme-dark" /> },
                ]}
              />
            </Panel>
            <Panel title="Дані">
              <p className="demo-env__hint">«Скинути демо» видаляє всі рапорти, переліки й витяги; структура, ролі, план і ліміти лишаються.</p>
              <span className="demo-env__buttons">
                <Button iconStart={<Icon name="restore" />} loading={reset.isPending && resetMode === "clean"} loadingLabel="Скидання демо" onClick={() => setConfirm("clean")}>
                  Скинути демо
                </Button>
                <Button variant="ghost" loading={reset.isPending && resetMode === "examples"} loadingLabel="Завантаження прикладів" onClick={() => setConfirm("examples")}>
                  Заповнити прикладами
                </Button>
              </span>
            </Panel>
          </section>

          <section className="hierarchy" aria-labelledby="hierarchy-title">
            <div className="hierarchy__intro">
              <h2 id="hierarchy-title" className="hierarchy__title">
                Оберіть роль
              </h2>
              <p className="screen__hint">Ролі розставлено за структурою: заявка йде знизу вгору, від в/ч до Голови. Паролів немає — роль змінюється одним натиском.</p>
            </div>
            {roots.map((unit) => (
              <UnitNode key={unit.id} unit={unit} depth={0} units={units} users={users} currentId={current?.id} onPick={pick} />
            ))}
            {admins.length > 0 ? (
              <section className="hierarchy__node hierarchy__node--aside" aria-labelledby="unit-admin">
                <div className="hierarchy__head">
                  <span className="hierarchy__level">Поза маршрутом</span>
                  <h2 id="unit-admin" className="hierarchy__unit">
                    Адміністрування
                  </h2>
                </div>
                <ul className="hierarchy__roles" aria-label="Ролі: Адміністрування">
                  {admins.map((user) => (
                    <RoleCard key={user.id} user={user} current={user.id === current?.id} onPick={pick} />
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        </>
      )}
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        kind="confirm"
        title={confirm === "examples" ? "Заповнити демо прикладами?" : "Скинути демо?"}
        description={
          confirm === "examples"
            ? "Поточні дані буде замінено демо-прикладами: заявки в різних станах, переліки, витяги й сповіщення."
            : "Буде видалено всі рапорти — і чернетки, і подані, і затверджені, — а також переліки, витяги, сповіщення й журнал. Структура, ролі, план в/ч і ліміти лишаться."
        }
        actions={
          <>
            <Button onClick={() => setConfirm(null)}>Скасувати</Button>
            <Button variant={confirm === "examples" ? "primary" : "destructive"} onClick={() => confirm && doReset(confirm)}>
              {confirm === "examples" ? "Заповнити" : "Скинути все"}
            </Button>
          </>
        }
      />
    </ScreenFrame>
  );
}
