import { Button, DataState } from "@index/ui";
import { useApiQuery, useBackend } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { useShell } from "../app/shell-context.tsx";

/**
 * Початковий екран ролей, чиї екрани ще не готові (черга рівня, денний перелік, остаточний
 * перелік, реєстр — ітерації 3–4). Прямо підказує, де зараз працюють екрани.
 */
export function RoleHomeScreen() {
  const session = useApiQuery("session");
  const backend = useBackend();
  const { goHome } = useShell();
  const user = session.data?.user;
  const author = session.data?.users.find((u) => u.roleKind === "author");

  return (
    <ScreenFrame title={user?.title ?? "Огляд"} surfaceLabel="Огляд ролі">
      <DataState
        kind="empty"
        title="Екрани цієї ролі ще в розробці"
        description="Зараз працюють екрани автора заявки: «Моє майно», «Нова заявка» і «Мої заявки». Екрани черги рівня й денного переліку з'являться в наступній ітерації."
        action={
          author ? (
            <Button
              variant="primary"
              onClick={() => {
                backend.setUserId(author.id);
                goHome();
              }}
            >
              Перейти до автора заявок
            </Button>
          ) : undefined
        }
      />
    </ScreenFrame>
  );
}
