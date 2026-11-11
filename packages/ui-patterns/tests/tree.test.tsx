import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { TreeView, type TreeItem } from "../src/index.ts";
import { axeViolations, click, render } from "./helpers.tsx";

/**
 * TreeView за APG Tree View: одна зупинка Tab, стрілки між видимими вузлами,
 * розгортання ←/→, вибір Enter, вузол-група лише розгортається.
 */
const items: TreeItem[] = [
  {
    id: "hq",
    label: "Штаб",
    children: [
      { id: "b1", label: "Бригада 1", description: "2 дочірніх", children: [{ id: "c1", label: "Рота 1" }] },
      { id: "grp", label: "Резерв", selectable: false, children: [{ id: "b2", label: "Бригада 2" }] },
    ],
  },
];

const key = (target: Element, name: string): void => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
};
const focusedId = (): string | null => (document.activeElement as HTMLElement | null)?.dataset["treeId"] ?? null;
const labels = (container: Element): string[] => [...container.querySelectorAll(".ixp-tree__label")].map((el) => el.textContent ?? "");

test("TreeView: одна зупинка Tab; предки вибраного розгорнуті; aria-рівні й стани", () => {
  const { container, unmount } = render(<TreeView label="Підрозділи" items={items} selectedId="c1" />);
  const tree = container.querySelector('[role="tree"]')!;
  assert.equal(tree.getAttribute("aria-label"), "Підрозділи");
  assert.deepEqual(labels(container), ["Штаб", "Бригада 1", "Рота 1", "Резерв"], "гілка вибраного розгорнута, «Резерв» — ні");
  const focusable = container.querySelectorAll('[role="treeitem"][tabindex="0"]');
  assert.equal(focusable.length, 1);
  assert.equal((focusable[0] as HTMLElement).dataset["treeId"], "c1");
  const c1 = container.querySelector('[data-tree-id="c1"]')!;
  assert.equal(c1.getAttribute("aria-level"), "3");
  assert.equal(c1.getAttribute("aria-selected"), "true");
  assert.equal(container.querySelector('[data-tree-id="grp"]')!.hasAttribute("aria-selected"), false, "група не вибирається");
  assert.equal(container.querySelector('[data-tree-id="b1"]')!.getAttribute("aria-label"), "Бригада 1, 2 дочірніх");
  unmount();
});

test("TreeView: клавіатура — ↑/↓, ←/→, Home/End, Enter вибирає, на групі — розгортає", () => {
  const selected: string[] = [];
  const { container, unmount } = render(<TreeView label="Підрозділи" items={items} selectedId="hq" defaultExpandedIds={["hq"]} onSelect={(id) => selected.push(id)} />);
  const tree = container.querySelector('[role="tree"]')!;
  (container.querySelector('[data-tree-id="hq"]') as HTMLElement).focus();
  key(tree, "ArrowDown");
  assert.equal(focusedId(), "b1");
  key(tree, "ArrowRight");
  assert.ok(labels(container).includes("Рота 1"), "→ розгортає");
  key(tree, "ArrowRight");
  assert.equal(focusedId(), "c1", "повторна → веде до першого дочірнього");
  key(tree, "ArrowLeft");
  assert.equal(focusedId(), "b1", "← на листку повертає до батька");
  key(tree, "End");
  assert.equal(focusedId(), "grp");
  key(tree, "Enter");
  assert.ok(labels(container).includes("Бригада 2"), "Enter на групі розгортає");
  assert.deepEqual(selected, [], "група не вибирається");
  key(tree, "ArrowDown");
  key(tree, "Enter");
  assert.deepEqual(selected, ["b2"]);
  key(tree, "Home");
  assert.equal(focusedId(), "hq");
  unmount();
});

test("TreeView: клік по рядку вибирає, по шевроні — лише розгортає", () => {
  const selected: string[] = [];
  const { container, unmount } = render(<TreeView label="Підрозділи" items={items} defaultExpandedIds={["hq"]} onSelect={(id) => selected.push(id)} />);
  click(container.querySelector('[data-tree-id="b1"] > .ixp-tree__row .ixp-tree__toggle')!);
  assert.ok(labels(container).includes("Рота 1"));
  assert.deepEqual(selected, []);
  click(container.querySelector('[data-tree-id="c1"]')!);
  assert.deepEqual(selected, ["c1"]);
  unmount();
});

test("axe: дерево без порушень", async () => {
  const { container, unmount } = render(<TreeView label="Підрозділи" items={items} selectedId="b1" defaultExpandedIds={["hq", "grp"]} />);
  assert.deepEqual(await axeViolations(container), []);
  unmount();
});
