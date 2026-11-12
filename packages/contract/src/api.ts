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
  PlannedList,
  Level,
  LevelConfig,
  Notification,
  Position,
  PropertyItem,
  PropertyTab,
  Request,
  RequestDetail,
  RequestLine,
  ActingAssignment,
  FundingSource,
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
/** Обґрунтування до 4000 знаків: це один абзац-два рапорту, а не окремий документ. */
const Justification = z.string().max(4000);
/** Назва заявки: коротка, щоб уміщалась у заголовок і рядок таблиці. */
const Title = z.string().max(120);
const Service = z.string().max(120);
const Details = { service: Service.optional(), funding: FundingSource.optional() };
export const CreateRequestInput = z.object({ lines: z.array(RequestLine), justification: Justification.optional(), title: Title.optional(), ...Details });
export const CheckRequestInput = z.object({ lines: z.array(RequestLine), requestId: Id.optional() });
export const EditLinesInput = z.object({ lines: z.array(RequestLine), justification: Justification.optional(), title: Title.optional(), ...Details, expectedRevision });
export const RevisionInput = z.object({ expectedRevision });
/** Подання: реєстраційний номер рапорту в СЕДО (автор реєструє рапорт і вводить номер). */
export const SubmitInput = z.object({ expectedRevision, sedoNumber: z.union([z.string(), z.number()]) });
export const ResetDemoInput = z.object({ withExamples: z.boolean().optional() });
/** Закупівля (адміністрація): документ приймання, отримувач і фактична кількість по рядках. */
export const ProcureInput = z.object({ acceptanceDoc: z.string(), recipient: z.string(), quantities: z.record(z.string(), z.number().int()), expectedRevision });
export const IssueInput = z.object({ act: z.string(), expectedRevision });
export const NotProcuredInput = z.object({ note: z.string(), expectedRevision });
export const ReturnInput = z.object({ note: z.string(), expectedRevision });
export const FormListInput = z.object({ level: Level, unitId: Id, requestIds: z.array(Id).min(1), expectedRevisions: expectedRevisions.optional() });
export const DisbandListInput = z.object({ expectedRevisions: expectedRevisions.optional() });
/** Номер СЕДО приймається як є: формат (число) перевіряє домен → SEDO_NUMBER_INVALID. */
/** Рівень 5: Голова не підписав — примітка обов'язкова, заявки повертаються авторам. */
export const NotSignedInput = z.object({ note: z.string().max(2000), expectedRevisions: expectedRevisions.optional() });
export const ApproveListInput = z.object({ sedoNumber: z.union([z.string(), z.number()]), expectedRevisions: expectedRevisions.optional() });
export const MarkReadInput = z.object({ ids: z.array(z.number().int()).optional() });

// ── Відповіді ─────────────────────────────────────────────────────────────────

