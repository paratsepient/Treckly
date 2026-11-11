import { API, ErrorResponse, type ApiInput, type ApiName, type ApiOutput } from "@dsp/contract";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, status: number, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface Transport {
  /** Браузерний транспорт викликає Hono напряму; на пілоті це звичайний fetch. */
  readonly fetch: typeof fetch;
  readonly getUserId: () => string | undefined;
}

export interface CallInit<K extends ApiName> {
  readonly params?: Readonly<Record<string, string>>;
  readonly body?: ApiInput<K>;
}

export type Call = <K extends ApiName>(name: K, init?: CallInit<K>) => Promise<ApiOutput<K>>;

/**
 * Типізований клієнт: шлях, метод і форми запиту/відповіді беруться з реєстру `API`
 * контракту. Кожна зміна отримує власний ключ ідемпотентності; відповідь перевіряється схемою.
 */
export function createClient(transport: Transport): Call {
  return async (name, init) => {
    const endpoint = API[name];
    const path = endpoint.path.replace(/:([a-z]+)/g, (_, key: string) => encodeURIComponent(init?.params?.[key] ?? ""));
    const headers: Record<string, string> = { "content-type": "application/json" };
    const userId = transport.getUserId();
    if (userId) headers["x-user-id"] = userId;
    if (endpoint.method !== "GET") headers["idempotency-key"] = crypto.randomUUID();

    const response = await transport.fetch(`http://app.local${path}`, {
      method: endpoint.method,
      headers,
      body: init?.body === undefined ? null : JSON.stringify(init.body),
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      const parsed = ErrorResponse.safeParse(json);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiClientError(code, response.status, message, details ?? {});
      }
      throw new ApiClientError("INTERNAL", response.status, "Неочікувана відповідь сервера");
    }
    return endpoint.output.parse(json) as ApiOutput<typeof name>;
  };
}
