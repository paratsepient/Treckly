import { Badge, Button, DataState, Icon } from "@index/ui";
import { useFeedback } from "@index/ui-patterns";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { formatDateShort } from "../lib/format.ts";
import { notificationTarget, notificationText } from "../lib/notification-text.ts";

/** Сповіщення в системі: кожна роль бачить лише адресовані їй. Нові — виділені, є «прочитати всі». */
export function NotificationsScreen() {
  const feedback = useFeedback();
  const session = useApiQuery("session");
  const query = useApiQuery("notifications");
  const markRead = useApiMutation("markRead");
  const roleKind = session.data?.user.roleKind ?? "author";
  const items = query.data?.notifications ?? [];
  const unread = items.filter((n) => n.readAt === null).length;

  return (
    <ScreenFrame
      title="Сповіщення"
      meta={query.data ? (unread > 0 ? `${unread} нових` : "усе прочитано") : undefined}
      surfaceLabel="Сповіщення"
      primaryAction={
        <Button
          iconStart={<Icon name="success" />}
          disabled={unread === 0}
          loading={markRead.isPending}
          loadingLabel="Позначення прочитаними"
          onClick={() =>
            markRead.mutate(
              { body: {} },
              {
                onSuccess: () => void query.refetch(),
                onError: () => feedback.notify({ key: "read-error", tone: "error", title: "Не вдалося позначити прочитаними" }),
              },
            )
          }
        >
          Позначити всі прочитаними
        </Button>
      }
    >
      {query.isPending ? (
        <DataState kind="loading" title="Завантаження сповіщень…" />
      ) : query.isError ? (
        <DataState kind="error" title="Не вдалося завантажити сповіщення" />
      ) : items.length === 0 ? (
        <DataState kind="empty" title="Сповіщень немає" description="Тут з'являться події за заявками вашої ролі: нові на розгляд, повернення, затвердження й щоденні нагадування." />
      ) : (
        <ol className="inbox" aria-label="Сповіщення, нові згори">
          {items.map((n) => {
            const view = notificationText(n);
            return (
              <li key={n.id} className="inbox__item" data-unread={n.readAt === null ? "true" : undefined}>
                <p className="inbox__title">
                  {n.readAt === null ? <Badge tone="info">Нове</Badge> : null} <a href={notificationTarget(n, roleKind)}>{view.title}</a>
                </p>
                {view.detail ? <p className="inbox__detail">{view.detail}</p> : null}
                <p className="inbox__time">{formatDateShort(n.at)}</p>
              </li>
            );
          })}
        </ol>
      )}
    </ScreenFrame>
  );
}
