import { Icon, type IconName } from "@index/ui";
import type { TrackStep, TrackStepState } from "@dsp/domain";
import { formatDateShort, formatDays } from "../lib/format.ts";

export interface TrackLevel {
  readonly level: number;
  readonly name: string;
}

export interface TrackProps {
  readonly steps: readonly TrackStep[];
  /** Назви рівнів (налаштування: посади на рівнях 2–3 можуть змінитись). */
  readonly levels: readonly TrackLevel[];
  /** Примітка повернення: показується на рівні, який повернув заявку. */
  readonly returned?: { readonly level: number; readonly note: string } | null;
  readonly label?: string;
}

const STATE_TEXT: Record<TrackStepState, string> = {
  done: "Пройдено",
  current: "Зараз тут",
  pending: "Попереду",
  returned: "Повернуто",
};

/** Стан передається іконкою й текстом, а не лише кольором. */
const STATE_ICON: Record<TrackStepState, IconName | null> = {
  done: "success",
  current: "loading",
  // Майбутній рівень — проста крапка: іконка зі стану «порожньо» читалась би як пошта.
  pending: null,
  returned: "warning",
};

/**
 * Трек 5 рівнів: де зараз заявка і скільки днів вона там. Нумерований список, поточний
 * крок має `aria-current="step"`. Повернення показане каскадом: усі рівні від 1 до того,
 * що повернув, позначені «Повернуто», а на ньому видно примітку.
 */
export function Track({ steps, levels, returned = null, label = "Трек заявки за рівнями погодження" }: TrackProps) {
  return (
    <ol className="track" aria-label={label}>
      {steps.map((step) => {
        const name = levels.find((l) => l.level === step.level)?.name ?? `Рівень ${step.level}`;
        const origin = returned?.level === step.level;
        return (
          <li key={step.level} className="track__step" data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
            <span className="track__marker" aria-hidden="true">
              {STATE_ICON[step.state] ? <Icon name={STATE_ICON[step.state] as IconName} size={16} /> : <span className="track__dot" />}
            </span>
            <div className="track__body">
              <p className="track__title">
                <span className="track__level">{step.level}</span> {name}
              </p>
              <p className="track__state">
                {STATE_TEXT[step.state]}
                {step.inList ? " · у денному переліку, чекає погодження керівника" : ""}
                {origin ? " · повернув цей рівень" : ""}
              </p>
              {step.enteredOn ? (
                <p className="track__meta">
                  З {formatDateShort(step.enteredOn)}
                  {step.daysAtLevel !== null ? ` · ${formatDays(step.daysAtLevel)}` : ""}
                </p>
              ) : null}
              {step.sedoNumber !== null ? <p className="track__meta">СЕДО № {step.sedoNumber}</p> : null}
              {origin ? <blockquote className="track__note">{returned.note}</blockquote> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
