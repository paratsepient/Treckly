"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cx } from "../internal/class-names.ts";
import { FocusPulse } from "../internal/FocusPulse.tsx";
import { measureFolderOutline } from "./folder-outline.ts";

interface TabsContextValue {
  readonly baseId: string;
  readonly value: string;
  readonly activation: "automatic" | "manual";
  readonly select: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (context === null) {
    throw new Error(`${component} використовується лише всередині Tabs.`);
  }
  return context;
}

/** Id будуються з value, тому вкладка й панель зв'язуються без реєстрації в контексті. */
const tabId = (base: string, value: string): string => `${base}-tab-${value}`;
const panelId = (base: string, value: string): string => `${base}-panel-${value}`;

/** Або контрольований режим (value), або неконтрольований (defaultValue): вибрана вкладка існує завжди. */
type TabsValueProps =
  | { readonly value: string; readonly defaultValue?: undefined }
  | { readonly value?: undefined; readonly defaultValue: string };

export type TabsProps = TabsValueProps & {
  readonly onValueChange?: (value: string) => void;
  /**
   * `automatic` — вкладка вибирається при переході стрілками (APG, коли панелі легкі).
   * `manual` — стрілки лише переміщують фокус, вибір через Enter/Space (важкі панелі).
   */
  readonly activation?: "automatic" | "manual";
  readonly className?: string;
  readonly children: ReactNode;
};

export function Tabs({ value, defaultValue, onValueChange, activation = "automatic", className, children }: TabsProps) {
  const baseId = `ix-${useId()}`;
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;

  const select = (next: string): void => {
    if (value === undefined) {
      setInner(next);
    }
    if (next !== current) {
      onValueChange?.(next);
    }
  };

  const rootRef = useRef<HTMLDivElement | null>(null);
  const outlineRef = useRef<SVGSVGElement | null>(null);
  const glowId = `${baseId.replace(/[^a-zA-Z0-9-]/g, "")}-glow`;

  // Контур «папки» стежить за розміром вкладок і панелі, прокруткою списку й вибором.
  useEffect(() => {
    const root = rootRef.current;
    const outline = outlineRef.current;
    if (!root || !outline) return;
    // Розмиття — з токенів (--ix-focus-glow-blur, --ix-focus-pulse-blur): stdDeviation = b / 2,
    // як у box-shadow; ширину смуг задає CSS (focus.css).
    const style = getComputedStyle(outline);
    for (const [id, token] of [["band", "--ix-focus-glow-blur"], ["halo", "--ix-focus-pulse-blur"]] as const) {
      const blur = Number.parseFloat(style.getPropertyValue(token)) || 0;
      outline.querySelector(`#${glowId}-${id} feGaussianBlur`)?.setAttribute("stdDeviation", String(blur / 2));
    }
    const update = () => {
      const d = measureFolderOutline(root);
      for (const path of outline.querySelectorAll("path")) path.setAttribute("d", d);
    };
    update();
    const list = root.querySelector<HTMLElement>(':scope > [role="tablist"]');
    list?.addEventListener("scroll", update, { passive: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resize?.observe(root);
    for (const element of root.querySelectorAll(':scope > [role="tablist"] > [role="tab"], :scope > [role="tabpanel"]')) resize?.observe(element);
    return () => {
      list?.removeEventListener("scroll", update);
      resize?.disconnect();
    };
  }, [current]);

  return (
    <TabsContext.Provider value={{ baseId, value: current, activation, select }}>
      {/* data-pulse-group: «папка» підсвічується цілою, коли у фокусі вибрана вкладка (focus.css). */}
      <div ref={rootRef} className={cx("ix-tabs", className)} data-pulse-group="">
        {children}
        {/*
         * Світіння фокуса «папки» — один шар по контуру вкладки, вигинів і панелі: смуга й
         * ореол тих самих розмірів, що в --ix-focus-pulse-shadow. Лежить під фігурами, тож
         * видно лише зовнішній край.
         */}
        <svg ref={outlineRef} className="ix-focus-pulse__outline" aria-hidden="true" focusable="false">
          <defs>
            <filter id={`${glowId}-band`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0" />
            </filter>
            <filter id={`${glowId}-halo`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0" />
            </filter>
          </defs>
          <path d="" className="ix-focus-pulse__halo" filter={`url(#${glowId}-halo)`} />
          <path d="" className="ix-focus-pulse__band" filter={`url(#${glowId}-band)`} />
        </svg>
      </div>
    </TabsContext.Provider>
  );
}

export interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  /** Назва набору вкладок для зчитувача, якщо поруч немає видимого заголовка. */
  readonly "aria-label"?: string;
  /**
   * Лише вигляд: folder (за замовчуванням) — «папки»: вибрана вкладка зливається з панеллю
   * вмісту, решта — компактні пігулки; line — підкреслення; segmented — піднята вкладка в треку.
   */
  readonly variant?: "line" | "segmented" | "folder";
}

/**
 * Список вкладок із «roving tabindex»: у Tab-послідовності лише вибрана вкладка,
 * між вкладками рухаються стрілками, Home/End — до крайніх. Неактивні пропускаються.
 */
export function TabList({ className, onKeyDown, children, variant = "folder", ...rest }: TabListProps) {
  const tabs = useTabs("TabList");

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    const index = items.findIndex((item) => item === document.activeElement);
    if (index === -1 || items.length === 0) {
      return;
    }
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % items.length,
      ArrowLeft: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    const nextIndex = targets[event.key];
    if (nextIndex === undefined) {
      return;
    }
    event.preventDefault();
    const next = items[nextIndex];
    next?.focus();
    const nextValue = next?.dataset["value"];
    if (tabs.activation === "automatic" && nextValue !== undefined) {
      tabs.select(nextValue);
    }
  };

  return (
    <div
      {...rest}
      role="tablist"
      aria-orientation="horizontal"
      data-variant={variant}
      // Лише «папка»: вибрана вкладка й панель — одна фігура, тож і світіння фокуса спільне.
      data-pulse-links={variant === "folder" ? "" : undefined}
      className={cx("ix-tabs__list", className)}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

export interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "type"> {
  readonly value: string;
}

export function Tab({ value, className, onClick, children, ...rest }: TabProps) {
  const tabs = useTabs("Tab");
  const selected = tabs.value === value;
  return (
    <button
      {...rest}
      type="button"
      role="tab"
      id={tabId(tabs.baseId, value)}
      data-value={value}
      aria-selected={selected}
      data-pulse-trigger={selected ? "" : undefined}
      aria-controls={panelId(tabs.baseId, value)}
      tabIndex={selected ? 0 : -1}
      className={cx("ix-tabs__tab", "ix-focus-pulse", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          tabs.select(value);
        }
      }}
    >
      {children}
      <FocusPulse />
    </button>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  readonly value: string;
}

/**
 * Панель у Tab-послідовності (tabIndex 0), щоб з вкладки можна було перейти
 * до вмісту навіть якщо всередині немає фокусованих елементів.
 * Невибрані панелі не рендеряться: їхній вміст не потрапляє ні в Tab, ні в зчитувач.
 */
export function TabPanel({ value, className, children, ...rest }: TabPanelProps) {
  const tabs = useTabs("TabPanel");
  const selected = tabs.value === value;
  return (
    <div
      {...rest}
      role="tabpanel"
      id={panelId(tabs.baseId, value)}
      aria-labelledby={tabId(tabs.baseId, value)}
      tabIndex={0}
      hidden={!selected}
      data-pulse-link=""
      className={cx("ix-tabs__panel", className)}
    >
      {selected ? children : null}
    </div>
  );
}
