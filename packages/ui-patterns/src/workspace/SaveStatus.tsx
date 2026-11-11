"use client";

import { Button } from "@index/ui";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SaveStatusProps {
  readonly state: SaveState;
  /** Час останнього збереження для стану saved, уже відформатований споживачем. */
  readonly savedAt?: string;
  /** Повторна спроба для стану error. */
  readonly onRetry?: () => void;
}

const TEXT: Record<Exclude<SaveState, "idle">, string> = {
  dirty: "Є незбережені зміни",
  saving: "Збереження…",
  saved: "Збережено",
  error: "Не вдалося зберегти",
};

/**
 * Єдиний індикатор стану збереження для всіх редакторів.
 * role="status" оголошує зміну стану ввічливо, без переривання роботи.
 * Сам механізм збереження належить редактору; тут лише відображення.
 */
export function SaveStatus({ state, savedAt, onRetry }: SaveStatusProps) {
  if (state === "idle") {
    return <span role="status" className="ixp-save-status" data-state="idle" />;
  }
  const text = state === "saved" && savedAt ? `${TEXT.saved} о ${savedAt}` : TEXT[state];
  return (
    <span role="status" className="ixp-save-status" data-state={state}>
      <span className="ixp-save-status__dot" aria-hidden="true" />
      <span className="ixp-save-status__text">{text}</span>
      {state === "error" && onRetry ? <Button variant="ghost" onClick={onRetry}>Повторити</Button> : null}
    </span>
  );
}
