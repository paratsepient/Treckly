import { useEffect, useState, type RefObject } from "react";

/**
 * Скільки рядків таблиці вміщується від верху блоку до низу вікна: таблиця тягнеться на весь
 * екран, а місце під даними добирають порожні рядки (як аркуш). Висота рядка береться з першого
 * рядка таблиці, інакше — типова.
 */
export function useFillRows(ref: RefObject<HTMLElement | null>, bottomGap = 48, fallbackRow = 44): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      const header = element.querySelector("thead")?.getBoundingClientRect().height ?? fallbackRow;
      const row = element.querySelector("tbody tr")?.getBoundingClientRect().height || fallbackRow;
      const free = window.innerHeight - top - header - bottomGap;
      setCount(Math.max(0, Math.floor(free / row)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, bottomGap, fallbackRow]);
  return count;
}
