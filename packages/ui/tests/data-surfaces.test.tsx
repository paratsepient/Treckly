import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { act, createRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  DataState,
  DataTable,
  GraphCanvas,
  GraphFrame,
  GraphNode,
  Icon,
  IconButton,
  Menu,
  Popover,
  type DataStateKind,
  type GraphCanvasHandle,
  type GraphView,
  type TableSort,
} from "../src/index.ts";
import { fitViewTo, type GraphLayoutChange } from "../src/graph/GraphCanvas.tsx";
import { axeViolations, byRole, click, focus, keyDown, render } from "./helpers.tsx";

// ---------- Card, Badge, DataState ----------

test("Card: заголовок дає назву секції, вибір — атрибут стану, дії праворуч", () => {
  const { container, unmount } = render(
    <Card title="Донесення за добу" subtitle="Форма F-12" actions={<IconButton label="Налаштувати" icon={<Icon name="widget-settings" />} />} selected>
      <p>Вміст</p>
    </Card>,
  );
  const section = container.querySelector("section")!;
  const heading = container.querySelector("h3")!;
  assert.equal(section.getAttribute("aria-labelledby"), heading.id);
  assert.equal(heading.textContent, "Донесення за добу");
  assert.ok(section.hasAttribute("data-selected"));
  assert.ok(container.querySelector(".ix-card__actions button"));
  unmount();
});

test("Badge: текст завжди видимий, іконка декоративна", () => {
  const { container, unmount } = render(
    <Badge tone="warning" icon={<Icon name="stale" size={16} />}>
      Застаріло
    </Badge>,
  );
  const badge = container.querySelector(".ix-badge")!;
  assert.equal(badge.getAttribute("data-tone"), "warning");
  assert.equal(badge.textContent, "Застаріло");
  assert.equal(badge.querySelector(".ix-badge__icon")!.getAttribute("aria-hidden"), "true");
  unmount();
});

test("DataState: кожен стан має іконку і текст; збій оголошується, порожнеча — ні", () => {
  const kinds: DataStateKind[] = ["loading", "empty", "incomplete", "unavailable", "stale", "denied", "error"];
  const roles: Record<DataStateKind, string | null> = {
    loading: "status",
    empty: null,
    incomplete: null,
    unavailable: "alert",
    stale: null,
    denied: null,
    error: "alert",
  };
  for (const kind of kinds) {
    const { container, unmount } = render(<DataState kind={kind} />);
    const root = container.querySelector(".ix-data-state")!;
    assert.equal(root.getAttribute("role"), roles[kind], kind);
    assert.ok(root.querySelector(".ix-data-state__icon svg"), `${kind}: немає іконки`);
    assert.ok((root.querySelector(".ix-data-state__title")!.textContent ?? "").length > 0, `${kind}: немає тексту`);
    unmount();
  }
});

// ---------- DataTable ----------

interface Row {
  readonly id: string;
  readonly unit: string;
  readonly value: number;
}

const rows: Row[] = [
  { id: "R-1", unit: "Підрозділ 1", value: 12 },
  { id: "R-2", unit: "Підрозділ 2", value: 7 },
];

function SortableTable({ onSelect }: { readonly onSelect?: (id: string) => void }) {
  const [sort, setSort] = useState<TableSort | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  return (
    <DataTable
      label="Записи форми"
      columns={[
        { key: "id", header: "ID", mono: true },
        { key: "unit", header: "Підрозділ", sortable: true },
        { key: "value", header: "Значення", numeric: true, sortable: true },
      ]}
      rows={rows}
      getRowId={(row) => row.id}
      sort={sort}
      onSortChange={setSort}
      currentRowId={current}
      onRowSelect={(id) => {
        setCurrent(id);
        onSelect?.(id);
      }}
    />
  );
}

test("DataTable: caption, заголовки стовпців і рядків, числа праворуч", () => {
  const { container, unmount } = render(<SortableTable />);
  const table = container.querySelector("table")!;
  assert.equal(table.querySelector("caption")!.textContent, "Записи форми");
  assert.equal(table.querySelectorAll('th[scope="col"]').length, 3);
  assert.equal(table.querySelectorAll('th[scope="row"]').length, 2);
  assert.ok(table.querySelector('td[data-numeric]'));
  unmount();
});

test("DataTable: сортування — кнопка в заголовку, aria-sort перемикається", () => {
  const { container, unmount } = render(<SortableTable />);
  const header = () => container.querySelectorAll('th[scope="col"]')[2]!;
  assert.equal(header().getAttribute("aria-sort"), "none");
  click(header().querySelector("button")!);
  assert.equal(header().getAttribute("aria-sort"), "ascending");
  click(header().querySelector("button")!);
  assert.equal(header().getAttribute("aria-sort"), "descending");
  // Несортовний стовпець не має aria-sort.
  assert.equal(container.querySelectorAll('th[scope="col"]')[0]!.hasAttribute("aria-sort"), false);
  unmount();
});

