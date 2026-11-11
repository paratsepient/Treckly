import { useEffect, useState } from "react";
import { Badge, Button, DataState, DataTable, Emblem, Icon, IconButton, type DataTableColumn } from "@index/ui";
import { AppShell, AppSidebar, WorkspaceHeader, WorkspaceLayout, WorkspaceSurface, type NavGroup } from "@index/ui-patterns";

type Theme = "light" | "dark";

interface Row {
  readonly id: string;
  readonly number: string;
  readonly unit: string;
  readonly status: "Чернетка" | "На погодженні" | "Затверджено";
}

const rows: readonly Row[] = [
  { id: "1", number: "ЗМ-0001", unit: "в/ч А0001", status: "Чернетка" },
  { id: "2", number: "ЗМ-0002", unit: "в/ч А0002", status: "На погодженні" },
  { id: "3", number: "ЗМ-0003", unit: "в/ч А0003", status: "Затверджено" },
];

const tones = { Чернетка: "neutral", "На погодженні": "warning", Затверджено: "success" } as const;

const columns: readonly DataTableColumn<Row>[] = [
  { key: "number", header: "Номер", mono: true },
  { key: "unit", header: "Підрозділ" },
  { key: "status", header: "Статус", render: (row) => <Badge tone={tones[row.status]}>{row.status}</Badge> },
];

const groups: NavGroup[] = [
  {
    id: "work",
    label: "Робота",
    items: [
      { id: "check", label: "Перевірка UI Kit", href: "#/check", icon: <Icon name="registry" /> },
      { id: "structure", label: "Структура", href: "#/structure", icon: <Icon name="org-structure" /> },
    ],
  },
];

function initialTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  return (
    <AppShell
      sidebar={
        <AppSidebar
          brand={{ name: "Замовлення", mark: <Emblem decorative /> }}
          groups={groups}
          activeItemId="check"
          roleContext={{ label: "Роль", value: "Демо · в/ч" }}
          user={{ name: "Користувач Демо", role: "Автор", initials: "КД" }}
        />
      }
    >
      <WorkspaceLayout
        header={
          <WorkspaceHeader
            title="Перевірка UI Kit"
            breadcrumbs={[{ label: "Прототип" }, { label: "Перевірка" }]}
            actions={
              <IconButton
                label={theme === "light" ? "Увімкнути темну тему" : "Увімкнути світлу тему"}
                icon={<Icon name={theme === "light" ? "theme-dark" : "theme-light"} />}
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              />
            }
            primaryAction={<Button variant="primary">Створити заявку</Button>}
          />
        }
      >
        <WorkspaceSurface variant="page" label="Перевірка UI Kit">
          <section className="check-section">
            <h2 className="check-heading">Кнопки та позначки</h2>
            <div className="check-row">
              <Button variant="primary">Основна</Button>
              <Button>Другорядна</Button>
              <Button variant="destructive">Відхилити</Button>
              <Badge tone="success">Погоджено</Badge>
              <Badge tone="warning">Очікує</Badge>
              <Badge tone="error">Відмовлено</Badge>
            </div>
          </section>
          <section className="check-section">
            <h2 className="check-heading">Таблиця</h2>
            <DataTable label="Заявки (демо)" columns={columns} rows={rows} getRowId={(row) => row.id} />
          </section>
          <section className="check-section">
            <h2 className="check-heading">Стани даних</h2>
            <DataState kind="empty" title="Заявок немає" description="Створіть першу заявку." />
          </section>
        </WorkspaceSurface>
      </WorkspaceLayout>
    </AppShell>
  );
}
