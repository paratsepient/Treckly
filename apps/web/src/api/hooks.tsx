import { createContext, useContext, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { ApiName, ApiOutput } from "@dsp/contract";
import type { Call, CallInit } from "./client.ts";

export interface Backend {
  readonly call: Call;
  readonly userId: string | undefined;
  readonly setUserId: (id: string | undefined) => void;
}

const BackendContext = createContext<Backend | null>(null);

export function BackendProvider({ value, children }: { readonly value: Backend; readonly children: ReactNode }) {
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): Backend {
  const backend = useContext(BackendContext);
  if (!backend) throw new Error("useBackend: немає BackendProvider");
  return backend;
}

export interface QueryOptions {
  readonly enabled?: boolean;
  /** Показувати попередній результат, поки вантажиться новий (перевірки під час заповнення). */
  readonly keepPrevious?: boolean;
}

/**
 * Запит читання. Ключ містить назву операції, користувача й параметри: інший користувач
 * (інша роль) має власний кеш, а зміна заявки скидає за назвою.
 */
export function useApiQuery<K extends ApiName>(name: K, init?: CallInit<K>, options: QueryOptions = {}): UseQueryResult<ApiOutput<K>> {
  const { call, userId } = useBackend();
  return useQuery({
    queryKey: [name, userId ?? "default", init ?? null],
    queryFn: () => call(name, init),
    enabled: options.enabled ?? true,
    ...(options.keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}

/**
 * Після будь-якої команди всі активні запити оновлюються: стан заявок, бюджет, сповіщення, дата
 * «Наступного дня» й лічильники в меню залежать один від одного. Бекенд локальний, тож це дешево,
 * а список запитів, який легко забути доповнити, прибрано.
 */
export function useApiMutation<K extends ApiName>(name: K) {
  const { call } = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (init: CallInit<K>) => call(name, init),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
