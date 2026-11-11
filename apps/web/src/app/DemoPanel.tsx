import { useState } from "react";
import { Button, Icon, Popover, SegmentedControl, Select } from "@index/ui";
import { useFeedback } from "@index/ui-patterns";
import { useApiMutation, useApiQuery, useBackend } from "../api/hooks.tsx";
import { formatDate } from "../lib/format.ts";
import type { Theme } from "../lib/storage.ts";
import { useShell } from "./shell-context.tsx";

const ROLE_ORDER = { author: 0, preparer: 1, approver: 2, admin: 3 } as const;

/**
 * Демо-панель: перемикач ролі (без паролів), тема й «Скинути демо». Присутня на кожному
 * екрані, бо прототип перевіряють люди в різних ролях на одному ПК.
 */
export function DemoPanel() {
  const { theme, setTheme: onThemeChange, goHome: onHome } = useShell();
  const [open, setOpen] = useState(false);
  const backend = useBackend();
  const feedback = useFeedback();
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const reset = useApiMutation("resetDemo");
  const nextDay = useApiMutation("nextDay");

  const unitName = (id: string | null) => reference.data?.units.find((u) => u.id === id)?.name ?? "";
  const users = [...(session.data?.users ?? [])].sort(
    (a, b) => ROLE_ORDER[a.roleKind] - ROLE_ORDER[b.roleKind] || (a.level ?? 0) - (b.level ?? 0) || a.id.localeCompare(b.id),
  );

  const switchTo = (userId: string) => {
    backend.setUserId(userId);
    setOpen(false);
    onHome();
  };

  return (
    <Popover
      label="Демо-панель"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button iconStart={<Icon name="settings" />} aria-label={`Демо-панель. Роль: ${session.data?.user.title ?? "…"}`}>
          Демо
        </Button>
      }
    >
      <div className="demo-panel">
        <Select label="Роль" description="Перемикач ролей без паролів" value={backend.userId ?? session.data?.user.id ?? ""} onChange={(event) => switchTo(event.target.value)}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {`${user.title}${user.unitId ? ` · ${unitName(user.unitId)}` : ""} — ${user.name}`}
            </option>
          ))}
        </Select>
        <SegmentedControl
          label="Тема"
          value={theme}
          onValueChange={(value) => onThemeChange(value as Theme)}
          options={[
            { value: "light", label: "Світла", icon: <Icon name="theme-light" /> },
            { value: "dark", label: "Темна", icon: <Icon name="theme-dark" /> },
          ]}
        />
        <Button
          loading={nextDay.isPending}
          loadingLabel="Перехід на наступний день"
          iconStart={<Icon name="calendar" />}
          onClick={() =>
            nextDay.mutate(
              {},
              {
                onSuccess: ({ today }) => {
                  feedback.notify({ key: "next-day", tone: "info", title: `Наступний день: ${formatDate(today)}`, description: "Усі, у кого є заявки, отримали щоденні нагадування." });
                  setOpen(false);
                },
                onError: () => feedback.notify({ key: "next-day", tone: "error", title: "Не вдалося перейти на наступний день" }),
              },
            )
          }
        >
          Наступний день
        </Button>
        <Button
          loading={reset.isPending}
          loadingLabel="Скидання демо"
          iconStart={<Icon name="restore" />}
          onClick={() => {
            reset.mutate(
              {},
              {
                onSuccess: () => {
                  // Кеш не скидається: порожній кеш показав би лоадер на весь екран і прибрав би це повідомлення.
                  feedback.notify({ key: "demo-reset", tone: "success", title: "Демо скинуто до початкового стану" });
                  setOpen(false);
                  onHome();
                },
                onError: () => feedback.notify({ key: "demo-reset", tone: "error", title: "Не вдалося скинути демо" }),
              },
            );
          }}
        >
          Скинути демо
        </Button>
      </div>
    </Popover>
  );
}
