import { createHashHistory, createRootRoute, createRoute, createRouter, Navigate } from "@tanstack/react-router";
import { MyRequestsScreen } from "../screens/MyRequestsScreen.tsx";
import { NewRequestScreen } from "../screens/NewRequestScreen.tsx";
import { PropertyScreen } from "../screens/PropertyScreen.tsx";
import { DailyListScreen } from "../screens/DailyListScreen.tsx";
import { FinalScreen } from "../screens/FinalScreen.tsx";
import { RegistryScreen } from "../screens/RegistryScreen.tsx";
import { JournalScreen } from "../screens/JournalScreen.tsx";
import { LevelQueueScreen } from "../screens/LevelQueueScreen.tsx";
import { NotificationsScreen } from "../screens/NotificationsScreen.tsx";
import { DemoScreen } from "../screens/DemoScreen.tsx";
import { PlannedListScreen } from "../screens/PlannedListScreen.tsx";
import { ProcurementScreen } from "../screens/ProcurementScreen.tsx";
import { ActingScreen } from "../screens/ActingScreen.tsx";
import { UsersScreen } from "../screens/UsersScreen.tsx";
import { useApiQuery } from "../api/hooks.tsx";
import { homePath, RoleOnly, Root } from "./Root.tsx";

const optionalString = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

const rootRoute = createRootRoute({ component: Root });

function Home() {
  const session = useApiQuery("session");
  const role = session.data?.user.roleKind;
  return role ? <Navigate to={homePath(role, session.data?.user.level ?? null)} /> : null;
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });

const propertyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/property",
  component: () => (
    <RoleOnly roles={["author"]}>
      <PropertyScreen />
    </RoleOnly>
  ),
});

const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/new",
  validateSearch: (search: Record<string, unknown>) => ({ id: optionalString(search["id"]) }),
  component: function NewRoute() {
    const { id } = newRoute.useSearch();
    return (
      <RoleOnly roles={["author"]}>
        <NewRequestScreen requestId={id} />
      </RoleOnly>
    );
  },
});

const myRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my",
  validateSearch: (search: Record<string, unknown>) => ({ selected: optionalString(search["selected"]) }),
  component: function MyRoute() {
    const { selected } = myRoute.useSearch();
    return (
      <RoleOnly roles={["author"]}>
        <MyRequestsScreen selected={selected} />
      </RoleOnly>
    );
  },
});

const queueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/queue",
  component: () => (
    <RoleOnly roles={["preparer"]}>
      <LevelQueueScreen />
    </RoleOnly>
  ),
});

const listsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lists",
  component: () => (
    <RoleOnly roles={["approver"]} levels={[1, 2, 3, 4]}>
      <DailyListScreen />
    </RoleOnly>
  ),
});

const finalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/final",
  component: () => (
    <RoleOnly roles={["author", "preparer", "approver"]}>
      <FinalScreen />
    </RoleOnly>
  ),
});

const registryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registry",
  component: () => (
    <RoleOnly roles={["preparer", "approver", "admin"]}>
      <RegistryScreen />
    </RoleOnly>
  ),
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: () => (
    <RoleOnly roles={["author", "preparer", "approver"]}>
      <NotificationsScreen />
    </RoleOnly>
  ),
});

const plannedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/planned",
  component: () => (
    <RoleOnly roles={["preparer", "approver"]}>
      <PlannedListScreen />
    </RoleOnly>
  ),
});

const procurementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/procurement",
  component: () => (
    <RoleOnly roles={["preparer"]} levels={[5]}>
      <ProcurementScreen />
    </RoleOnly>
  ),
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  component: () => (
    <RoleOnly roles={["admin"]}>
      <UsersScreen />
    </RoleOnly>
  ),
});

const actingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/acting",
  component: () => (
    <RoleOnly roles={["admin"]}>
      <ActingScreen />
    </RoleOnly>
  ),
});

const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journal",
  component: () => (
    <RoleOnly roles={["admin"]}>
      <JournalScreen />
    </RoleOnly>
  ),
});

/** Демо-середовище доступне з будь-якої ролі: тут її й обирають. */
const demoRoute = createRoute({ getParentRoute: () => rootRoute, path: "/demo", component: DemoScreen });

const routeTree = rootRoute.addChildren([indexRoute, demoRoute, propertyRoute, newRoute, myRoute, queueRoute, listsRoute, finalRoute, registryRoute, notificationsRoute, journalRoute, plannedRoute, procurementRoute, actingRoute, usersRoute]);

/** Хеш-історія: застосунок відкривається зі статичних файлів на localhost без налаштування сервера. */
export const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
