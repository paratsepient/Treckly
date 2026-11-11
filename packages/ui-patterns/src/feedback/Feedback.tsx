"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Icon, IconButton } from "@index/ui";

export type FeedbackTone = "saving" | "success" | "info" | "warning" | "error";

export interface FeedbackAction {
  readonly label: string;
  readonly onAction: () => void;
}

export interface FeedbackMessage {
  /**
   * Ключ дедуплікації. Повідомлення з тим самим ключем замінює попереднє,
   * тож «Збереження…» → «Збережено» не накопичуються, а два контейнери,
   * що повідомляють про ту саму подію, не показують її двічі.
   */
  readonly key: string;
  readonly tone: FeedbackTone;
  readonly title: string;
  readonly description?: string;
  /** Повторна спроба або інша дія, доречна для цього повідомлення. */
  readonly action?: FeedbackAction;
  /** Мс до автозакриття; null — тримати до закриття. За замовчуванням залежить від tone. */
  readonly duration?: number | null;
}

interface FeedbackContextValue {
  readonly notify: (message: FeedbackMessage) => void;
  readonly dismiss: (key: string) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);
const FeedbackItemsContext = createContext<readonly FeedbackMessage[]>([]);

/** Помилки й повідомлення з дією не зникають самі: користувач має встигнути відреагувати. */
const DEFAULT_DURATION: Record<FeedbackTone, number | null> = {
  saving: null,
  success: 5000,
  info: 6000,
  warning: 8000,
  error: null,
};

/** Більше трьох одночасних повідомлень перекривають роботу; старші витісняються. */
export const MAX_VISIBLE_FEEDBACK = 3;

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (context === null) {
    throw new Error("useFeedback використовується лише всередині AppShell (FeedbackProvider).");
  }
  return context;
}

/**
 * Те саме, що useFeedback, але без вимоги провайдера: патерни, які можна вбудувати
 * поза AppShell (таблиця полів у Playground чи тестах), повідомляють, лише коли шар є.
 */
export function useOptionalFeedback(): FeedbackContextValue | null {
  return useContext(FeedbackContext);
}

export function FeedbackProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly FeedbackMessage[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((key: string) => {
    const timer = timers.current.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(key);
    }
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const notify = useCallback(
    (message: FeedbackMessage) => {
      const previous = timers.current.get(message.key);
      if (previous !== undefined) {
        clearTimeout(previous);
        timers.current.delete(message.key);
      }
      setItems((current) => [...current.filter((item) => item.key !== message.key), message].slice(-MAX_VISIBLE_FEEDBACK));
      const duration = message.duration !== undefined ? message.duration : message.action ? null : DEFAULT_DURATION[message.tone];
      if (duration !== null) {
        timers.current.set(
          message.key,
          setTimeout(() => dismiss(message.key), duration),
        );
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) clearTimeout(timer);
      active.clear();
    };
  }, []);

  const api = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <FeedbackContext.Provider value={api}>
      <FeedbackItemsContext.Provider value={items}>{children}</FeedbackItemsContext.Provider>
    </FeedbackContext.Provider>
  );
}

function FeedbackItem({ message }: { readonly message: FeedbackMessage }) {
  const { dismiss } = useFeedback();
  return (
    <div className="ixp-feedback__item" data-tone={message.tone}>
      <div className="ixp-feedback__text">
        <p className="ixp-feedback__title">{message.title}</p>
        {message.description ? <p className="ixp-feedback__description">{message.description}</p> : null}
      </div>
      {message.action ? (
        <Button
          onClick={() => {
            message.action?.onAction();
          }}
        >
          {message.action.label}
        </Button>
      ) : null}
      {message.tone === "saving" ? null : (
        <IconButton
          label="Закрити повідомлення"
          showTooltip={false}
          icon={<Icon name="close" />}
          onClick={() => dismiss(message.key)}
        />
      )}
    </div>
  );
}

/**
 * Єдиний шар повідомлень застосунку. Рендерить AppShell — один раз.
 * Live-регіони існують постійно (порожні), бо зчитувачі пропускають
 * повідомлення, додані разом із самим регіоном.
 * Помилки й попередження — assertive, решта — polite.
 */
export function FeedbackLayer() {
  const items = useContext(FeedbackItemsContext);
  const urgent = items.filter((item) => item.tone === "error" || item.tone === "warning");
  const polite = items.filter((item) => !(item.tone === "error" || item.tone === "warning"));
  return (
    <section className="ixp-feedback" aria-label="Сповіщення">
      <div aria-live="assertive" aria-atomic="false" className="ixp-feedback__stack">
        {urgent.map((message) => (
          <FeedbackItem key={message.key} message={message} />
        ))}
      </div>
      <div aria-live="polite" aria-atomic="false" className="ixp-feedback__stack">
        {polite.map((message) => (
          <FeedbackItem key={message.key} message={message} />
        ))}
      </div>
    </section>
  );
}
