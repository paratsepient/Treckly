# @index/ui-patterns — Layout Shell v1

Повторювані оболонки екранів IndeX. Компонують канонічні контролі з
`@index/ui` і токени з `@index/design-tokens`; бізнес-логіки не містять.

Напрям залежностей: `apps/web` → `@index/ui-patterns` → `@index/ui` → `@index/design-tokens`.
Зворотні імпорти блокує `tools/check_boundaries.py`.

Джерело вимог: Notion «Layout System v1.0 — Shared Canvas & Reuse», «PageShell & Layout»,
«UI Design System» (ширина inspector 360 — чернетка, потребує затвердження). Sidebar — колонка іконок
шириною 64 px (рішення 2026-11-04).

## Композиція

```
AppShell                      aside (AppSidebar) | region | FeedbackLayer (один)
└── WorkspaceLayout           main
    ├── header: WorkspaceHeader
    ├── contextPanel: ContextPanel     (закріплена ≥ 1024 px, інакше Drawer)
    ├── children: WorkspaceSurface     (уся решта ширини)
    └── inspector: InspectorPanel      (плаваюча панель над полотном ≥ 1280 px, інакше Drawer)
```

```tsx
<AppShell sidebar={<AppSidebar brand={{ name: "IndeX" }} groups={navigation} activeItemId="graph" />}>
  <WorkspaceLayout
    header={<WorkspaceHeader title="Граф" saveStatus={status} primaryAction={<Button variant="primary">Зберегти</Button>} />}
    contextPanel={<ContextPanel title="Бібліотека нод">{library}</ContextPanel>}
    inspector={<InspectorPanel title={node.name} tabs={tabs} actions={actions} />}
    inspectorOpen={inspectorOpen}
    onInspectorOpenChange={setInspectorOpen}
    inspectorKey={selectedId}
  >
    <WorkspaceSurface variant="canvas" label="Полотно" overlay={<WorkspaceToolbar label="Масштаб" placement="floating">…</WorkspaceToolbar>}>
      <CanvasWorkspace />
    </WorkspaceSurface>
  </WorkspaceLayout>
</AppShell>
```

## Компоненти

