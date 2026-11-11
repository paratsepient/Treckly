/**
 * Середовище DOM для тестів у Node. Імпортується першим у кожному тестовому файлі:
 * React DOM і axe-core читають window/document під час завантаження модуля.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html lang=\"uk\"><head><title>IndeX UI tests</title></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

const target = globalThis as Record<string, unknown>;

// Копіюємо лише відсутні глобали: власні глобали Node (setTimeout, URL, console) мають лишитися.
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) {
    continue;
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get: () => (dom.window as unknown as Record<string, unknown>)[key],
  });
}

Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

// React вимагає цей прапорець, щоб act() коректно синхронізував оновлення.
target["IS_REACT_ACT_ENVIRONMENT"] = true;
