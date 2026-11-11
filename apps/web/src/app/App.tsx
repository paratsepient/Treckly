import { useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createClient } from "../api/client.ts";
import { BackendProvider } from "../api/hooks.tsx";
import { clearSetting, readSetting, USER_KEY, writeSetting } from "../lib/storage.ts";
import { router } from "./router.tsx";

/** Провайдери: клієнт API з обраним користувачем, кеш запитів, маршрути. */
export function App({ transport }: { readonly transport: typeof fetch }) {
  const [userId, setUserIdState] = useState<string | undefined>(() => readSetting(USER_KEY));
  const current = useRef(userId);

  const queryClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }),
    [],
  );
  const call = useMemo(() => createClient({ fetch: transport, getUserId: () => current.current }), [transport]);
  const backend = useMemo(
    () => ({
      call,
      userId,
      setUserId: (id: string | undefined) => {
        current.current = id;
        if (id) writeSetting(USER_KEY, id);
        else clearSetting(USER_KEY);
        setUserIdState(id);
      },
    }),
    [call, userId],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BackendProvider value={backend}>
        <RouterProvider router={router} />
      </BackendProvider>
    </QueryClientProvider>
  );
}