test("DataTable: вибір рядка кнопкою в заголовку рядка позначає aria-current", () => {
  const selected: string[] = [];
  const { container, unmount } = render(<SortableTable onSelect={(id) => selected.push(id)} />);
  click(container.querySelector('th[scope="row"] button')!);
  assert.deepEqual(selected, ["R-1"], "клік по кнопці не дублюється кліком по рядку");
  assert.equal(container.querySelector("tbody tr")!.getAttribute("aria-current"), "true");
  assert.equal(container.querySelector('th[scope="row"] button')!.getAttribute("aria-pressed"), "true");
  unmount();
});

test("DataTable: кнопки рядків — одна зупинка Tab, стрілки й Home/End переходять між ними", () => {
  const { container, unmount } = render(<SortableTable onSelect={() => undefined} />);
  const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('th[scope="row"] button')];
  assert.deepEqual(buttons().map((button) => button.tabIndex), [0, -1], "без поточного рядка зупинка — перший");
  focus(buttons()[0]!);
  keyDown(buttons()[0]!, "ArrowDown");
  assert.equal(document.activeElement, buttons()[1]);
  assert.deepEqual(buttons().map((button) => button.tabIndex), [-1, 0], "зупинка йде за фокусом");
  keyDown(buttons()[1]!, "Home");
  assert.equal(document.activeElement, buttons()[0]);
  keyDown(buttons()[0]!, "End");
  assert.equal(document.activeElement, buttons()[1]);
  keyDown(buttons()[1]!, "ArrowDown");
  assert.equal(document.activeElement, buttons()[1], "за останнім рядком фокус лишається");
  unmount();
});

test("DataTable: стан даних замість рядків, заголовки лишаються", () => {
  const { container, unmount } = render(
    <DataTable label="Записи" columns={[{ key: "id", header: "ID" }]} rows={rows} getRowId={(row) => row.id} state="denied" />,
  );
  assert.equal(container.querySelectorAll('th[scope="col"]').length, 1);
  assert.equal(container.querySelectorAll('th[scope="row"]').length, 0);
  assert.equal(container.querySelector(".ix-data-state")!.getAttribute("data-kind"), "denied");
  unmount();
  const empty = render(<DataTable label="Записи" columns={[{ key: "id", header: "ID" }]} rows={[]} getRowId={(row: Row) => row.id} />);
  assert.equal(empty.container.querySelector(".ix-data-state")!.getAttribute("data-kind"), "empty");
  empty.unmount();
});

// ---------- Popover, Menu ----------

test("Popover: відкриття, фокус у панелі, Escape закриває й повертає фокус", () => {
  const { container, unmount } = render(
    <Popover label="Фільтр записів" trigger={<Button>Фільтр</Button>}>
      <Button>Застосувати</Button>
    </Popover>,
  );
  const trigger = container.querySelector("button")!;
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(trigger.getAttribute("aria-haspopup"), "dialog");
  click(trigger);
  const panel = document.querySelector<HTMLElement>('[role="dialog"].ix-popover')!;
  assert.ok(panel, "панель у порталі");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(trigger.getAttribute("aria-controls"), panel.id);
  assert.equal(panel.getAttribute("aria-label"), "Фільтр записів");
  assert.ok(panel.contains(document.activeElement), "фокус у панелі");
  keyDown(document.activeElement!, "Escape");
  assert.equal(document.querySelector(".ix-popover"), null);
  assert.equal(document.activeElement, trigger);
  unmount();
});

test("Popover: закриття кнопкою в панелі (керований open) повертає фокус на тригер", () => {
  function Controlled() {
    const [open, setOpen] = useState(false);
    return (
      <Popover label="Фільтр" open={open} onOpenChange={setOpen} trigger={<Button>Фільтр</Button>}>
        <Button onClick={() => setOpen(false)}>Застосувати</Button>
      </Popover>
    );
  }
  const { container, unmount } = render(<Controlled />);
  const trigger = container.querySelector("button")!;
  click(trigger);
  const apply = document.querySelector<HTMLButtonElement>(".ix-popover button")!;
  focus(apply);
  click(apply);
  assert.equal(document.querySelector(".ix-popover"), null);
  assert.equal(document.activeElement, trigger, "фокус не падає на body");
  unmount();
});

