import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import {
  AppShell,
  AppSidebar,
  ContextPanel,
  InspectorPanel,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceSurface,
  type NavGroup,
  type WorkspaceLayoutProps,
} from "../src/index.ts";
import { setViewportWidthRaw } from "./setup.ts";

export interface Rendered {
  readonly container: HTMLDivElement;
  readonly rerender: (ui: ReactNode) => void;
  readonly unmount: () => void;
}

const mounted = new Set<() => void>();

/**
 * Прибирає все, що лишилося від попереднього тесту (якщо він упав до unmount),
 * щоб залишки DOM не спотворювали перевірки axe та лічильники елементів.
 */
export function cleanup(): void {
  for (const unmount of [...mounted]) unmount();
  document.body.replaceChildren();
}

export function render(ui: ReactNode): Rendered {
  cleanup();
  const container = document.createElement("div");
  document.body.append(container);
  let root: Root | undefined;
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  const unmount = (): void => {
    if (!mounted.delete(unmount)) return;
    act(() => root?.unmount());
    container.remove();
  };
  mounted.add(unmount);
  return {
    container,
    rerender: (next) => act(() => root?.render(next)),
    unmount,
  };
}

export function setViewportWidth(width: number): void {
  act(() => setViewportWidthRaw(width));
}

export function click(element: Element): void {
  act(() => (element as HTMLElement).click());
}

/** Фокус «з клавіатури»: Tab перед фокусом робить його :focus-visible. */
export function focus(element: Element): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    (element as HTMLElement).focus();
  });
}

export function keyDown(element: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

/** Escape у модальному <dialog> браузер перетворює на подію cancel. */
export function cancelDialog(dialog: Element): void {
  act(() => {
    // Event з jsdom, а не глобальний Event з Node: інакше dispatchEvent його відхиляє.
    dialog.dispatchEvent(new window.Event("cancel", { cancelable: true }));
  });
}

export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

export async function axeViolations(element: Element): Promise<string[]> {
  const result = await axe.run(element, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  return result.violations.map(
    (violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`,
  );
}

export const groups: NavGroup[] = [
  {
    id: "work",
    label: "Робота",
    items: [
      { id: "structure", label: "Структура", href: "#/structure", icon: <svg viewBox="0 0 16 16" /> },
      { id: "graph", label: "Граф", href: "#/graph", icon: <svg viewBox="0 0 16 16" />, badge: "3" },
      { id: "data", label: "Дані", href: "#/data", icon: <svg viewBox="0 0 16 16" /> },
    ],
  },
];

/** Повна композиція каркаса з усіма слотами — та сама, що в демонстраційних екранах. */
export function FullShell(props: Partial<WorkspaceLayoutProps> & { readonly inspectorOpen?: boolean }) {
  return (
    <AppShell
      sidebar={
        <AppSidebar
          brand={{ name: "IndeX" }}
          groups={groups}
          activeItemId="graph"
          roleContext={{ label: "Роль", value: "Оператор" }}
          user={{ name: "Оператор Демо", role: "Черговий", initials: "ОД" }}
        />
      }
    >
      <WorkspaceLayout
        header={<WorkspaceHeader title="Граф" breadcrumbs={[{ label: "Графи", href: "#/graph" }, { label: "Бригада 1" }]} />}
        contextLabel="Бібліотека"
        contextPanel={
          <ContextPanel title="Бібліотека" search={{ label: "Пошук", value: "", onChange: () => undefined }}>
            <button type="button">Елемент бібліотеки</button>
          </ContextPanel>
        }
        inspectorLabel="Властивості"
        inspector={
          <InspectorPanel title="Нода" actions={<button type="button">Застосувати</button>}>
            <button type="button">Поле інспектора</button>
          </InspectorPanel>
        }
        {...props}
      >
        {props.children ?? (
          <WorkspaceSurface variant="canvas" label="Полотно">
            <button type="button">Об'єкт на полотні</button>
          </WorkspaceSurface>
        )}
      </WorkspaceLayout>
    </AppShell>
  );
}