export const SessionResponse = z.object({
  user: User,
  users: z.array(User),
  today: z.string(),
  /** ТВО: чиї обов'язки зараз виконує користувач (роль у `user` — уже того, кого заміщає). */
  actingFor: Id.nullable(),
});
export const AssignActingInput = z.object({ principalId: Id, deputyId: Id });
export const ActingResponse = z.object({ assignment: ActingAssignment });
export const ActingListResponse = z.object({ assignments: z.array(ActingAssignment) });
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
  actingList: endpoint({ method: "GET", path: "/api/acting", output: ActingListResponse }),
  assignActing: endpoint({ method: "POST", path: "/api/acting", input: AssignActingInput, output: ActingResponse }),
  revokeActing: endpoint({ method: "POST", path: "/api/acting/:id/revoke", input: z.object({}), output: ActingResponse }),
  switchRole: endpoint({ method: "POST", path: "/api/session/role", input: SwitchRoleInput, output: SessionResponse }),
  // Довідники
  reference: endpoint({ method: "GET", path: "/api/reference", output: ReferenceResponse }),
  positions: endpoint({ method: "GET", path: "/api/positions", output: PositionsResponse }),
  budget: endpoint({ method: "GET", path: "/api/budget", output: BudgetSummary }),
  // Майно
  property: endpoint({ method: "GET", path: "/api/property", output: PropertyResponse }),
  /** Майно іншої в/ч: для звірки заявки з тим, що заплановано в підрозділі автора (автор бачить лише свою в/ч). */
  unitProperty: endpoint({ method: "GET", path: "/api/units/:id/property", output: PropertyResponse }),
  // Заявки
  createRequest: endpoint({ method: "POST", path: "/api/requests", input: CreateRequestInput, output: RequestResponse }),
  editLines: endpoint({ method: "PUT", path: "/api/requests/:id/lines", input: EditLinesInput, output: RequestResponse }),
  checkRequest: endpoint({ method: "POST", path: "/api/requests/check", input: CheckRequestInput, output: CheckResponse }),
  submitRequest: endpoint({ method: "POST", path: "/api/requests/:id/submit", input: SubmitInput, output: RequestResponse }),
  withdrawRequest: endpoint({ method: "POST", path: "/api/requests/:id/withdraw", input: RevisionInput, output: RequestResponse }),
  newVersion: endpoint({ method: "POST", path: "/api/requests/:id/new-version", input: SubmitInput, output: RequestResponse }),
  // Закупівля й видача (адміністрація)
  procureRequest: endpoint({ method: "POST", path: "/api/requests/:id/procure", input: ProcureInput, output: RequestResponse }),
  issueRequest: endpoint({ method: "POST", path: "/api/requests/:id/issue", input: IssueInput, output: RequestResponse }),
  notProcuredRequest: endpoint({ method: "POST", path: "/api/requests/:id/not-procured", input: NotProcuredInput, output: RequestResponse }),
  myRequests: endpoint({ method: "GET", path: "/api/requests/mine", output: RequestsResponse }),
  requestDetail: endpoint({ method: "GET", path: "/api/requests/:id", output: RequestDetail }),
  // Рівень
  levelQueue: endpoint({ method: "GET", path: "/api/levels/:level/queue", output: QueueResponse }),
  returnRequest: endpoint({ method: "POST", path: "/api/requests/:id/return", input: ReturnInput, output: RequestResponse }),
  // Денні переліки
  formList: endpoint({ method: "POST", path: "/api/lists", input: FormListInput, output: ListResponse }),
  disbandList: endpoint({ method: "POST", path: "/api/lists/:id/disband", input: DisbandListInput, output: ListResponse }),
  approveList: endpoint({ method: "POST", path: "/api/lists/:id/approve", input: ApproveListInput, output: ListResponse }),
  notSignedList: endpoint({ method: "POST", path: "/api/lists/:id/not-signed", input: NotSignedInput, output: ListResponse }),
  lists: endpoint({ method: "GET", path: "/api/lists", output: ListsResponse }),
  // Фінал
  final: endpoint({ method: "GET", path: "/api/final", output: FinalResponse }),
  // Зведення
  registry: endpoint({ method: "GET", path: "/api/registry", output: RequestsResponse }),
  kpi: endpoint({ method: "GET", path: "/api/kpi", output: Kpi }),
  /** Запланований перелік закупівель напрямку: лише для Відділу оборонних ресурсів і Голови (рівень 5). */
  plannedList: endpoint({ method: "GET", path: "/api/planned-list", output: PlannedList }),
  // Інше
  notifications: endpoint({ method: "GET", path: "/api/notifications", output: NotificationsResponse }),
  markRead: endpoint({ method: "POST", path: "/api/notifications/read", input: MarkReadInput, output: OkResponse }),
  journal: endpoint({ method: "GET", path: "/api/journal", output: JournalResponse }),
  // Демо
  nextDay: endpoint({ method: "POST", path: "/api/demo/next-day", output: SessionResponse }),
  /** Без тіла або `withExamples: false` — чиста база без жодного рапорту; `true` — з прикладами. */
  resetDemo: endpoint({ method: "POST", path: "/api/demo/reset", input: ResetDemoInput, output: SessionResponse }),
} as const;

export type ApiName = keyof typeof API;
export type ApiInput<K extends ApiName> = (typeof API)[K] extends { input: infer I extends z.ZodType } ? z.infer<I> : undefined;
export type ApiOutput<K extends ApiName> = z.infer<(typeof API)[K]["output"]>;

export { PropertyTab };