test("Popover: клік поза панеллю закриває", () => {
  const { container, unmount } = render(
    <Popover label="Фільтр" trigger={<Button>Фільтр</Button>}>
      <p>Вміст</p>
    </Popover>,
  );
  click(container.querySelector("button")!);
  assert.ok(document.querySelector(".ix-popover"));
  const outside = document.createElement("div");
  document.body.append(outside);
  act(() => {
    outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });
  assert.equal(document.querySelector(".ix-popover"), null);
  outside.remove();
  unmount();
});

test("Menu: стрілки рухають фокус, Enter виконує дію, меню закривається й фокус повертається", () => {
  const done: string[] = [];
  const { container, unmount } = render(
    <Menu
      label="Дії з віджетом"
      trigger={<IconButton label="Ще" icon={<Icon name="more" />} />}
      items={[
        { id: "dup", label: "Дублювати", onSelect: () => done.push("dup") },
        { id: "rename", label: "Перейменувати", onSelect: () => done.push("rename") },
        { separator: true, id: "sep" },
        { id: "del", label: "Видалити", destructive: true, onSelect: () => done.push("del") },
      ]}
    />,
  );
  const trigger = container.querySelector("button")!;
  assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  focus(trigger);
  keyDown(trigger, "ArrowDown");
  const menu = document.querySelector('[role="menu"]')!;
  const items = byRole<HTMLButtonElement>(menu, "menuitem");
  assert.equal(items.length, 3);
  assert.equal(document.activeElement, items[0]);
  keyDown(items[0]!, "ArrowDown");
  assert.equal(document.activeElement, items[1]);
  keyDown(items[1]!, "End");
  assert.equal(document.activeElement, items[2]);
  keyDown(items[2]!, "ArrowDown");
  assert.equal(document.activeElement, items[0], "по колу");
  keyDown(items[0]!, "п");
  assert.equal(document.activeElement, items[1], "пошук за першою літерою");
  click(items[1]!);
  assert.deepEqual(done, ["rename"]);
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(document.activeElement, trigger);
  unmount();
});

test("Menu: ↑ на тригері відкриває з останнього пункту, Escape закриває", () => {
  const { container, unmount } = render(
    <Menu
      label="Дії"
      trigger={<Button>Дії</Button>}
      items={[
        { id: "a", label: "Перший", onSelect: () => undefined },
        { id: "b", label: "Останній", onSelect: () => undefined },
      ]}
    />,
  );
  const trigger = container.querySelector("button")!;
  focus(trigger);
  keyDown(trigger, "ArrowUp");
  assert.equal(document.activeElement?.textContent, "Останній");
  keyDown(document.activeElement!, "Escape");
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(document.activeElement, trigger);
  unmount();
});

// ---------- Граф ----------

