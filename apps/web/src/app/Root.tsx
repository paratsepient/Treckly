import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button, DataState, Emblem, Icon } from "@index/ui";
import { AppShell, AppSidebar, type NavGroup } from "@index/ui-patterns";
import { useApiQuery, useBackend } from "../api/hooks.tsx";
import { initialTheme, THEME_KEY, writeSetting, type Theme } from "../lib/storage.ts";
import { ShellContext } from "./shell-context.tsx";

const authorGroups: NavGroup[] = [
  {
    id: "requests",
    label: "Заявки",
    items: [
      { id: "property", label: "Моє майно", href: "#/property", icon: <Icon name="registry" /> },
      { id: "new", label: "Нова заявка", href: "#/new", icon: <Icon name="add" /> },
      { id: "my", label: "Мої заявки", href: "#/my", icon: <Icon name="document" /> },
    ],
  },
];

const otherGroups: NavGroup[] = [{ id: "overview", items: [{ id: "home", label: "Огляд", href: "#/", icon: <Icon name="info" /> }] }];

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
  const isAuthor = user.roleKind === "author";
  const active = pathname.startsWith("/property") ? "property" : pathname.startsWith("/new") ? "new" : pathname.startsWith("/my") ? "my" : "home";

  return (
    <ShellContext.Provider value={shell}>
      <AppShell
        sidebar={
          <AppSidebar
            brand={{ name: "Замовлення", mark: <Emblem decorative /> }}
            groups={isAuthor ? authorGroups : otherGroups}
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

/** Екрани автора доступні лише автору; інших ролей повертає на їхній початковий екран. */
export function AuthorOnly({ children }: { readonly children: ReactNode }) {
  const session = useApiQuery("session");
  if (session.data && session.data.user.roleKind !== "author") return <Navigate to="/" />;
  return <>{children}</>;
}
