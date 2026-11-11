import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";

export interface Rendered {
  readonly container: HTMLDivElement;
  readonly rerender: (ui: ReactNode) => void;
  readonly unmount: () => void;
}

export function render(ui: ReactNode): Rendered {
  const container = document.createElement("div");
  document.body.append(container);
  let root: Root | undefined;
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  return {
    container,
    rerender: (next) => act(() => root?.render(next)),
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
}

export function click(element: Element): void {
  act(() => {
    (element as HTMLElement).click();
  });
}

/**
 * Фокус «з клавіатури». jsdom, як і браузер, не вважає фокус :focus-visible,
 * якщо остання взаємодія була кліком; клавіша Tab перед фокусом це моделює.
 */
export function focus(element: Element): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    (element as HTMLElement).focus();
  });
}

export function blur(element: Element): void {
  act(() => {
    (element as HTMLElement).blur();
  });
}

export function keyDown(element: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

/** React синтезує onPointerEnter/Leave з pointerover/pointerout. */
export function pointer(element: Element, type: "pointerover" | "pointerout", relatedTarget: Element | null = null): void {
  act(() => {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }));
  });
}

export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

export function byRole<T extends Element = HTMLElement>(container: ParentNode, role: string): T[] {
  return Array.from(container.querySelectorAll<T & Element>(`[role="${role}"]`)) as T[];
}

/**
 * Запускає axe-core для фрагмента. color-contrast вимкнено, бо jsdom не має
 * рендерингу; контраст перевіряє валідатор @index/design-tokens.
 */
export async function axeViolations(element: Element): Promise<string[]> {
  const result = await axe.run(element, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  return result.violations.map(
    (violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`,
  );
}
