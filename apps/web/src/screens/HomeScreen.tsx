import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, DataState, Icon } from "@index/ui";
import { useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { formatMoney, requestLabel } from "../lib/format.ts";
import { doneShare, moneyOf, percent } from "../lib/plan-states.ts";

type To = "/new" | "/my" | "/queue" | "/lists" | "/procurement" | "/final" | "/planned" | "/summary" | "/registry" | "/users" | "/acting" | "/notifications" | "/property";

interface Task {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly action: string;
  readonly to: To;
  /** Головна дія екрана — виділена; решта — звичайні кнопки. */
  readonly primary?: boolean;
}

const plural = (n: number, one: string, few: string, many: string): string => {
  const t = n % 100;
  const u = n % 10;
  if (t > 10 && t < 20) return many;
  return u === 1 ? one : u >= 2 && u <= 4 ? few : many;
};
const requests = (n: number) => `${n} ${plural(n, "заявка", "заявки", "заявок")}`;

function TaskCard({ task }: { readonly task: Task }) {
  const navigate = useNavigate();
  return (
    <li className="home-task" data-primary={task.primary ? "true" : undefined}>
      <h2 className="home-task__title">{task.title}</h2>
      <p className="home-task__text">{task.text}</p>
      <Button
        variant={task.primary ? "primary" : "secondary"}
        iconEnd={<Icon name="forward" />}
        onClick={() => void navigate({ to: task.to, ...(task.to === "/new" ? { search: { id: undefined } } : {}) } as Parameters<typeof navigate>[0])}
      >
        {task.action}
      </Button>
    </li>
  );
}

function Tasks({ tasks, idle }: { readonly tasks: readonly Task[]; readonly idle: ReactNode }) {
  return tasks.length === 0 ? <>{idle}</> : <ul className="home-tasks" aria-label="Що потрібно зробити">{tasks.map((t) => <TaskCard key={t.id} task={t} />)}</ul>;
}

/** Автор: повернуті й незавершені заявки — першими; далі — нова заявка й де зараз подані. */
function AuthorHome() {
  const mine = useApiQuery("myRequests");
  if (mine.isPending) return <DataState kind="loading" title="Завантаження…" />;
  if (mine.isError) return <DataState kind="error" title="Не вдалося завантажити заявки" />;
  const all = mine.data.requests;
  const count = (...s: string[]) => all.filter((r) => s.includes(r.status)).length;
  const returned = all.filter((r) => r.status === "returned");
  const drafts = count("draft");
  const onApproval = count("at_level", "in_list");
  const waiting = count("approved", "extract_issued", "procured");
  const tasks: Task[] = [
    ...(returned.length > 0
      ? [{ id: "returned", title: `Повернуто на доопрацювання: ${requests(returned.length)}`, text: `Виправте за приміткою й подайте нову версію (${returned.map((r) => requestLabel(r.id)).join(", ")}).`, action: "Переглянути", to: "/my" as To, primary: true }]
      : []),
    ...(drafts > 0 ? [{ id: "drafts", title: `Незавершені чернетки: ${drafts}`, text: "Допишіть і подайте — інакше їх ніхто не побачить.", action: "До чернеток", to: "/my" as To }] : []),
    { id: "new", title: "Нова заявка", text: "Оберіть позиції з плану вашої в/ч і напишіть обґрунтування — рапорт система складе сама.", action: "Створити заявку", to: "/new", primary: returned.length === 0 },
    ...(onApproval + waiting > 0
      ? [{ id: "progress", title: "Подані заявки", text: `На погодженні: ${onApproval}. Затверджено й чекає закупівлі або видачі: ${waiting}.`, action: "Мої заявки", to: "/my" as To }]
      : []),
  ];
  return <Tasks tasks={tasks} idle={null} />;
}

/** Уповноважена особа: черга рівня; на рівні 5 — ще підпис Голови й закупівлі. */
function PreparerHome({ level }: { readonly level: number }) {
  const queue = useApiQuery("levelQueue", { params: { level: String(level) } });
  const registry = useApiQuery("registry", undefined, { enabled: level === 5 });
  if (queue.isPending) return <DataState kind="loading" title="Завантаження…" />;
  if (queue.isError) return <DataState kind="error" title="Не вдалося завантажити чергу" />;
  const inQueue = queue.data.queue.length;
  const formed = queue.data.lists.filter((l) => l.status === "formed").length;
  const all = registry.data?.requests ?? [];
  const toBuy = all.filter((r) => r.status === "extract_issued" || r.status === "approved").length;
  const toIssue = all.filter((r) => r.status === "procured").length;
  const tasks: Task[] = [
    ...(inQueue > 0
      ? [{ id: "queue", title: `На розгляд: ${requests(inQueue)}`, text: "Перегляньте рапорти й звірку з планом, позначте ті, що погоджуєте сьогодні, і сформуйте денний перелік.", action: "Розглянути", to: "/queue" as To, primary: true }]
      : []),
    ...(formed > 0 && level === 5
      ? [{ id: "sign", title: `Переліків чекає підпису Голови: ${formed}`, text: "Роздрукуйте перелік, передайте Голові й після підпису відмітьте «Підписано Головою» (або «Голова не підписав»).", action: "До переліку", to: "/queue" as To, primary: inQueue === 0 }]
      : []),
    ...(formed > 0 && level < 5 ? [{ id: "formed", title: `Сформовано переліків: ${formed}`, text: "Чекають погодження керівника. Поки не погоджено — перелік можна розформувати.", action: "До переліку", to: "/queue" as To }] : []),
    ...(level === 5 && toBuy + toIssue > 0
      ? [{ id: "buy", title: "Закупівлі й видача", text: `Чекає закупівлі: ${requests(toBuy)}. На складі бази, чекає видачі: ${toIssue}.`, action: "До закупівель", to: "/procurement" as To }]
      : []),
  ];
  return (
    <Tasks
      tasks={tasks}
      idle={<DataState kind="empty" title="Зараз від вас нічого не потрібно" description="Нові заявки надійдуть на розгляд, коли нижчий рівень погодить свій перелік. Ви отримаєте сповіщення." />}
    />
  );
}

/** Керівник рівнів 1–4: денні переліки на погодження. */
function ApproverHome({ level }: { readonly level: number }) {
  const queue = useApiQuery("levelQueue", { params: { level: String(level) } });
  if (queue.isPending) return <DataState kind="loading" title="Завантаження…" />;
  if (queue.isError) return <DataState kind="error" title="Не вдалося завантажити переліки" />;
  const formed = queue.data.lists.filter((l) => l.status === "formed");
  const tasks: Task[] = formed.length > 0
    ? [{ id: "approve", title: `Переліків чекає вашого погодження: ${formed.length}`, text: "Перегляньте рапорти заявок і погодьте перелік номером СЕДО — усі заявки разом перейдуть на рівень вище.", action: "До переліку", to: "/lists", primary: true }]
    : [];
  return <Tasks tasks={tasks} idle={<DataState kind="empty" title="Зараз від вас нічого не потрібно" description="Коли уповноважена особа сформує денний перелік, він з'явиться тут і в сповіщеннях." />} />;
}

/** Голова: лише моніторинг — виконання плану й куди дивитись. */
function HeadHome() {
  const planned = useApiQuery("plannedList");
  if (planned.isPending) return <DataState kind="loading" title="Завантаження…" />;
  if (planned.isError) return <DataState kind="error" title="Не вдалося завантажити план" />;
  const sums = moneyOf(planned.data.positions);
  const tasks: Task[] = [
    { id: "plan", title: `План виконано на ${percent.format(doneShare(sums))}`, text: `Куплено на ${formatMoney(sums.bought)} з ${formatMoney(sums.planned)}; затверджено й чекає закупівлі — на ${formatMoney(sums.approved)}.`, action: "Запланований перелік", to: "/planned", primary: true },
    { id: "summary", title: "Як ідуть заявки", text: "Скільки заявок на кожному рівні, скільки днів вони там і бюджет за КЕКВ.", action: "Зведення", to: "/summary" },
    { id: "final", title: "Затверджені закупівлі", text: "Підписані переліки, витяги по в/ч і вплив на річний план.", action: "Відкрити", to: "/final" },
  ];
  return <Tasks tasks={tasks} idle={null} />;
}

/** Адміністратор: люди й заміщення. */
function AdminHome() {
  const session = useApiQuery("session");
  const acting = useApiQuery("actingList");
  const active = (acting.data?.assignments ?? []).filter((a) => a.revokedAt === null).length;
  const noDepartment = (session.data?.users ?? []).filter((u) => u.roleKind === "author" && u.departmentId === null).length;
  const tasks: Task[] = [
    ...(noDepartment > 0
      ? [{ id: "dept", title: `Авторів без відділу: ${noDepartment}`, text: "Без відділу автор не може подати заявку: вкажіть його в налаштуваннях користувача.", action: "Користувачі", to: "/users" as To, primary: true }]
      : []),
    { id: "users", title: "Користувачі", text: "ПІБ, посада, відділ і доступні КЕКВ кожної людини.", action: "Користувачі", to: "/users", primary: noDepartment === 0 },
    { id: "acting", title: `Заміщення (ТВО): чинних ${active}`, text: "Хто тимчасово виконує обов'язки відсутніх уповноважених осіб і керівників.", action: "Заміщення", to: "/acting" },
  ];
  return <Tasks tasks={tasks} idle={null} />;
}

/**
 * Головна: одне речення «що від вас зараз потрібно» з кнопкою переходу — для кожної ролі своє.
 * Новачок не мусить знати меню: найважливіша дія завжди перша й виділена.
 */
export function HomeScreen() {
  const session = useApiQuery("session");
  const user = session.data?.user;
  if (!user) return <DataState kind="loading" title="Завантаження…" />;
  const body =
    user.roleKind === "author" ? (
      <AuthorHome />
    ) : user.roleKind === "preparer" ? (
      <PreparerHome level={user.level ?? 1} />
    ) : user.roleKind === "approver" ? (
      user.level === 5 ? <HeadHome /> : <ApproverHome level={user.level ?? 1} />
    ) : (
      <AdminHome />
    );
  return (
    <ScreenFrame title="Головна" meta={`${user.name} · ${user.title}`} surfaceLabel="Що потрібно зробити">
      {body}
    </ScreenFrame>
  );
}
