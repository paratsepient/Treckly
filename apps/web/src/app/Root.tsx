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
function groupsFor(role: Role, unread: number, level: number | null): NavGroup[] {
  const inbox: NavItem = { id: "notifications", label: "Сповіщення", href: "#/notifications", icon: <Icon name="info" />, ...(unread > 0 ? { badge: String(unread) } : {}) };
  const registry: NavItem = { id: "registry", label: "Реєстр і зведення", href: "#/registry", icon: <Icon name="kpi" /> };
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
        { id: "work", label: "Робота рівня", items: [{ id: "queue", label: "Черга рівня", href: "#/queue", icon: <Icon name="records" /> }, ...(level === 5 ? [final("Остаточний перелік")] : []), inbox] },
        { id: "overview", label: "Зведення", items: [registry] },
      ];
    case "approver":
      return [
        { id: "work", label: "Робота рівня", items: [{ id: "lists", label: level === 5 ? "Затвердження" : "Денний перелік", href: "#/lists", icon: <Icon name="document" /> }, ...(level === 5 ? [final("Остаточний перелік")] : []), inbox] },
        { id: "overview", label: "Зведення", items: [registry] },
      ];
    case "admin":
      return [{ id: "admin", label: "Адміністрування", items: [registry, { id: "journal", label: "Журнал дій", href: "#/journal", icon: <Icon name="history" /> }] }];
  }
}

/** Початковий екран ролі. */
export const homePath = (role: Role): "/property" | "/queue" | "/lists" | "/journal" =>
  role === "author" ? "/property" : role === "preparer" ? "/queue" : role === "approver" ? "/lists" : "/journal";

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
}

/** Навігація з підписами: назва екрана видна завжди, а не лише в підказці до іконки. */
function Sidebar({ groups, active, user, onNavigate }: SidebarProps) {
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
  const active = ["property", "new", "my", "queue", "lists", "final", "registry", "notifications", "journal", "demo"].find((id) => pathname.startsWith(`/${id}`)) ?? "";
  const role = `${user.title}${unit ? ` · ${unit.name}` : ""}`;
  const sidebar = { groups: groupsFor(user.roleKind, unread, user.level), active, user: { name: user.name, role } };

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
            <header className="topbar">
              {desktop ? null : <IconButton label="Відкрити навігацію" icon={<Icon name="menu" />} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} />}
              <p className="topbar__note" role="note">
                <strong>
                  <span className="topbar__full">Демонстраційні дані, СЕДО імітується.</span>
                  <span className="topbar__short">Демо-дані, СЕДО імітується.</span>
                </strong> <span className="topbar__date">Сьогодні: {formatDate(session.data.today)}</span>
              </p>
              <span className="topbar__role" title={role}>
                {role}
              </span>
              <Button
                variant={active === "demo" ? "primary" : "secondary"}
                iconStart={<Icon name="role" />}
                aria-label={`Демо-середовище: змінити роль. Зараз: ${user.title}`}
                aria-current={active === "demo" ? "page" : undefined}
                onClick={() => void navigate({ to: "/demo" })}
              >
                Демо
              </Button>
            </header>
            <Outlet />
          </div>
        </div>
        <FeedbackLayer />
      </FeedbackProvider>
    </ShellContext.Provider>
  );
}

/** Екран доступний лише вказаним ролям; інших повертає на початковий екран їхньої ролі. */
export function RoleOnly({ roles, children }: { readonly roles: readonly Role[]; readonly children: ReactNode }) {
  const session = useApiQuery("session");
  const role = session.data?.user.roleKind;
  if (role && !roles.includes(role)) return <Navigate to={homePath(role)} />;
  return <>{children}</>;
}