test("GraphNode: подвійний клік по заголовку відкриває ноду (onOpen), одинарний — лише вибирає", () => {
  const events: string[] = [];
  const { container, unmount } = render(
    <GraphCanvas label="Полотно графа">
      <GraphNode id="u1" type="Підрозділ" name="Бригада 1" x={0} y={0} onSelect={() => events.push("select")} onOpen={() => events.push("open")} />
    </GraphCanvas>,
  );
  const header = container.querySelector<HTMLButtonElement>(".ix-graph-node__header")!;
  click(header);
  assert.deepEqual(events, ["select"]);
  act(() => header.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  assert.deepEqual(events, ["select", "open"]);
  unmount();
});

test("GraphNode: заголовок — кнопка вибору, порти з видимими підписами й станом для зчитувача", () => {
  const selected: string[] = [];
  const { container, unmount } = render(
    <GraphCanvas label="Полотно графа" edges={[{ id: "e1", from: "n1:out", to: "n2:in" }]}>
      <GraphFrame id="f" label="Обробка" x={0} y={0} width={400} height={200} />
      <GraphNode id="n1" type="Form" name="Донесення" x={10} y={10} outputs={[{ id: "n1:out", label: "Записи", connected: true }]} onSelect={() => selected.push("n1")} />
      <GraphNode
        id="n2"
        type="Filter"
        name="Термінові"
        x={260}
        y={10}
        inputs={[{ id: "n2:in", label: "Вхід", invalid: true }]}
        status={{ tone: "warning", label: "Не налаштовано" }}
        selected
      />
    </GraphCanvas>,
  );
  const nodes = container.querySelectorAll(".ix-graph-node");
  assert.equal(nodes.length, 2);
  click(nodes[0]!.querySelector("button")!);
  assert.deepEqual(selected, ["n1"]);
  // Вибір ноди — «поточна в наборі», а не перемикач.
  assert.equal(nodes[0]!.querySelector("button")!.hasAttribute("aria-pressed"), false);
  assert.equal(nodes[1]!.querySelector("button"), null, "без onSelect заголовок не кнопка");
  assert.ok(nodes[1]!.hasAttribute("data-selected"));
  assert.match(nodes[0]!.textContent ?? "", /під'єднано/);
  assert.match(nodes[1]!.textContent ?? "", /помилка з'єднання/);
  assert.match(nodes[1]!.textContent ?? "", /Не налаштовано/);
  assert.ok(container.querySelector('[data-graph-port="n1:out"]'));
  assert.equal(container.querySelector(".ix-graph-frame")!.getAttribute("aria-label"), "Фрейм: Обробка");
  // Ребро будується з виміряних сокетів (у jsdom — нульові прямокутники, але геометрія є).
  assert.equal(container.querySelectorAll(".ix-graph-edge").length, 1);
  unmount();
});


// ---------- Доступність ----------

test("axe: картка, стани, таблиця, граф без порушень", async () => {
  const { container, unmount } = render(
    <main>
      <Card title="Віджет" footer={<Badge tone="info">Вибірка</Badge>}>
        <DataState kind="stale" description="Оновлено 2 години тому." action={<Button>Оновити</Button>} />
      </Card>
      <SortableTable />
      <GraphCanvas label="Полотно">
        <GraphNode id="a" type="Form" name="Донесення" x={0} y={0} outputs={[{ id: "a:out", label: "Записи" }]} onSelect={() => undefined} />
      </GraphCanvas>
      <GraphCanvas label="Редагований граф" onLayoutChange={() => undefined} edges={[{ id: "e", from: "b:out", to: "c:in", bends: [{ x: 300, y: 300 }] }]}>
        <GraphFrame id="f" label="Обробка" x={0} y={0} width={600} height={300} />
        <GraphNode id="b" frame="f" type="Form" name="Донесення" x={20} y={40} outputs={[{ id: "b:out", label: "Записи" }]} onSelect={() => undefined} />
        <GraphNode id="c" type="Filter" name="Термінові" x={400} y={40} pinned inputs={[{ id: "c:in", label: "Записи" }]} onSelect={() => undefined} />
      </GraphCanvas>
      <GraphCanvas label="Згорнутий фрейм" onLayoutChange={() => undefined}>
        <GraphFrame id="g" label="Архів" x={0} y={0} width={600} height={300} collapsed />
        <GraphNode id="d" frame="g" type="Form" name="Старе" x={20} y={40} onSelect={() => undefined} />
      </GraphCanvas>
    </main>,
  );
  assert.deepEqual(await axeViolations(container), []);
  unmount();
});

test("axe: відкрите меню і popover без порушень", async () => {
  const { container, unmount } = render(
    <main>
      <Menu label="Дії" trigger={<Button>Дії</Button>} items={[{ id: "a", label: "Дублювати", onSelect: () => undefined }]} />
      <Popover label="Фільтр" trigger={<Button>Фільтр</Button>} defaultOpen>
        <Button>Застосувати</Button>
      </Popover>
    </main>,
  );
  click(container.querySelector("button")!);
  assert.deepEqual(await axeViolations(document.body), []);
  unmount();
});

// ---------- Порядок Tab із плаваючих шарів ----------

test("Menu: Tab закриває меню й веде до елемента після тригера, Shift+Tab — на тригер", () => {
  const items = [{ id: "a", label: "Дублювати", onSelect: () => undefined }];
  const { container, unmount } = render(
    <main>
      <Menu label="Дії" trigger={<Button>Дії</Button>} items={items} />
      <Button>Наступна</Button>
    </main>,
  );
  const [trigger, next] = [...container.querySelectorAll<HTMLButtonElement>("main > * button, main > button")];
  focus(trigger!);
  keyDown(trigger!, "ArrowDown");
  const event = keyDown(document.activeElement!, "Tab");
  assert.equal(event.defaultPrevented, true, "рідний Tab вивів би фокус із порталу за межі сторінки");
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(document.activeElement, next);
  focus(trigger!);
  keyDown(trigger!, "ArrowDown");
  const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  act(() => {
    document.activeElement!.dispatchEvent(back);
  });
  assert.equal(document.activeElement, trigger);
  unmount();
});

test("Popover: Tab з останнього елемента веде після тригера, Shift+Tab з першого — на тригер", () => {
  const { container, unmount } = render(
    <main>
      <Popover label="Фільтр" trigger={<Button>Фільтр</Button>}>
        <Button>Скинути</Button>
        <Button>Застосувати</Button>
      </Popover>
      <Button>Наступна</Button>
    </main>,
  );
  const trigger = container.querySelector<HTMLButtonElement>("button")!;
  const next = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Наступна")!;
  click(trigger);
  const panel = document.querySelector<HTMLElement>(".ix-popover")!;
  const [first, last] = [...panel.querySelectorAll<HTMLButtonElement>("button")];
  assert.equal(document.activeElement, first);
  // Tab усередині панелі — рідний.
  assert.equal(keyDown(first!, "Tab").defaultPrevented, false);
  act(() => last!.focus());
  assert.equal(keyDown(last!, "Tab").defaultPrevented, true);
  assert.equal(document.querySelector(".ix-popover"), null);
  assert.equal(document.activeElement, next);
  click(trigger);
  const reopened = document.querySelector<HTMLElement>(".ix-popover")!;
  const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  act(() => {
    reopened.querySelector("button")!.dispatchEvent(back);
  });
  assert.equal(back.defaultPrevented, true);
  assert.equal(document.activeElement, trigger);
  unmount();
});

// ---------- Вид полотна (pan/zoom) ----------

test("fitViewTo: граф уміщується у видиму частину без закритої інспектором смуги, масштаб не більший за 100 %", () => {
  const view = fitViewTo({ x: 0, y: 0, width: 1000, height: 400 }, { width: 800, height: 600 }, { right: 300 });
  // Доступно 800 − 300 − 2 × 24 = 452 px по ширині: 452 / 1000.
  assert.equal(view.zoom, 0.5, "не менше нижньої межі масштабу");
  const small = fitViewTo({ x: 100, y: 50, width: 200, height: 100 }, { width: 800, height: 600 });
  assert.equal(small.zoom, 1, "малий граф не збільшується");
  // Центр вмісту — у центрі видимої частини.
  assert.equal(small.x + (100 + 100) * small.zoom, 400);
  assert.equal(small.y + (50 + 50) * small.zoom, 300);
});

test("GraphCanvas: стрілки панорамують, плюс і мінус масштабують сфокусоване полотно; межі масштабу", () => {
  const views: GraphView[] = [];
  const handle = createRef<GraphCanvasHandle>();
  const { container, unmount } = render(
    <GraphCanvas ref={handle} label="Полотно" onViewChange={(view) => views.push(view)}>
      <GraphNode id="n1" type="Form" name="Донесення" x={0} y={0} onSelect={() => undefined} />
    </GraphCanvas>,
  );
  const canvas = container.querySelector<HTMLElement>(".ix-graph")!;
  assert.equal(canvas.tabIndex, 0, "полотно — зупинка Tab для клавіатурного панорамування");
  assert.ok(canvas.getAttribute("aria-describedby"), "підказка клавіш для зчитувача");
  focus(canvas);
  keyDown(canvas, "ArrowRight");
  assert.deepEqual(views.at(-1), { x: -48, y: 0, zoom: 1 });
  keyDown(canvas, "+");
  assert.equal(views.at(-1)!.zoom, 1.25);
  act(() => handle.current!.zoomBy(10));
  assert.equal(views.at(-1)!.zoom, 2, "верхня межа 200 %");
  const count = views.length;
  act(() => handle.current!.zoomBy(2));
  assert.equal(views.length, count, "за межею вид не змінюється");
  act(() => handle.current!.resetZoom());
  assert.equal(views.at(-1)!.zoom, 1);
  // Стрілки в ноді не панорамують полотно.
  keyDown(container.querySelector(".ix-graph-node button")!, "ArrowLeft");
  assert.equal(views.at(-1)!.zoom, 1);
  assert.equal(views.length, count + 1);
  unmount();
});

/** Указівник на елементі: jsdom не має PointerEvent, React читає тип і координати з MouseEvent. */
function pointerAt(element: Element, type: string, x: number, y: number): void {
  act(() => {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
  });
}

/** Полотно з власником розкладки: зміни застосовуються, як у справжньому екрані. */
interface HarnessNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly pinned?: boolean;
  readonly frame?: string;
}

function LayoutHarness({
  nodes: initialNodes,
  frames: initialFrames = [],
  edges: initialEdges = [],
  changes,
  zoom = 1,
  onSelect,
}: {
  readonly nodes: readonly HarnessNode[];
  readonly frames?: readonly { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly collapsed?: boolean }[];
  readonly edges?: readonly { readonly id: string; readonly from: string; readonly to: string; readonly bends?: readonly { x: number; y: number }[] }[];
  readonly changes: GraphLayoutChange[];
  readonly zoom?: number;
  readonly onSelect?: (id: string) => void;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [frames, setFrames] = useState(initialFrames);
  const [edges, setEdges] = useState(initialEdges);
  const apply = (change: GraphLayoutChange): void => {
    changes.push(change);
    setNodes((current) =>
      current.map((node) => {
        const next = change.nodes.find((item) => item.id === node.id);
        if (!next) return node;
        return { ...node, x: next.x, y: next.y, ...(next.frame === undefined ? {} : { frame: next.frame ?? undefined }) };
      }),
    );
    setFrames((current) => current.map((frame) => ({ ...frame, ...change.frames.find((item) => item.id === frame.id) })));
    setEdges((current) => current.map((edge) => ({ ...edge, ...change.edges.find((item) => item.id === edge.id) })));
  };
  return (
    <GraphCanvas label="Полотно" defaultView={{ x: 0, y: 0, zoom }} edges={edges} onLayoutChange={apply}>
      {frames.map((frame) => (
        <GraphFrame key={frame.id} label={`Фрейм ${frame.id}`} {...frame} />
      ))}
      {nodes.map((node) => (
        <GraphNode
          key={node.id}
          {...node}
          type="Form"
          name={`Нода ${node.id}`}
          inputs={[{ id: `${node.id}:in`, label: "Вхід" }]}
          outputs={[{ id: `${node.id}:out`, label: "Вихід" }]}
          onSelect={() => onSelect?.(node.id)}
        />
      ))}
    </GraphCanvas>
  );
}

const nodeElement = (container: Element, id: string): HTMLElement => container.querySelector<HTMLElement>(`[data-graph-node="${id}"]`)!;

test("GraphCanvas: перетягування — попередній результат на сітці, кидок одним кроком, клік після нього не вибирає", () => {
  const changes: GraphLayoutChange[] = [];
  const selected: string[] = [];
  const { container, unmount } = render(<LayoutHarness nodes={[{ id: "a", x: 100, y: 40 }]} changes={changes} zoom={2} onSelect={(id) => selected.push(id)} />);
  const node = nodeElement(container, "a");
  const header = node.querySelector<HTMLButtonElement>("button")!;
  assert.ok(node.hasAttribute("data-movable"));
  // Рух на 2 px — не перетягування: клік вибирає ноду.
  pointerAt(header, "pointerdown", 10, 10);
  pointerAt(header, "pointermove", 12, 10);
  pointerAt(header, "pointerup", 12, 10);
  click(header);
  assert.equal(changes.length, 0);
  assert.deepEqual(selected, ["a"]);
  // 46 px екрана при 200 % — 23 px світу: нода йде за курсором, контур — у вузлі сітки.
  pointerAt(header, "pointerdown", 10, 10);
  pointerAt(header, "pointermove", 56, 36);
  assert.ok(node.hasAttribute("data-dragging"));
  assert.equal(node.style.transform, "translate(23px, 13px)");
  const ghost = container.querySelector<HTMLElement>(".ix-graph-ghost")!;
  assert.equal(ghost.style.left, "120px");
  assert.equal(ghost.style.top, "60px");
  assert.equal(changes.length, 0, "під час руху змін немає — лише попередній результат");
  pointerAt(header, "pointerup", 56, 36);
  click(header);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0]!.nodes, [{ id: "a", x: 120, y: 60 }]);
  assert.equal(changes[0]!.action, "move-node");
  assert.equal(node.style.left, "120px");
  assert.equal(node.hasAttribute("data-dragging"), false);
  assert.equal(container.querySelector(".ix-graph-ghost"), null);
  assert.deepEqual(selected, ["a"], "відпускання після перетягування не вибирає ноду");
  // Стрілки — клітинка сітки (20), із Shift — чотири.
  keyDown(header, "ArrowRight");
  assert.deepEqual(changes.at(-1)!.nodes, [{ id: "a", x: 140, y: 60 }]);
  act(() => {
    header.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }));
  });
  assert.deepEqual(changes.at(-1)!.nodes, [{ id: "a", x: 140, y: 140 }]);
  assert.ok(header.getAttribute("aria-describedby"), "підказка клавіш для зчитувача");
  unmount();
});

