import { createHashHistory, createRootRoute, createRoute, createRouter, Navigate } from "@tanstack/react-router";
import { MyRequestsScreen } from "../screens/MyRequestsScreen.tsx";
import { NewRequestScreen } from "../screens/NewRequestScreen.tsx";
import { PropertyScreen } from "../screens/PropertyScreen.tsx";
import { RoleHomeScreen } from "../screens/RoleHomeScreen.tsx";
import { useApiQuery } from "../api/hooks.tsx";
import { AuthorOnly, Root } from "./Root.tsx";

const optionalString = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

const rootRoute = createRootRoute({ component: Root });

function Home() {
  const session = useApiQuery("session");
  if (session.data?.user.roleKind === "author") return <Navigate to="/property" />;
  return <RoleHomeScreen />;
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });

const propertyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/property",
  component: () => (
    <AuthorOnly>
      <PropertyScreen />
    </AuthorOnly>
  ),
});

const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/new",
  validateSearch: (search: Record<string, unknown>) => ({ id: optionalString(search["id"]) }),
  component: function NewRoute() {
    const { id } = newRoute.useSearch();
    return (
      <AuthorOnly>
        <NewRequestScreen requestId={id} />
      </AuthorOnly>
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
      <AuthorOnly>
        <MyRequestsScreen selected={selected} />
      </AuthorOnly>
    );
  },
});

const routeTree = rootRoute.addChildren([indexRoute, propertyRoute, newRoute, myRoute]);

/** Хеш-історія: застосунок відкривається зі статичних файлів на localhost без налаштування сервера. */
export const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
