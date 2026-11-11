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