test("GraphCanvas: нода, кинута на іншу, розсуває її з проміжком у клітинку; Escape скасовує", () => {
  const changes: GraphLayoutChange[] = [];
  const { container, unmount } = render(<LayoutHarness nodes={[{ id: "a", x: 0, y: 0 }, { id: "b", x: 300, y: 0 }]} changes={changes} />);
  const header = nodeElement(container, "a").querySelector("button")!;
  pointerAt(header, "pointerdown", 0, 0);
  pointerAt(header, "pointermove", 300, 0);
  // Сусід заздалегідь показує, куди його буде зсунуто.
  assert.ok(nodeElement(container, "b").hasAttribute("data-pushed"));
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  assert.equal(nodeElement(container, "b").hasAttribute("data-pushed"), false);
  pointerAt(header, "pointerup", 300, 0);
  assert.equal(changes.length, 0, "Escape скасовує кидок");
  pointerAt(header, "pointerdown", 0, 0);
  pointerAt(header, "pointermove", 300, 0);
  pointerAt(header, "pointerup", 300, 0);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.placement, "push");
  const a = changes[0]!.nodes.find((item) => item.id === "a")!;
  const b = changes[0]!.nodes.find((item) => item.id === "b")!;
  assert.deepEqual(a, { id: "a", x: 300, y: 0 });
  // У jsdom нода має запасний розмір 192 × 80: між ними щонайменше 20.
  const apart = b.x >= a.x + 192 + 20 || b.x + 192 + 20 <= a.x || b.y >= a.y + 80 + 20 || b.y + 80 + 20 <= a.y;
  assert.ok(apart, JSON.stringify(b));
  assert.match(container.querySelector('[aria-live="polite"]')!.textContent ?? "", /розсунуто/);
  unmount();
});

