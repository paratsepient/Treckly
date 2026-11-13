import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button, DataState, Emblem, Icon, IconButton } from "@index/ui";
import { Drawer, FeedbackLayer, FeedbackProvider } from "@index/ui-patterns";
import { useApiQuery, useBackend } from "../api/hooks.tsx";
import { formatDate } from "../lib/format.ts";
import { initialTheme, THEME_KEY, writeSetting, type Theme } from "../lib/storage.ts";
import { DESKTOP, useMedia } from "../lib/useMedia.ts";
import { ShellContext } from "./shell-context.tsx";

type Role = "author" | "preparer" | "approver" | "admin";

interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ReactNode;
  readonly badge?: string;
}

interface NavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

/** Навігація за роллю: кожна роль бачить лише свої екрани. */
/** «Головна» — першою в меню кожної ролі: там сказано, що зараз потрібно зробити. */
function groupsFor(role: Role, unread: number, level: number | null): NavGroup[] {
  const groups = groupsForRole(role, unread, level);
  const home: NavItem = { id: "home", label: "Головна", href: "#/", icon: <Icon name="templates" /> };
  const [first, ...rest] = groups;
  return first ? [{ ...first, items: [home, ...first.items] }, ...rest] : groups;
}

function groupsForRole(role: Role, unread: number, level: number | null): NavGroup[] {
  const planned: NavItem = { id: "planned", label: "Запланований перелік", href: "#/planned", icon: <Icon name="registry" /> };
  const inbox: NavItem = { id: "notifications", label: "Сповіщення", href: "#/notifications", icon: <Icon name="bell" />, ...(unread > 0 ? { badge: String(unread) } : {}) };
  const summary: NavItem = { id: "summary", label: "Зведення", href: "#/summary", icon: <Icon name="kpi" /> };
  const registry: NavItem = { id: "registry", label: "Реєстр заявок", href: "#/registry", icon: <Icon name="records" /> };
  const final = (label: string): NavItem => ({ id: "final", label, href: "#/final", icon: <Icon name="sheet" /> });
  switch (role) {
    case "author":
      return [
        {
          id: "requests",
          label: "Заявки",
          items: [
            { id: "new", label: "Нова заявка", href: "#/new", icon: <Icon name="add" /> },
            { id: "my", label: "Мої заявки", href: "#/my", icon: <Icon name="document" /> },
            inbox,
          ],
        },
        {
          id: "unit",
          label: "Підрозділ",
          items: [{ id: "property", label: "Моє майно", href: "#/property", icon: <Icon name="registry" /> }, final("Витяги по в/ч")],
        },
      ];
    case "preparer":
      return [
        {
          id: "work",
          label: "Робота рівня",
          items: [
            { id: "queue", label: "Заявки на розгляд", href: "#/queue", icon: <Icon name="records" /> },
            // Відділ оборонних ресурсів: після підпису Голови — затверджені закупівлі, далі закупівля й видача.
            ...(level === 5 ? [final("Затверджені закупівлі"), { id: "procurement", label: "Закупівлі й видача", href: "#/procurement", icon: <Icon name="success" /> }] : []),
            inbox,
          ],
        },
        { id: "overview", label: "Огляд", items: [planned, summary, registry] },
      ];
    case "approver":
      // Голова підписує перелік на папері, а в системі лише стежить: одне меню моніторингу в порядку роботи —
      // що заплановано, як іде, що затверджено. Сповіщень Голові не треба: дій у системі він не виконує.
      if (level === 5) return [{ id: "monitoring", label: "Моніторинг", items: [planned, summary, registry, final("Затверджені закупівлі")] }];
      return [
        { id: "work", label: "Робота рівня", items: [{ id: "lists", label: "Денний перелік", href: "#/lists", icon: <Icon name="document" /> }, inbox] },
        { id: "overview", label: "Огляд", items: [planned, summary, registry] },
      ];
    case "admin":
      return [
        {
          id: "admin",
          label: "Адміністрування",
          items: [
            { id: "users", label: "Користувачі", href: "#/users", icon: <Icon name="users" /> },
            summary,
            registry,
            { id: "acting", label: "Заміщення (ТВО)", href: "#/acting", icon: <Icon name="refresh" /> },
            { id: "journal", label: "Журнал дій", href: "#/journal", icon: <Icon name="history" /> },
          ],
        },
      ];
  }
}

/** Початковий екран ролі. */
/** Початковий екран будь-якої ролі — «Головна»: що зараз потрібно зробити. */
export const homePath = (_role: Role, _level: number | null = null): "/" => "/";

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

function FullPage({ children }: { readonly children: ReactNode }) {
  return <main className="boot">{children}</main>;
}

interface SidebarProps {
  readonly groups: readonly NavGroup[];
  readonly active: string;
  readonly user: { readonly name: string; readonly role: string };
  readonly onNavigate?: () => void;
  /** Блок демо внизу панелі: позначка даних, дата й кнопка демо-середовища. */
  readonly demo: ReactNode;
}

