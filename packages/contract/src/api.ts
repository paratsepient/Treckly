import { z } from "zod";
import {
  BudgetSummary,
  CheckReport,
  DailyList,
  Extract,
  Id,
  Item,
  JournalEvent,
  KekvInfo,
  Kpi,
  Level,
  LevelConfig,
  Notification,
  Position,
  PropertyItem,
  PropertyTab,
  Request,
  RequestDetail,
  RequestLine,
  Unit,
  User,
} from "./schemas.ts";

/**
 * Усі зміни — POST/PUT із заголовком `Idempotency-Key`; версії записів, які бачив
 * клієнт, передаються в `expectedRevisions` (id запису → revision) → VERSION_CONFLICT.
 */
const expectedRevision = z.number().int().positive();
const expectedRevisions = z.record(Id, expectedRevision);

// ── Команди ───────────────────────────────────────────────────────────────────

export const SwitchRoleInput = z.object({ userId: Id });
export const CreateRequestInput = z.object({ lines: z.array(RequestLine) });
export const CheckRequestInput = z.object({ lines: z.array(RequestLine), requestId: Id.optional() });
export const EditLinesInput = z.object({ lines: z.array(RequestLine), expectedRevision });
export const RevisionInput = z.object({ expectedRevision });
export const ReturnInput = z.object({ note: z.string(), expectedRevision });
export const FormListInput = z.object({ level: Level, unitId: Id, requestIds: z.array(Id).min(1), expectedRevisions: expectedRevisions.optional() });
export const DisbandListInput = z.object({ expectedRevisions: expectedRevisions.optional() });
/** Номер СЕДО приймається як є: формат (число) перевіряє домен → SEDO_NUMBER_INVALID. */
export const ApproveListInput = z.object({ sedoNumber: z.union([z.string(), z.number()]), expectedRevisions: expectedRevisions.optional() });
export const MarkReadInput = z.object({ ids: z.array(z.number().int()).optional() });

// ── Відповіді ─────────────────────────────────────────────────────────────────

export const SessionResponse = z.object({ user: User, users: z.array(User), today: z.string() });
export const ReferenceResponse = z.object({
  units: z.array(Unit),
  kekv: z.array(KekvInfo),
  items: z.array(Item),
  levels: z.array(LevelConfig),
});
export const PositionsResponse = z.object({ positions: z.array(Position) });
export const PropertyResponse = z.object({ items: z.array(PropertyItem) });
export const RequestResponse = z.object({ request: Request });
export const RequestsResponse = z.object({ requests: z.array(Request) });
export const CheckResponse = z.object({ report: CheckReport });
/** Черга рівня: заявки в черзі, сформовані переліки й заявки в них. */
export const QueueResponse = z.object({ queue: z.array(Request), lists: z.array(DailyList), listed: z.array(Request) });
export const ListResponse = z.object({ list: DailyList, requests: z.array(Request) });
export const ListsResponse = z.object({ lists: z.array(DailyList) });
export const FinalResponse = z.object({ lists: z.array(DailyList), requests: z.array(Request), extracts: z.array(Extract) });
export const NotificationsResponse = z.object({
  notifications: z.array(Notification.extend({ id: z.number().int(), readAt: z.string().nullable() })),
});
export const JournalResponse = z.object({ journal: z.array(JournalEvent) });
export const OkResponse = z.object({ ok: z.literal(true) });

// ── Реєстр ендпоінтів ─────────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PUT";
interface Endpoint {
  readonly method: Method;
  readonly path: string;
  readonly input?: z.ZodType;
  readonly output: z.ZodType;
}

const endpoint = <T extends Endpoint>(e: T): T => e;

/** Єдиний перелік операцій API (розділ 6 документа розробки). */
export const API = {
  // Сесія
  session: endpoint({ method: "GET", path: "/api/session", output: SessionResponse }),
  switchRole: endpoint({ method: "POST", path: "/api/session/role", input: SwitchRoleInput, output: SessionResponse }),
  // Довідники
  reference: endpoint({ method: "GET", path: "/api/reference", output: ReferenceResponse }),
  positions: endpoint({ method: "GET", path: "/api/positions", output: PositionsResponse }),
  budget: endpoint({ method: "GET", path: "/api/budget", output: BudgetSummary }),
  // Майно
  property: endpoint({ method: "GET", path: "/api/property", output: PropertyResponse }),
  // Заявки
  createRequest: endpoint({ method: "POST", path: "/api/requests", input: CreateRequestInput, output: RequestResponse }),
  editLines: endpoint({ method: "PUT", path: "/api/requests/:id/lines", input: EditLinesInput, output: RequestResponse }),
  checkRequest: endpoint({ method: "POST", path: "/api/requests/check", input: CheckRequestInput, output: CheckResponse }),
  submitRequest: endpoint({ method: "POST", path: "/api/requests/:id/submit", input: RevisionInput, output: RequestResponse }),
  withdrawRequest: endpoint({ method: "POST", path: "/api/requests/:id/withdraw", input: RevisionInput, output: RequestResponse }),
  newVersion: endpoint({ method: "POST", path: "/api/requests/:id/new-version", input: RevisionInput, output: RequestResponse }),
  myRequests: endpoint({ method: "GET", path: "/api/requests/mine", output: RequestsResponse }),
  requestDetail: endpoint({ method: "GET", path: "/api/requests/:id", output: RequestDetail }),
  // Рівень
  levelQueue: endpoint({ method: "GET", path: "/api/levels/:level/queue", output: QueueResponse }),
  returnRequest: endpoint({ method: "POST", path: "/api/requests/:id/return", input: ReturnInput, output: RequestResponse }),
  // Денні переліки
  formList: endpoint({ method: "POST", path: "/api/lists", input: FormListInput, output: ListResponse }),
  disbandList: endpoint({ method: "POST", path: "/api/lists/:id/disband", input: DisbandListInput, output: ListResponse }),
  approveList: endpoint({ method: "POST", path: "/api/lists/:id/approve", input: ApproveListInput, output: ListResponse }),
  lists: endpoint({ method: "GET", path: "/api/lists", output: ListsResponse }),
  // Фінал
  final: endpoint({ method: "GET", path: "/api/final", output: FinalResponse }),
  // Зведення
  registry: endpoint({ method: "GET", path: "/api/registry", output: RequestsResponse }),
  kpi: endpoint({ method: "GET", path: "/api/kpi", output: Kpi }),
  // Інше
  notifications: endpoint({ method: "GET", path: "/api/notifications", output: NotificationsResponse }),
  markRead: endpoint({ method: "POST", path: "/api/notifications/read", input: MarkReadInput, output: OkResponse }),
  journal: endpoint({ method: "GET", path: "/api/journal", output: JournalResponse }),
  // Демо
  nextDay: endpoint({ method: "POST", path: "/api/demo/next-day", output: SessionResponse }),
  resetDemo: endpoint({ method: "POST", path: "/api/demo/reset", output: SessionResponse }),
} as const;

export type ApiName = keyof typeof API;
export type ApiInput<K extends ApiName> = (typeof API)[K] extends { input: infer I extends z.ZodType } ? z.infer<I> : undefined;
export type ApiOutput<K extends ApiName> = z.infer<(typeof API)[K]["output"]>;

export { PropertyTab };