test("GraphCanvas: закріплена нода не тягнеться й не розсувається — нода стає на вільне місце", () => {
  const changes: GraphLayoutChange[] = [];
  const { container, unmount } = render(<LayoutHarness nodes={[{ id: "a", x: 0, y: 0 }, { id: "p", x: 300, y: 0, pinned: true }]} changes={changes} />);
  const pinned = nodeElement(container, "p");
  assert.equal(pinned.hasAttribute("data-movable"), false);
  assert.match(pinned.textContent ?? "", /закріплено/);
  pointerAt(pinned.querySelector("button")!, "pointerdown", 300, 0);
  pointerAt(pinned.querySelector("button")!, "pointermove", 400, 100);
  pointerAt(pinned.querySelector("button")!, "pointerup", 400, 100);
  assert.equal(changes.length, 0);
  const header = nodeElement(container, "a").querySelector("button")!;
  pointerAt(header, "pointerdown", 0, 0);
  pointerAt(header, "pointermove", 300, 0);
  pointerAt(header, "pointerup", 300, 0);
  assert.equal(changes[0]!.placement, "relocate");
  assert.equal(changes[0]!.nodes.some((item) => item.id === "p"), false);
  unmount();
});

test("GraphFrame: перенесення несе вміст, згортання ховає ноди й внутрішні ребра, зовнішні лишаються", () => {
  const changes: GraphLayoutChange[] = [];
  const { container, unmount } = render(
    <LayoutHarness
      nodes={[{ id: "a", x: 20, y: 40, frame: "f" }, { id: "b", x: 260, y: 40, frame: "f" }, { id: "c", x: 700, y: 40 }]}
      frames={[{ id: "f", x: 0, y: 0, width: 500, height: 200 }]}
      edges={[{ id: "inner", from: "a:out", to: "b:in" }, { id: "outer", from: "b:out", to: "c:in" }]}
      changes={changes}
    />,
  );
  const handle = container.querySelector<HTMLButtonElement>("[data-graph-frame-handle]")!;
  assert.equal(handle.getAttribute("aria-expanded"), "true");
  assert.equal(container.querySelectorAll(".ix-graph-edge").length, 2);
  pointerAt(handle, "pointerdown", 0, 0);
  pointerAt(handle, "pointermove", 0, 300);
  assert.equal(nodeElement(container, "a").style.transform, "translate(0px, 300px)", "вміст рухається разом із фреймом");
  pointerAt(handle, "pointerup", 0, 300);
  click(handle);
  assert.equal(changes.length, 1, "клік після перетягування не згортає");
  assert.equal(changes[0]!.action, "move-frame");
  assert.deepEqual(changes[0]!.frames, [{ id: "f", x: 0, y: 300 }]);
  assert.deepEqual(changes[0]!.nodes.map((item) => [item.id, item.y]).sort(), [["a", 340], ["b", 340]]);
  click(handle);
  assert.equal(changes.at(-1)!.action, "collapse-frame");
  assert.equal(handle.getAttribute("aria-expanded"), "false");
  assert.match(handle.textContent ?? "", /2 ноди/);
  for (const id of ["a", "b"]) {
    const node = nodeElement(container, id);
    assert.ok(node.hasAttribute("data-hidden"));
    assert.ok(node.hasAttribute("inert"), "схована нода недосяжна з клавіатури");
  }
  assert.equal(container.querySelectorAll(".ix-graph-edge").length, 1, "лишилося зовнішнє ребро");
  click(handle);
  assert.equal(changes.at(-1)!.action, "expand-frame");
  assert.equal(nodeElement(container, "a").hasAttribute("data-hidden"), false);
  unmount();
});