| Компонент | Відповідальність | Повторно використовує |
| --- | --- | --- |
| `AppShell` | Весь viewport, режим layout, sidebar (docked/Drawer), один FeedbackLayer; перша зупинка Tab — «Перейти до вмісту» (фокус на `main` без зміни hash-маршруту) | `Drawer` |
| `AppSidebar` | Колонка іконок (назви — aria-label і Tooltip), активний маршрут зливається з ContextPanel, лічильники, роль і профіль для зчитувача, ↑/↓; у Drawer — повний список з підписами | `ScrollArea`, `Tooltip` |
| `WorkspaceLayout` | Розміщення панелей і поверхні, згортання, ширина, Drawer, фокус; новий `inspectorKey` перемонтовує вміст інспектора (поля не тримають значення попереднього об'єкта) | `Drawer`, `PanelResizer` |
| `WorkspaceHeader` | Шлях, назва, мета, SaveStatus, дії, головна дія, read-only, перемикачі панелей. Від 768 px — один рядок 48 px: дії не переносяться, місце віддає назва (спершу ховаються метадані, потім шлях — за container query); нижче — два рядки | `IconButton`, `SaveStatus` |
| `SaveStatus` | Єдиний індикатор стану збереження | `Button` |
| `WorkspaceSurface` | Межі поверхні й власник прокрутки за типом вмісту; розмір для canvas | `ScrollArea` |
| `ContextPanel` | Заголовок, пошук, дії, стани даних (`status`: loading, empty, incomplete, unavailable, stale, denied, error; для збою — «Повторити») | `PanelFrame`, `Input`, `DataState` |
| `InspectorPanel` | Вкладки, прокручуваний вміст, StickyActions, порожній стан, read-only | `PanelFrame`, `Tabs` |
| `WorkspaceToolbar` | Toolbar з однією Tab-зупинкою; inline або floating | контролі з `@index/ui` |
| `Drawer` | Модальна бічна панель на нативному `<dialog>` | `ModalDialog` (внутрішній) |
| `Dialog` | Модальний діалог для коротких рішень і невеликих форм; `kind="confirm"` не закривається кліком по backdrop | `ModalDialog`, `IconButton`, `ScrollArea` |
| `FormFieldTable` | Form Builder — впорядкована таблиця полів (назва, тип, обов'язковість, порядок, дії); поле з шаблону не видаляється, тип опублікованого поля не змінюється, а його видалення — лише після підтвердження (ADR-FORM-002); чернеткове поле видаляється одразу з «Повернути» в повідомленні; фокус після видалення — на сусідньому рядку, зміни оголошуються | `DataTable`, `Input`, `Select`, `Checkbox`, `IconButton`, `Badge`, `Dialog` |
| `useFeedback` | Повідомлення з дедуплікацією за ключем, повторна спроба | `Button`, `IconButton` |

`ModalDialog` (внутрішній) — єдиний модальний шар пакета (Drawer і Dialog): нативний `<dialog>`,
фокус повертається на елемент, з якого шар відкрили; тест забороняє другий `<dialog>`.

`PanelFrame` (внутрішній) — спільний каркас ContextPanel та InspectorPanel; стани панелі
показує той самий `DataState`, що й таблиці та віджети, тож порожнеча, збій і відсутність
доступу виглядають однаково в усьому продукті. Окремих
`NodeSidebar`, `WidgetSidebar`, `FormsSidebar` немає: змінюється лише вміст.

## Правила

- **Прокрутка.** Документ не прокручується (AppShell — `position: fixed`). Власники:
  ScrollArea навігації, тіла кожної панелі, поверхні `page`/`dashboard`. Поверхні
  `table`/`canvas`/`builder` прокрутку не мають — нею керує вміст (DataTable, pan/zoom).
  Тест забороняє `overflow: auto/scroll` у CSS пакета й вкладені ScrollArea.
- **Інспектор** не займає місце без потреби: відкриття контролює споживач
  (`inspectorOpen`). На вузьких екранах Drawer відкривається лише явною дією
  (новий `inspectorKey` або перемикач), а не через звуження вікна.
- **Фокус.** Закриття закріпленої панелі з фокусом усередині повертає його на
  перемикач у заголовку; Drawer повертає фокус на елемент, що його відкрив.
- **Права доступу** AppSidebar не обчислює: показує передані групи.
- **Повідомлення**: один FeedbackLayer; `notify({ key })` з тим самим ключем замінює
  попереднє, помилки й повідомлення з дією не зникають самі. Стан збереження показує
  SaveStatus у заголовку; тост «Збережено» — лише як підтвердження події.
- **Canvas-контракт**: `WorkspaceSurface variant="canvas"` віддає всю площу
  (`flex: 1; min-width: 0`), а `useWorkspaceSurfaceSize()` повідомляє розмір при
  зміні панелей і вікна. Один CanvasWorkspace для трьох редакторів підключається без змін каркаса.

## Колонка навігації

Поруч із контентом sidebar — вузька колонка тону фону лише з іконками, жолоб нижче
площини панелей (`--ix-shadow-groove`); активний пункт опуклий і стоїть у гнізді, як кнопка. Активний пункт
поруч із закріпленою ContextPanel фарбується кольором панелі й зливається з нею, як
вкладка-папка, повернута набік: вигини над і під ним заокруглюють сусідні ділянки колонки.
Без закріпленої панелі активний пункт — піднята плашка, а колонку від поверхні відділяє межа.
Назви груп, роль і профіль у колонці лишаються лише для зчитувача; лічильник — мітка
біля правого верхнього кута іконки, повністю поза її межами (вміщує дві цифри), число
входить у назву пункту.

## Режими (токени `layoutBreakpoints`)

| Ширина | Sidebar | ContextPanel | Inspector |
| --- | --- | --- | --- |
| ≥ 1280 | колонка іконок | закріплена | плаваюча панель над полотном |
| 1024–1279 | колонка іконок | закріплена | Drawer |
| 768–1023 | колонка іконок | Drawer | Drawer |
| < 768 (і 200% zoom від 1440) | Drawer | Drawer | Drawer |

## Команди

```bash
pnpm --filter @index/ui-patterns check
```

```bash
pnpm dev:web
```

Layout Playground — `apps/web` (http://localhost:4330/): екрани Structure, Graph,
Data, Dashboard на тих самих компонентах; перемикач теми в заголовку.

## Тести

- Поведінка й інтеграція (jsdom): режими на 1440/1280/1024/768/375/720 px, колонка іконок,
  ширина з клавіатури, Drawer і повернення фокуса, навігація, feedback, toolbar, панелі.
- axe-core: повний каркас на 1440 px, 375 px з Drawer навігації, 1024 px з Drawer інспектора.
- Архітектура: токени, жодних кольорових літералів і власної прокрутки, лише публічні
  імпорти, склад API, один `<dialog>`, спільний PanelFrame.

У jsdom немає `matchMedia`, `ResizeObserver` і `showModal`: `tests/setup.ts` замінює їх
мінімальною поведінкою. Справжня модальність, прокрутка й адаптивність перевірені в Chromium вручну.