/** Навігація з підписами: назва екрана видна завжди, а не лише в підказці до іконки. */
function Sidebar({ groups, active, user, onNavigate, demo }: SidebarProps) {
  return (
    <div className="sidebar">
      <a className="sidebar__brand" href="#/" onClick={onNavigate}>
        <span className="sidebar__mark" aria-hidden="true">
          <Emblem decorative />
        </span>
        <span className="sidebar__name">Замовлення</span>
      </a>
      <nav className="sidebar__nav" aria-label="Головна навігація">
        {groups.map((group) => (
          <div key={group.id} className="sidebar__group" role="group" aria-labelledby={`nav-${group.id}`}>
            <h2 id={`nav-${group.id}`} className="sidebar__group-label">
              {group.label}
            </h2>
            <ul className="sidebar__list">
              {group.items.map((item) => (
                <li key={item.id}>
                  <a className="sidebar__link" href={item.href} aria-current={item.id === active ? "page" : undefined} onClick={onNavigate}>
                    <span className="sidebar__icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="sidebar__label">{item.label}</span>
                    {item.badge ? (
                      <span className="sidebar__badge">
                        <span className="ix-sr-only">, нових: </span>
                        {item.badge}
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {demo}
      <div className="sidebar__user">
        <span className="sidebar__avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="sidebar__user-text">
          <span className="sidebar__user-name">{user.name}</span>
          <span className="sidebar__user-role">{user.role}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Корінь застосунку: власна оболонка на токенах набору. Ліворуч — навігація з підписами
 * (на вузьких екранах — висувна панель), угорі — смуга демо з датою й перемикачем ролі,
 * далі — сторінка, що прокручується як звичайний документ.
 */
export function Root() {
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const notifications = useApiQuery("notifications");
  const backend = useBackend();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const desktop = useMedia(DESKTOP);

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeSetting(THEME_KEY, next);
  }, []);
  const goHome = useCallback(() => void navigate({ to: "/" }), [navigate]);
  const shell = useMemo(() => ({ theme, setTheme, goHome }), [theme, setTheme, goHome]);

  if (session.isError || reference.isError) {
    return (
      <FullPage>
        <DataState
          kind="error"
          title="Не вдалося відкрити демо"
          description="Можливо, збережену роль більше не знайдено. Спробуйте скинути вибір ролі."
          action={
            <Button variant="primary" onClick={() => backend.setUserId(undefined)}>
              Скинути вибір ролі
            </Button>
          }
        />
      </FullPage>
    );
  }
  if (!session.data || !reference.data) {
    return (
      <FullPage>
        <DataState kind="loading" title="Завантаження…" />
      </FullPage>
    );
  }

  const { user } = session.data;
  const unit = reference.data.units.find((u) => u.id === user.unitId);
  const unread = (notifications.data?.notifications ?? []).filter((n) => n.readAt === null).length;
  const active = pathname === "/" ? "home" : ["property", "new", "my", "queue", "lists", "final", "registry", "notifications", "journal", "demo", "planned", "procurement", "acting", "users", "summary"].find((id) => pathname.startsWith(`/${id}`)) ?? "";
  const role = `${user.title}${unit ? ` · ${unit.name}` : ""}`;
  const demo = (
    <div className="sidebar__demo">
      <p className="sidebar__demo-note" role="note">
        <strong>Демонстраційні дані</strong>, СЕДО імітується.
        <br />
        <span className="sidebar__demo-date">Сьогодні: {formatDate(session.data.today)}</span>
      </p>
      <Button
        variant={active === "demo" ? "primary" : "secondary"}
        iconStart={<Icon name="role" />}
        aria-label={`Демо-середовище: змінити роль. Зараз: ${user.title}`}
        aria-current={active === "demo" ? "page" : undefined}
        onClick={() => {
          setMenuOpen(false);
          void navigate({ to: "/demo" });
        }}
      >
        Демо
      </Button>
    </div>
  );
  const sidebar = { groups: groupsFor(user.roleKind, unread, user.level), active, user: { name: user.name, role }, demo };

  return (
    <ShellContext.Provider value={shell}>
      <FeedbackProvider>
        <div className="app">
          <a className="skip-link" href="#content" onClick={(event) => { event.preventDefault(); document.getElementById("content")?.focus(); }}>
            Перейти до вмісту
          </a>
          {desktop ? (
            <aside className="app__sidebar" aria-label="Бічна панель застосунку">
              <Sidebar {...sidebar} />
            </aside>
          ) : (
            <Drawer side="start" label="Головна навігація" open={menuOpen} onClose={() => setMenuOpen(false)}>
              <Sidebar {...sidebar} onNavigate={() => setMenuOpen(false)} />
            </Drawer>
          )}
          <div className="app__main">
            {desktop ? null : (
              <header className="mobilebar">
                <IconButton label="Відкрити навігацію" icon={<Icon name="menu" />} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} />
                <span className="mobilebar__name">Замовлення</span>
                <span className="mobilebar__date">{formatDate(session.data.today)}</span>
              </header>
            )}
            {session.data.substitutedBy ? (
              // Заміщений ТВО: бачить усе, але не діє, доки призначення не знято.
              <p className="substituted-note" role="status">
                {`Ваші обов'язки зараз виконує ТВО: ${session.data.users.find((u) => u.id === session.data.substitutedBy)?.name ?? session.data.substitutedBy}. Дії недоступні, доки адміністратор не зніме призначення; переглядати можна.`}
              </p>
            ) : null}
            <Outlet />
          </div>
        </div>
        <FeedbackLayer />
      </FeedbackProvider>
    </ShellContext.Provider>
  );
}

/** Екран доступний лише вказаним ролям; інших повертає на початковий екран їхньої ролі. */
export function RoleOnly({
  roles,
  levels,
  exclude = [],
  children,
}: {
  readonly roles: readonly Role[];
  readonly levels?: readonly number[];
  /** Окремі ролі на рівні, яким екран не потрібен (напр. Голова — сповіщення). */
  readonly exclude?: readonly { readonly role: Role; readonly level: number }[];
  readonly children: ReactNode;
}) {
  const session = useApiQuery("session");
  const role = session.data?.user.roleKind;
  const level = session.data?.user.level ?? null;
  const excluded = exclude.some((e) => e.role === role && e.level === level);
  if (role && (excluded || !roles.includes(role) || (levels !== undefined && (level === null || !levels.includes(level))))) return <Navigate to={homePath(role, level)} />;
  return <>{children}</>;
}