test("GraphCanvas: ручні згини — маркери, подвійний клік видаляє, згин на ноді зсувається", () => {
  const changes: GraphLayoutChange[] = [];
  const { container, unmount } = render(
    <LayoutHarness
      nodes={[{ id: "a", x: 0, y: 0 }, { id: "b", x: 600, y: 0 }]}
      edges={[{ id: "e", from: "a:out", to: "b:in", bends: [{ x: 300, y: 300 }, { x: 40, y: 40 }] }]}
      changes={changes}
    />,
  );
  const bends = container.querySelectorAll<SVGRectElement>("[data-graph-bend]");
  assert.equal(bends.length, 2);
  // Другий згин лежав на ноді a — маршрут використовує зсунуте положення.
  assert.notEqual(`${bends[1]!.getAttribute("x")},${bends[1]!.getAttribute("y")}`, "36,36");
  act(() => {
    bends[0]!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  assert.equal(changes.at(-1)!.action, "edit-bends");
  assert.equal(changes.at(-1)!.edges[0]!.bends.length, 1);
  assert.equal(container.querySelectorAll("[data-graph-bend]").length, 1);
  assert.ok(container.querySelector("[data-graph-edge]"), "ребро має ціль подвійного кліку");
  unmount();
});

test("GraphCanvas без onLayoutChange — лише перегляд: ноди нерухомі, фрейм без кнопки", () => {
  const { container, unmount } = render(
    <GraphCanvas label="Полотно" edges={[{ id: "e", from: "a:out", to: "a:in", bends: [{ x: 300, y: 300 }] }]}>
      <GraphFrame id="f" label="Обробка" x={0} y={0} width={400} height={200} />
      <GraphNode id="a" type="Form" name="Донесення" x={20} y={40} outputs={[{ id: "a:out", label: "Записи" }]} inputs={[{ id: "a:in", label: "Вхід" }]} onSelect={() => undefined} />
    </GraphCanvas>,
  );
  const node = container.querySelector<HTMLElement>(".ix-graph-node")!;
  assert.equal(node.hasAttribute("data-movable"), false);
  assert.equal(node.querySelector("button")!.hasAttribute("aria-describedby"), false);
  assert.equal(container.querySelector("[data-graph-frame-handle]"), null);
  assert.equal(container.querySelector("[data-graph-bend]"), null);
  assert.equal(container.querySelectorAll(".ix-graph-edge").length, 1);
  unmount();
});

test("GraphCanvas: ліва кнопка на порожньому місці — рамка виділення, права — огляд графа", () => {
  const picks: { ids: readonly string[]; additive: boolean }[] = [];
  const views: GraphView[] = [];
  const { container, unmount } = render(
    <GraphCanvas label="Полотно" onMarqueeSelect={(ids, { additive }) => picks.push({ ids, additive })} onViewChange={(view) => views.push(view)}>
      <GraphNode id="a" type="Form" name="А" x={0} y={0} />
      <GraphNode id="b" type="Form" name="Б" x={300} y={0} />
      <GraphNode id="c" type="Form" name="В" x={0} y={300} />
    </GraphCanvas>,
  );
  const canvas = container.querySelector<HTMLElement>(".ix-graph")!;
  const mouse = (type: string, x: number, y: number, init: MouseEventInit = {}): void =>
    act(() => {
      canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, ...init }));
    });
  // У jsdom полотно в точці 0,0 і вид без зсуву: координати екрана = координати світу.
  mouse("pointerdown", -10, -10, { button: 0 });
  mouse("pointermove", 400, 50, { button: 0 });
  assert.ok(container.querySelector(".ix-graph-marquee"), "рамка видна під час руху");
  assert.equal(views.length, 0, "ліва кнопка не рухає вид");
  mouse("pointerup", 400, 50, { button: 0, shiftKey: true });
  assert.equal(container.querySelector(".ix-graph-marquee"), null);
  assert.deepEqual(picks, [{ ids: ["a", "b"], additive: true }], "ноди, яких торкається рамка; Shift — додати");
  // Права кнопка — огляд; контекстне меню браузера не відкривається.
  mouse("pointerdown", 100, 100, { button: 2 });
  mouse("pointermove", 160, 140, { button: 2 });
  mouse("pointerup", 160, 140, { button: 2 });
  assert.deepEqual(views.at(-1), { x: 60, y: 40, zoom: 1 });
  const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  act(() => {
    canvas.dispatchEvent(menu);
  });
  assert.equal(menu.defaultPrevented, true);
  assert.equal(picks.length, 1, "огляд не виділяє");
  unmount();
});
