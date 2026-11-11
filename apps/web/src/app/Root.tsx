import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button, DataState, Emblem, Icon } from "@index/ui";
import { AppShell, AppSidebar, type NavGroup } from "@index/ui-patterns";
import { useApiQuery, useBackend } from "../api/hooks.tsx";
import { initialTheme, THEME_KEY, writeSetting, type Theme } from "../lib/storage.ts";
import { ShellContext } from "./shell-context.tsx";

type Role = "author" | "preparer" | "approver" | "admin";

/** Навігація за роллю: пункти вже відфільтровані, sidebar прав не обчислює. */
function groupsFor(role: Role, unread: number): NavGroup[] {
  const inbox = { id: "notifications", label: "Сповіщення", href: "#/notifications", icon: <Icon name="info" />, ...(unread > 0 ? { badge: String(unread) } : {}) };
  switch (role) {
    case "author":
      return [
        {
          id: "requests",
          label: "Заявки",
          items: [
            { id: "property", label: "Моє майно", href: "#/property", icon: <Icon name="registry" /> },
            { id: "new", label: "Нова заявка", href: "#/new", icon: <Icon name="add" /> },
            { id: "my", label: "Мої заявки", href: "#/my", icon: <Icon name="document" /> },
            inbox,
          ],
        },
      ];
    case "preparer":
      return [{ id: "work", label: "Робота рівня", items: [{ id: "queue", label: "Черга рівня", href: "#/queue", icon: <Icon name="records" /> }, inbox] }];
    case "approver":
      return [{ id: "work", label: "Робота рівня", items: [{ id: "lists", label: "Денний перелік", href: "#/lists", icon: <Icon name="document" /> }, inbox] }];
    case "admin":
      return [{ id: "admin", label: "Адміністрування", items: [{ id: "journal", label: "Журнал дій", href: "#/journal", icon: <Icon name="history" /> }] }];
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

/** Корінь застосунку: оболонка з навігацією за роллю й контекст демо-панелі (тема, повернення). */
export function Root() {
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const notifications = useApiQuery("notifications");
  const backend = useBackend();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [theme, setThemeState] = useState<Theme>(initialTheme);

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
  const active = ["property", "new", "my", "queue", "lists", "notifications", "journal"].find((id) => pathname.startsWith(`/${id}`)) ?? "";

  return (
    <ShellContext.Provider value={shell}>
      <AppShell
        sidebar={
          <AppSidebar
            brand={{ name: "Замовлення", mark: <Emblem decorative /> }}
            groups={groupsFor(user.roleKind, unread)}
            activeItemId={active}
            roleContext={{ label: "Роль", value: `${user.title}${unit ? ` · ${unit.name}` : ""}` }}
            user={{ name: user.name, role: user.title, initials: initials(user.name) }}
          />
        }
      >
        <Outlet />
      </AppShell>
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
