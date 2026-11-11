import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";

const mounted = new Set<() => void>();

export function cleanup(): void {
  for (const unmount of [...mounted]) unmount();
}

export interface Rendered {
  readonly container: HTMLElement;
  readonly unmount: () => void;
}

export function render(ui: ReactNode): Rendered {
  cleanup();
  const container = document.createElement("div");
  document.body.append(container);
  let root: Root | undefined;
  act(() => {
    root = createRoot(container);
    // У застосунку вміст завжди всередині <main>; без нього axe скаржиться на відсутність ландмарка.
    root.render(<main>{ui}</main>);
  });
  const unmount = (): void => {
    if (!mounted.delete(unmount)) return;
    act(() => root?.unmount());
    container.remove();
  };
  mounted.add(unmount);
  return { container, unmount };
}

export function click(element: Element): void {
  act(() => {
    (element as HTMLElement).click();
  });
}

/** Порушення доступності за axe (контраст перевіряється в браузері: jsdom не рахує кольори). */
export async function axeViolations(element: Element): Promise<string[]> {
  const result = await axe.run(element, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`);
}

/** Вводить значення в керований React-елемент так, як це робить користувач. */
export function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  act(() => {
    setter?.call(element, value);
    // Подія має бути з вікна jsdom, а не глобальна Node-івська: jsdom інших не приймає.
    const view = element.ownerDocument.defaultView as (Window & typeof globalThis) | null;
    element.dispatchEvent(new (view?.Event ?? Event)("input", { bubbles: true }));
  });
}
