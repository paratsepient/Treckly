/**
 * Середовище DOM для тестів у Node. Імпортується першим у кожному тестовому файлі.
 *
 * jsdom не реалізує matchMedia, ResizeObserver і HTMLDialogElement.showModal.
 * Нижче — мінімальні заміни лише тієї поведінки, на яку спираються компоненти:
 * matchMedia(min-width) з керованою шириною та showModal/close, що ставлять
 * атрибут open, фокусують перший елемент і надсилають подію close.
 * Справжню модальність (inert, top layer) перевірено в браузері, не тут.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html lang="uk"><head><title>IndeX patterns tests</title></head><body></body></html>', {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const window = dom.window;

for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get: () => (window as unknown as Record<string, unknown>)[key],
  });
}
Object.defineProperty(globalThis, "window", { configurable: true, value: window });
Object.defineProperty(globalThis, "document", { configurable: true, value: window.document });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: window.navigator });
(globalThis as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true;

interface FakeMediaQueryList {
  readonly media: string;
  readonly matches: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

let viewportWidth = 1440;
const mediaListeners = new Set<() => void>();

function matchMedia(query: string): FakeMediaQueryList {
  const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
  return {
    media: query,
    get matches() {
      return viewportWidth >= min;
    },
    addEventListener: (_type, listener) => mediaListeners.add(listener),
    removeEventListener: (_type, listener) => mediaListeners.delete(listener),
  };
}

Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
Object.defineProperty(window, "innerWidth", { configurable: true, get: () => viewportWidth });

/** Змінює ширину viewport і сповіщає підписників, як браузер при перетині меж. */
export function setViewportWidthRaw(width: number): void {
  viewportWidth = width;
  for (const listener of [...mediaListeners]) listener();
}

const FOCUSABLE = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

const dialogProto = window.HTMLDialogElement.prototype as unknown as {
  showModal: (this: HTMLDialogElement) => void;
  close: (this: HTMLDialogElement) => void;
};
dialogProto.showModal = function showModal() {
  this.setAttribute("open", "");
  this.querySelector<HTMLElement>(FOCUSABLE)?.focus();
};
dialogProto.close = function close() {
  if (!this.hasAttribute("open")) return;
  this.removeAttribute("open");
  this.dispatchEvent(new window.Event("close"));
};
